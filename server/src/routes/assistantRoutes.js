const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { logAudit } = require('../services/audit');

// Helper: Format 12-hour time
function format12Hr(time24) {
  if (!time24 || time24 === '--:--:--' || time24 === '--:--') return '--:--';
  const parts = String(time24).split(':');
  if (parts.length < 2) return time24;
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  if (isNaN(h)) return time24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
}

// Helper: Normalize and parse date strings
function parseDateStrings(input) {
  if (!input || typeof input !== 'string') return null;
  const text = input.trim();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const lower = text.toLowerCase();

  // Keyword checks
  if (lower.includes('today') || lower.includes('aaj')) {
    return { startDate: todayStr, endDate: todayStr };
  }
  if (lower.includes('tomorrow') || lower.includes('kal')) {
    return { startDate: tomorrowStr, endDate: tomorrowStr };
  }

  // Regex patterns
  // 1. YYYY-MM-DD to YYYY-MM-DD (or with 'se', 'and', '-')
  const isoRangeMatch = text.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|se|until|till|-|and)\s*(\d{4}-\d{2}-\d{2})/i);
  if (isoRangeMatch) {
    return { startDate: isoRangeMatch[1], endDate: isoRangeMatch[2] };
  }

  // 2. Single YYYY-MM-DD
  const singleIsoMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (singleIsoMatch) {
    return { startDate: singleIsoMatch[1], endDate: singleIsoMatch[1] };
  }

  // 3. DD-MM-YYYY or DD/MM/YYYY range
  const dmyRangeMatch = text.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s*(?:to|se|until|till|-|and)\s*(\d{1,2})[-/](\d{1,2})[-/](\d{4})/i);
  if (dmyRangeMatch) {
    const sDate = `${dmyRangeMatch[3]}-${String(dmyRangeMatch[2]).padStart(2, '0')}-${String(dmyRangeMatch[1]).padStart(2, '0')}`;
    const eDate = `${dmyRangeMatch[6]}-${String(dmyRangeMatch[5]).padStart(2, '0')}-${String(dmyRangeMatch[4]).padStart(2, '0')}`;
    return { startDate: sDate, endDate: eDate };
  }

  // 4. Single DD-MM-YYYY or DD/MM/YYYY
  const singleDmyMatch = text.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (singleDmyMatch) {
    const sDate = `${singleDmyMatch[3]}-${String(singleDmyMatch[2]).padStart(2, '0')}-${String(singleDmyMatch[1]).padStart(2, '0')}`;
    return { startDate: sDate, endDate: sDate };
  }

  return null;
}

// Calculate working days for leave (excluding weekly off and holidays)
function calculateLeaveDays(companyId, employeeId, startDate, endDate) {
  let offDays = ['Sunday'];
  if (employeeId) {
    const empW = db.prepare(`
      SELECT w.off_days_json 
      FROM employees e
      LEFT JOIN weekly_off_settings w ON e.weekly_off_id = w.id
      WHERE e.id = ?
    `).get(employeeId);
    if (empW && empW.off_days_json) {
      try { offDays = JSON.parse(empW.off_days_json); } catch (e) {}
    } else {
      const masterW = db.prepare('SELECT off_days_json FROM weekly_off_settings WHERE company_id = ? AND is_default = 1').get(companyId);
      if (masterW && masterW.off_days_json) {
        try { offDays = JSON.parse(masterW.off_days_json); } catch (e) {}
      }
    }
  }

  const holidays = db.prepare(`
    SELECT holiday_date FROM holidays
    WHERE company_id = ? AND holiday_date BETWEEN ? AND ?
  `).all(companyId, startDate, endDate).map(h => h.holiday_date);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const cur = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  let workingDaysCount = 0;

  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const dayName = dayNames[cur.getDay()];
    const isWO = offDays.includes(dayName);
    const isHoliday = holidays.includes(dateStr);

    if (!isWO && !isHoliday) {
      workingDaysCount++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return workingDaysCount > 0 ? workingDaysCount : 1;
}

/**
 * POST /api/assistant/chat
 * Primary conversation endpoint for PIHU AI Assistant
 */
router.post('/chat', verifyAuth, async (req, res) => {
  const { message, conversationState = {} } = req.body;
  const user = req.user;
  const rawMsg = (message || '').trim();
  const lowerMsg = rawMsg.toLowerCase();

  const companyId = user.company_id || (user.company ? user.company.id : null);
  const employeeId = user.employee_id;
  const role = user.role_name || user.role;

  // 1. Strict Confidentiality & Security Guardrails
  const confidentialPatterns = [
    /password/i, /hash/i, /secret/i, /private[_\s]key/i,
    /api[_\s]key/i, /service[_\s]account/i, /token/i, /salary/i,
    /bank[_\s]account/i, /credentials/i, /auth[_\s]code/i
  ];

  const isAskingConfidential = confidentialPatterns.some(pat => pat.test(lowerMsg));
  if (isAskingConfidential) {
    if (lowerMsg.includes('password') || lowerMsg.includes('hash') || lowerMsg.includes('secret') || lowerMsg.includes('key') || lowerMsg.includes('salary') || lowerMsg.includes('credential')) {
      return res.json({
        reply: "🔒 **Confidentiality Protection**: I am programmed to strictly safeguard system credentials, passwords, financial data, and personal employee privacy. I cannot display or disclose confidential records.",
        action: null,
        conversationState: {}
      });
    }
  }

  // 2. Conversational Action Flow: LEAVE APPLICATION
  const leaveKeywords = ['apply leave', 'apply my leave', 'chutti', 'leave chahiye', 'take leave', 'leave request', 'need leave', 'chhutti'];
  const wantsLeave = leaveKeywords.some(kw => lowerMsg.includes(kw));

  let activeState = conversationState.actionState || null;

  if (wantsLeave && !activeState && role === 'employee') {
    const datesFound = parseDateStrings(rawMsg);
    if (datesFound) {
      let reasonText = rawMsg.replace(/apply|my|leave|for|from|to|till|se|tak|\d{4}-\d{2}-\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{4}/gi, '').trim();
      if (reasonText.length > 3) {
        return handleLeaveSubmission(req, res, user, companyId, employeeId, datesFound.startDate, datesFound.endDate, reasonText);
      } else {
        return res.json({
          reply: `Sure! Maine aapki leave dates note kar li hain:\n📅 **From**: ${datesFound.startDate} **To**: ${datesFound.endDate}\n\nKripya leave ka **reason** batayein (e.g. *Urgent personal work*, *Fever*, ya *Family function*)?`,
          action: 'LEAVE_APPLICATION',
          conversationState: {
            actionState: 'AWAITING_LEAVE_REASON',
            startDate: datesFound.startDate,
            endDate: datesFound.endDate
          }
        });
      }
    }

    return res.json({
      reply: "Sure! Main aapki leave application process karne mein help kar sakti hoon. 🌸\n\n**Kab se kab tak leave chahiye?**\n(Kripya start date aur end date batayein, jaise `2026-09-22 to 2026-09-24` ya `tomorrow`).",
      action: 'LEAVE_APPLICATION',
      conversationState: {
        actionState: 'AWAITING_LEAVE_DATES'
      }
    });
  }

  // Step 2: In state AWAITING_LEAVE_DATES
  if (activeState === 'AWAITING_LEAVE_DATES') {
    if (lowerMsg.includes('cancel') || lowerMsg.includes('nahi') || lowerMsg.includes('stop')) {
      return res.json({
        reply: "Theek hai, maine leave application cancel kar di hai. Aur koi help chahiye to batayein!",
        action: null,
        conversationState: {}
      });
    }

    const parsedDates = parseDateStrings(rawMsg);
    if (!parsedDates) {
      return res.json({
        reply: "Kripya valid dates batayein jaise: `2026-09-22 to 2026-09-23`, `tomorrow`, ya `today`.\n(Ya leave cancel karne ke liye 'cancel' likhein).",
        action: 'LEAVE_APPLICATION',
        conversationState: conversationState
      });
    }

    return res.json({
      reply: `Dates recorded:\n📅 **From**: ${parsedDates.startDate}\n📅 **To**: ${parsedDates.endDate}\n\nAb kripya leave ka **reason** (karan) batayein?`,
      action: 'LEAVE_APPLICATION',
      conversationState: {
        actionState: 'AWAITING_LEAVE_REASON',
        startDate: parsedDates.startDate,
        endDate: parsedDates.endDate
      }
    });
  }

  // Step 3: In state AWAITING_LEAVE_REASON
  if (activeState === 'AWAITING_LEAVE_REASON') {
    if (lowerMsg.includes('cancel') || lowerMsg.includes('stop')) {
      return res.json({
        reply: "Theek hai, leave request cancel kar di gayi hai.",
        action: null,
        conversationState: {}
      });
    }

    const reason = rawMsg.trim();
    if (reason.length < 2) {
      return res.json({
        reply: "Kripya leave ka thoda reason batayein (e.g., *Personal work*, *Family event*, *Medical rest*).",
        action: 'LEAVE_APPLICATION',
        conversationState: conversationState
      });
    }

    const sDate = conversationState.startDate;
    const eDate = conversationState.endDate;
    return handleLeaveSubmission(req, res, user, companyId, employeeId, sDate, eDate, reason);
  }

  // 3. Contextual Data Analysis by Role

  // -------------------------------------------------------------
  // A. EMPLOYEE INTENTS
  // -------------------------------------------------------------
  if (role === 'employee') {
    // 1. Attendance & Punch Status Query
    if (lowerMsg.includes('punch') || lowerMsg.includes('attendance') || lowerMsg.includes('present') || lowerMsg.includes('in time') || lowerMsg.includes('aaj ka') || lowerMsg.includes('status')) {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayRecord = db.prepare(`
        SELECT * FROM attendance_records 
        WHERE employee_id = ? AND date = ?
      `).get(employeeId, todayStr);

      if (!todayRecord || (!todayRecord.punch_in_time && !todayRecord.punch_out_time)) {
        return res.json({
          reply: `📅 **Today's Attendance (${todayStr})**:\n\nAapne aaj abhi tak punch-in nahi kiya hai.\nKripya panel ke main punch button se verified GPS ke sath **Punch-In** karein! ⏱️`,
          action: 'VIEW_PUNCH'
        });
      }

      const inTime = todayRecord.punch_in_time ? format12Hr(todayRecord.punch_in_time) : '--:--';
      const outTime = todayRecord.punch_out_time ? format12Hr(todayRecord.punch_out_time) : 'Not Punched Out Yet';
      const inLoc = todayRecord.punch_in_location || 'GPS Verified Site';
      const outLoc = todayRecord.punch_out_location || '--';
      const hours = todayRecord.total_hours || (todayRecord.punch_in_time && !todayRecord.punch_out_time ? 'In Progress' : '0.0');
      const attStatus = todayRecord.status || 'Present';

      return res.json({
        reply: `📊 **Aapka Aaj Ka Attendance Summary (${todayStr})**:\n\n` +
          `• **Status**: \`${attStatus}\`\n` +
          `• **Punch-In Time**: ${inTime}\n` +
          `• **Punch-In Location**: ${inLoc}\n` +
          `• **Punch-Out Time**: ${outTime}\n` +
          (todayRecord.punch_out_time ? `• **Punch-Out Location**: ${outLoc}\n` : '') +
          `• **Working Hours**: ${hours} hrs\n\n` +
          (!todayRecord.punch_out_time ? `💡 *Dhyan rahe: Jab shift complete ho jaye, manually "PUNCH OUT" button par click karein.*` : `✅ *Shift complete successfully!*`),
        action: 'ATTENDANCE_SUMMARY'
      });
    }

    // 2. Leave Balance Query
    if (lowerMsg.includes('leave balance') || lowerMsg.includes('chutti kitni') || lowerMsg.includes('balance') || lowerMsg.includes('casual leave') || lowerMsg.includes('earned leave')) {
      const currentYear = new Date().getFullYear();
      const balances = db.prepare(`
        SELECT lb.*, lt.name as leave_type_name
        FROM leave_balances lb
        JOIN leave_types lt ON lb.leave_type_id = lt.id
        WHERE lb.employee_id = ? AND lb.year = ?
        ORDER BY lt.id ASC
      `).all(employeeId, currentYear);

      if (!balances || balances.length === 0) {
        return res.json({
          reply: `Aapke pass year ${currentYear} ke liye 12 Casual Leaves (CL) aur 15 Earned Leaves (EL) policy ke mutabiq available hain.`,
          action: 'LEAVE_BALANCE'
        });
      }

      let balanceList = balances.map(b => `• **${b.leave_type_name}**: Available \`${b.balance} days\` (Used: ${b.used || 0}, Accrued: ${b.accrued || 0})`).join('\n');
      return res.json({
        reply: `🏖️ **Year ${currentYear} Leave Balances**:\n\n${balanceList}\n\nAap jab chahein mujhe *"Apply my leave"* bolkar leave apply kar sakte hain! 🌸`,
        action: 'LEAVE_BALANCE'
      });
    }

    // 3. Holidays Query
    if (lowerMsg.includes('holiday') || lowerMsg.includes('chhutti') || lowerMsg.includes('festival') || lowerMsg.includes('off day')) {
      const todayStr = new Date().toISOString().split('T')[0];
      const upcoming = db.prepare(`
        SELECT name, holiday_date, description
        FROM holidays
        WHERE company_id = ? AND holiday_date >= ?
        ORDER BY holiday_date ASC
        LIMIT 5
      `).all(companyId, todayStr);

      if (!upcoming || upcoming.length === 0) {
        return res.json({
          reply: "Is mahine me koi aage aane wali company holiday schedule nahi hai.",
          action: 'HOLIDAYS'
        });
      }

      const hList = upcoming.map(h => `• **${h.holiday_date}**: ${h.name}${h.description ? ` (${h.description})` : ''}`).join('\n');
      return res.json({
        reply: `🎉 **Aane Wali Holidays (Upcoming Holidays)**:\n\n${hList}`,
        action: 'HOLIDAYS'
      });
    }

    // 4. Shift timings
    if (lowerMsg.includes('shift') || lowerMsg.includes('timing') || lowerMsg.includes('time table')) {
      const emp = db.prepare(`
        SELECT e.*, s.name as shift_name, s.start_time, s.end_time, s.grace_time_mins, s.working_hours
        FROM employees e
        LEFT JOIN shifts s ON e.shift_id = s.id
        WHERE e.id = ?
      `).get(employeeId);

      if (emp && emp.shift_name) {
        return res.json({
          reply: `⏰ **Aapki Shift Details**:\n\n• **Shift Name**: ${emp.shift_name}\n• **Timing**: ${format12Hr(emp.start_time)} to ${format12Hr(emp.end_time)}\n• **Working Hours**: ${emp.working_hours || 8} hrs\n• **Grace Period**: ${emp.grace_time_mins || 15} minutes`,
          action: 'SHIFT_INFO'
        });
      }
      return res.json({
        reply: "Aapki default General Shift hai (09:00 AM to 06:00 PM, 8 working hours, 15 mins grace time).",
        action: 'SHIFT_INFO'
      });
    }
  }

  // -------------------------------------------------------------
  // B. MANAGER INTENTS
  // -------------------------------------------------------------
  if (role === 'manager') {
    // 1. Who is absent / present in team today
    if (lowerMsg.includes('absent') || lowerMsg.includes('kaun absent') || lowerMsg.includes('who is absent') || lowerMsg.includes('missing') || lowerMsg.includes('present') || lowerMsg.includes('team attendance') || lowerMsg.includes('team status')) {
      const todayStr = new Date().toISOString().split('T')[0];

      // Get assigned team employees
      const teamEmps = db.prepare(`
        SELECT e.id, e.employee_id as code, e.full_name, e.department
        FROM employees e
        JOIN employee_mappings em ON e.id = em.employee_id
        WHERE em.manager_id = ? AND em.company_id = ? AND e.status = 'active' AND e.is_deleted = 0
      `).all(employeeId, companyId);

      if (!teamEmps || teamEmps.length === 0) {
        return res.json({
          reply: "Aapke under abhi koi team employees mapped nahi hain. Aap 'Employee Mapping' tab se team members assign kar sakte hain.",
          action: 'TEAM_SUMMARY'
        });
      }

      const teamIds = teamEmps.map(e => e.id);
      const placeholders = teamIds.map(() => '?').join(',');
      const records = db.prepare(`
        SELECT employee_id, punch_in_time, punch_out_time, status 
        FROM attendance_records
        WHERE company_id = ? AND date = ? AND employee_id IN (${placeholders})
      `).all(companyId, todayStr, ...teamIds);

      const recordMap = new Map();
      records.forEach(r => recordMap.set(r.employee_id, r));

      const presentList = [];
      const absentList = [];

      teamEmps.forEach(emp => {
        const rec = recordMap.get(emp.id);
        if (rec && rec.punch_in_time) {
          presentList.push(`${emp.full_name} (${emp.code}) [In: ${format12Hr(rec.punch_in_time)}]`);
        } else {
          absentList.push(`${emp.full_name} (${emp.code})`);
        }
      });

      return res.json({
        reply: `👥 **Team Attendance Analysis (${todayStr})**:\n\n` +
          `• **Total Team Members**: ${teamEmps.length}\n` +
          `• **Present Today**: ${presentList.length}\n` +
          `• **Absent Today**: ${absentList.length}\n\n` +
          (absentList.length > 0 ? `🔴 **Absent Team Members**:\n${absentList.map(a => `  - ${a}`).join('\n')}\n\n` : `🎉 *Puri team present hai!*\n\n`) +
          (presentList.length > 0 ? `🟢 **Present Team Members**:\n${presentList.map(p => `  - ${p}`).join('\n')}` : ''),
        action: 'TEAM_ATTENDANCE'
      });
    }

    // 2. Pending approvals (leaves & corrections)
    if (lowerMsg.includes('pending') || lowerMsg.includes('approval') || lowerMsg.includes('approve') || lowerMsg.includes('requests')) {
      const pendingLeaves = db.prepare(`
        SELECT lr.*, e.full_name, e.employee_id as code, lt.name as leave_type
        FROM leave_requests lr
        JOIN employees e ON lr.employee_id = e.id
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        JOIN employee_mappings em ON e.id = em.employee_id
        WHERE em.manager_id = ? AND lr.company_id = ? AND lr.status = 'pending'
      `).all(employeeId, companyId);

      const pendingCorrections = db.prepare(`
        SELECT cr.*, e.full_name, e.employee_id as code
        FROM attendance_correction_requests cr
        JOIN employees e ON cr.employee_id = e.id
        JOIN employee_mappings em ON e.id = em.employee_id
        WHERE em.manager_id = ? AND cr.company_id = ? AND cr.status = 'pending'
      `).all(employeeId, companyId);

      return res.json({
        reply: `⏳ **Pending Approvals For Your Team**:\n\n` +
          `• **Pending Leave Requests**: ${pendingLeaves.length}\n` +
          `• **Pending Punch Correction Requests**: ${pendingCorrections.length}\n\n` +
          (pendingLeaves.length > 0 ? `📋 **Leave Applications**:\n` + pendingLeaves.map(l => `  - ${l.full_name} (${l.code}): ${l.leave_type} from ${l.start_date} to ${l.end_date} (${l.total_days} days) - Reason: "${l.reason}"`).join('\n') + '\n\n' : '') +
          `Aap **Approvals** tab par jaakar direct 1-click me approve ya reject kar sakte hain.`,
        action: 'VIEW_APPROVALS'
      });
    }
  }

  // -------------------------------------------------------------
  // C. COMPANY ADMIN INTENTS
  // -------------------------------------------------------------
  if (role === 'company_admin') {
    if (lowerMsg.includes('attendance') || lowerMsg.includes('present') || lowerMsg.includes('absent') || lowerMsg.includes('how many') || lowerMsg.includes('count') || lowerMsg.includes('overview') || lowerMsg.includes('stats')) {
      const todayStr = new Date().toISOString().split('T')[0];

      const totalActiveEmployees = db.prepare(`
        SELECT COUNT(*) as count FROM employees 
        WHERE company_id = ? AND status = 'active' AND is_deleted = 0
      `).get(companyId)?.count || 0;

      const todayPunches = db.prepare(`
        SELECT COUNT(*) as count FROM attendance_records
        WHERE company_id = ? AND date = ? AND punch_in_time IS NOT NULL
      `).get(companyId, todayStr)?.count || 0;

      const pendingLeaves = db.prepare(`
        SELECT COUNT(*) as count FROM leave_requests
        WHERE company_id = ? AND status = 'pending'
      `).get(companyId)?.count || 0;

      const pendingCorrections = db.prepare(`
        SELECT COUNT(*) as count FROM attendance_correction_requests
        WHERE company_id = ? AND status = 'pending'
      `).get(companyId)?.count || 0;

      const attendancePct = totalActiveEmployees > 0 ? Math.round((todayPunches / totalActiveEmployees) * 100) : 0;

      return res.json({
        reply: `🏢 **Company Live HR Overview (${todayStr})**:\n\n` +
          `• **Total Active Employees**: ${totalActiveEmployees}\n` +
          `• **Punched In Today**: ${todayPunches} (${attendancePct}% attendance rate)\n` +
          `• **Pending Leave Approvals**: ${pendingLeaves}\n` +
          `• **Pending Correction Requests**: ${pendingCorrections}\n\n` +
          `Sabhi data real-time verified GPS aur Firebase Cloud Database ke sath safely synced hai.`,
        action: 'COMPANY_OVERVIEW'
      });
    }
  }

  // -------------------------------------------------------------
  // D. SUPER ADMIN / SUPPORT INTENTS
  // -------------------------------------------------------------
  if (role === 'super_admin' || role === 'support') {
    if (lowerMsg.includes('companies') || lowerMsg.includes('stats') || lowerMsg.includes('system') || lowerMsg.includes('overview')) {
      const compCount = db.prepare('SELECT COUNT(*) as count FROM companies WHERE is_deleted = 0').get()?.count || 0;
      const empCount = db.prepare('SELECT COUNT(*) as count FROM employees WHERE is_deleted = 0').get()?.count || 0;
      const attCount = db.prepare('SELECT COUNT(*) as count FROM attendance_records').get()?.count || 0;

      return res.json({
        reply: `🌐 **NPB HRMS Global System Status**:\n\n` +
          `• **Registered Companies**: ${compCount}\n` +
          `• **Total Employees Across Platform**: ${empCount}\n` +
          `• **Total Attendance Punches Recorded**: ${attCount}\n` +
          `• **Firebase Cloud Connection**: Active & Synced\n` +
          `• **Security Protocol**: Strict 100% Tenant Isolation Enabled.`,
        action: 'SYSTEM_STATUS'
      });
    }
  }

  // -------------------------------------------------------------
  // E. GENERAL SMART ASSISTANCE
  // -------------------------------------------------------------
  if (lowerMsg.includes('hi') || lowerMsg.includes('hello') || lowerMsg.includes('hey') || lowerMsg.includes('pihu') || lowerMsg.includes('kaise ho')) {
    const greetingName = user.full_name || user.username || 'there';
    return res.json({
      reply: `Hi ${greetingName}! 🌸 Main hoon **PIHU**, aapki smart AI Assistant. Main aapke attendance status, working hours, leave balance, team analytics aur leave apply karne me turant madad kar sakti hoon.\n\nAap mujhse puchh sakte hain:\n• *"Apply my leave"*\n• *"Aaj ka attendance status"*\n• *"Mera leave balance kitna hai?"*\n• *"Upcoming holidays"*\n\nBataiye, main aapki kya madad kar sakti hoon?`,
      action: 'GREETING'
    });
  }

  // Fallback intelligent response
  return res.json({
    reply: `Main samajh rahi hoon aapka sawal: "${rawMsg}".\n\nAap mujhse live HR & attendance queries pooch sakte hain, jaise:\n1. 📅 **"Apply my leave"** (Leave apply karne ke liye)\n2. ⏰ **"Aaj ka punch status"** (In/Out time aur GPS location)\n3. 🏖️ **"Mera leave balance"** (CL aur EL check karne ke liye)\n4. 🎉 **"Upcoming holidays"** (Chhuttiyon ki list)\n5. 👥 **"Who is absent today"** (Team members status)`,
    action: 'HELP'
  });
});

// Helper: Handle final leave request submission
function handleLeaveSubmission(req, res, user, companyId, employeeId, startDate, endDate, reason) {
  try {
    const currentYear = new Date().getFullYear();

    // Find available leave type (default to Casual Leave or first with quota)
    let leaveType = db.prepare(`
      SELECT lt.id, lt.name, COALESCE(lb.balance, lt.default_yearly_quota) as balance
      FROM leave_types lt
      LEFT JOIN leave_balances lb ON lt.id = lb.leave_type_id AND lb.employee_id = ? AND lb.year = ?
      WHERE lt.company_id = ? AND lt.name NOT LIKE '%Paid Leave%'
      ORDER BY (lt.name LIKE '%Casual%' OR lt.name = 'CL') DESC, lt.id ASC
      LIMIT 1
    `).get(employeeId, currentYear, companyId);

    if (!leaveType) {
      // Create default Casual Leave if none exists
      const ins = db.prepare(`
        INSERT INTO leave_types (company_id, name, default_yearly_quota, monthly_accrual_rate, is_carry_forward, max_carry_forward)
        VALUES (?, 'Casual Leave (CL)', 12.0, 1.0, 0, 0.0)
      `).run(companyId);
      leaveType = { id: ins.lastInsertRowid, name: 'Casual Leave (CL)', balance: 12.0 };
    }

    const workingDays = calculateLeaveDays(companyId, employeeId, startDate, endDate);

    // Insert into leave_requests
    const result = db.prepare(`
      INSERT INTO leave_requests (
        company_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(companyId, employeeId, leaveType.id, startDate, endDate, workingDays, reason);

    logAudit({
      companyId,
      userId: user.id,
      userName: user.username,
      role: user.role_name || user.role,
      panel: 'PIHU AI Assistant',
      action: 'AI_LEAVE_REQUEST_SUBMITTED',
      targetEntity: 'leave_requests',
      targetId: result.lastInsertRowid,
      newValues: { startDate, endDate, workingDays, reason, leaveType: leaveType.name },
      reason: 'Employee applied for leave via PIHU AI Assistant'
    });

    return res.json({
      reply: `🎉 **Leave Request Successfully Submitted!** 🌸\n\n` +
        `• **Leave Type**: ${leaveType.name}\n` +
        `• **Start Date**: ${startDate}\n` +
        `• **End Date**: ${endDate}\n` +
        `• **Working Days**: ${workingDays} day(s)\n` +
        `• **Reason**: "${reason}"\n` +
        `• **Status**: \`Pending Approval\` ⏳\n\n` +
        `Aapki request manager / company admin approval ke liye send ho gayi hai. Jab approve hogi aapko notification mil jayega!`,
      action: 'LEAVE_SUBMITTED',
      leaveDetails: {
        id: result.lastInsertRowid,
        startDate,
        endDate,
        workingDays,
        reason,
        leaveType: leaveType.name
      },
      conversationState: {} // reset
    });
  } catch (err) {
    console.error('AI Leave submission error:', err);
    return res.status(500).json({
      reply: `Maaf kijiye, leave submit karne me error aaya: ${err.message}. Kripya "Leave" tab se manually apply karein.`,
      action: 'ERROR',
      conversationState: {}
    });
  }
}

module.exports = router;
