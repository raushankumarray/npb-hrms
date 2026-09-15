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

// Helper: Extract clean human name (STRICTLY NEVER username, phone, or email)
function getCleanDisplayName(user, isHindi) {
  if (!user) return isHindi ? 'साथी' : 'Colleague';
  let raw = user.full_name || user.fullName || '';

  // Discard if it contains email, phone number, or system codes
  if (raw.includes('@') || /^\+?[\d\s-]{7,}$/.test(raw.trim()) || /^(emp|usr|admin|user|staff)[_\d]/i.test(raw.trim())) {
    raw = '';
  }

  // Strip non-letter characters
  const clean = raw.replace(/[0-9_@.#$%&*!?/\\()\-]/g, '').trim();
  if (clean) return clean;

  const role = user.role_name || user.role;
  if (role === 'manager') return isHindi ? 'मैनेजर' : 'Manager';
  if (role === 'company_admin') return isHindi ? 'एडमिन' : 'Administrator';
  return isHindi ? 'साथी' : 'Colleague';
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

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const lower = text.toLowerCase();

  // Keyword checks
  if (lower.includes('today') || lower.includes('aaj')) {
    return { startDate: todayStr, endDate: todayStr };
  }
  if (lower.includes('tomorrow') || lower.includes('kal')) {
    return { startDate: tomorrowStr, endDate: tomorrowStr };
  }
  if (lower.includes('yesterday') || lower.includes('beeta kal')) {
    return { startDate: yesterdayStr, endDate: yesterdayStr };
  }

  // Regex patterns
  // 1. YYYY-MM-DD to YYYY-MM-DD
  const isoRangeMatch = text.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|se|until|till|-|and)\s*(\d{4}-\d{2}-\d{2})/i);
  if (isoRangeMatch) {
    return { startDate: isoRangeMatch[1], endDate: isoRangeMatch[2] };
  }

  // 2. Single YYYY-MM-DD
  const singleIsoMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (singleIsoMatch) {
    return { startDate: singleIsoMatch[1], endDate: singleIsoMatch[1] };
  }

  // 3. DD-MM-YYYY range
  const dmyRangeMatch = text.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s*(?:to|se|until|till|-|and)\s*(\d{1,2})[-/](\d{1,2})[-/](\d{4})/i);
  if (dmyRangeMatch) {
    const sDate = `${dmyRangeMatch[3]}-${String(dmyRangeMatch[2]).padStart(2, '0')}-${String(dmyRangeMatch[1]).padStart(2, '0')}`;
    const eDate = `${dmyRangeMatch[6]}-${String(dmyRangeMatch[5]).padStart(2, '0')}-${String(dmyRangeMatch[4]).padStart(2, '0')}`;
    return { startDate: sDate, endDate: eDate };
  }

  // 4. Single DD-MM-YYYY
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
 * Primary conversation endpoint for PIHU AI Assistant (Bilingual English & Hindi)
 */
router.post('/chat', verifyAuth, async (req, res) => {
  const { message, conversationState = {}, language = 'en' } = req.body;
  const user = req.user;
  const rawMsg = (message || '').trim();
  const lowerMsg = rawMsg.toLowerCase();
  const isHindi = language === 'hi';

  const companyId = user.company_id || (user.company ? user.company.id : null);
  const employeeId = user.employee_id;
  const role = user.role_name || user.role;

  // 1. Strict Confidentiality & Security Guardrails
  const confidentialPatterns = [
    /password/i, /hash/i, /secret/i, /private[_\s]key/i,
    /api[_\s]key/i, /service[_\s]account/i, /token/i, /salary/i,
    /bank[_\s]account/i, /credentials/i, /auth[_\s]code/i,
    /पासवर्ड/i, /सीक्रेट/i, /गुप्त/i, /वेतन/i
  ];

  const isAskingConfidential = confidentialPatterns.some(pat => pat.test(lowerMsg));
  if (isAskingConfidential) {
    if (lowerMsg.includes('password') || lowerMsg.includes('hash') || lowerMsg.includes('secret') || lowerMsg.includes('key') || lowerMsg.includes('salary') || lowerMsg.includes('credential') || lowerMsg.includes('पासवर्ड') || lowerMsg.includes('सीक्रेट') || lowerMsg.includes('गुप्त')) {
      return res.json({
        reply: isHindi
          ? "🔒 **गोपनीयता सुरक्षा (Confidentiality Protection)**: मैं सिस्टम क्रेडेंशियल्स, पासवर्ड, वित्तीय डेटा और कर्मचारियों की निजी जानकारी की पूर्ण सुरक्षा करती हूँ। यह गोपनीय रिकॉर्ड दिखाना वर्जित है।"
          : "🔒 **Confidentiality Protection**: I am programmed to strictly safeguard system credentials, passwords, financial data, and personal employee privacy. I cannot display or disclose confidential records.",
        action: null,
        conversationState: {}
      });
    }
  }

  let activeState = (conversationState && conversationState.actionState) ? conversationState.actionState : null;

  // Query Intent Guards (strictly prevent informational questions from triggering action modals)
  const isQuestionOrStatus = lowerMsg.includes('time') || lowerMsg.includes('kab') || lowerMsg.includes('kahan') ||
                             lowerMsg.includes('location') || lowerMsg.includes('status') || lowerMsg.includes('kya') ||
                             lowerMsg.includes('what') || lowerMsg.includes('when') || lowerMsg.includes('where') ||
                             lowerMsg.includes('history') || lowerMsg.includes('record') || lowerMsg.includes('did i') ||
                             lowerMsg.includes('hours') || lowerMsg.includes('ghante') || lowerMsg.includes('kitna') ||
                             lowerMsg.includes('check') || lowerMsg.includes('dikhao') || lowerMsg.includes('list');

  // 2. Action Flow: PUNCH IN / PUNCH OUT (Strictly Action Confirmation only)
  const isPunchInIntent = !isQuestionOrStatus && (
    lowerMsg.includes('punch in') || lowerMsg.includes('punch-in') || lowerMsg.includes('punchin') ||
    lowerMsg.includes('पंच इन') || lowerMsg.includes('mark in') || lowerMsg.includes('start shift')
  );

  const isPunchOutIntent = !isQuestionOrStatus && (
    lowerMsg.includes('punch out') || lowerMsg.includes('punch-out') || lowerMsg.includes('punchout') ||
    lowerMsg.includes('पंच आउट') || lowerMsg.includes('mark out') || lowerMsg.includes('end shift')
  );

  if (isPunchInIntent && role === 'employee') {
    return res.json({
      reply: isHindi
        ? "📍 **पंच-इन पुष्टि (Punch-In Confirmation)**:\n\nक्या आप अभी अपना **पंच-इन** दर्ज करना चाहते हैं? कृपया नीचे कन्फर्म बटन दबाएं, आपका GPS स्थान और समय सत्यापित करके दर्ज कर दिया जाएगा।"
        : "📍 **Punch-In Confirmation**:\n\nWould you like to record your **Punch-In** now? Please confirm below. Your GPS coordinates and current time will be verified and recorded.",
      action: 'PROMPT_PUNCH_IN',
      conversationState: {}
    });
  }

  if (isPunchOutIntent && role === 'employee') {
    return res.json({
      reply: isHindi
        ? "📍 **पंच-आउट पुष्टि (Punch-Out Confirmation)**:\n\nक्या आप अपनी आज की शिफ्ट का **पंच-आउट** दर्ज करना चाहते हैं? कृपया नीचे कन्फर्म बटन दबाएं।"
        : "📍 **Punch-Out Confirmation**:\n\nWould you like to record your **Punch-Out** now and complete your shift? Please confirm below.",
      action: 'PROMPT_PUNCH_OUT',
      conversationState: {}
    });
  }

  // 3. Action Flow: SUPPORT TICKET CREATION (Only when creating a ticket, not querying tickets)
  const isTicketQuery = lowerMsg.includes('status') || lowerMsg.includes('my ticket') || lowerMsg.includes('mera ticket') ||
                        lowerMsg.includes('check ticket') || lowerMsg.includes('list') || lowerMsg.includes('dikhao') ||
                        lowerMsg.includes('open ticket');
  const ticketActionKeywords = ['raise ticket', 'create ticket', 'open ticket', 'complain', 'shikayat', 'support ticket', 'help ticket', 'टिकट बनाओ', 'शिकायत दर्ज'];
  const wantsTicket = !isTicketQuery && (
    ticketActionKeywords.some(kw => lowerMsg.includes(kw)) ||
    lowerMsg === 'ticket' || lowerMsg === 'टिकट'
  );

  if (wantsTicket && !activeState) {
    return res.json({
      reply: isHindi
        ? "🎫 **सपोर्ट टिकट बनाएं (Create Support Ticket)**:\n\nकृपया अपनी समस्या का विषय या टाइटल (Title) बताएं? (जैसे: *Missing punch on Monday*, *Mobile app issue*, या *Password problem*)"
        : "🎫 **Create Support Ticket**:\n\nPlease enter the title or subject of your issue? (e.g. *Missing punch on Monday*, *Mobile device issue*, *Portal query*)",
      action: 'TICKET_CREATION',
      conversationState: {
        actionState: 'AWAITING_TICKET_TITLE'
      }
    });
  }

  if (activeState === 'AWAITING_TICKET_TITLE') {
    if (lowerMsg.includes('cancel') || lowerMsg.includes('रद्द')) {
      return res.json({
        reply: isHindi ? "ठीक है, टिकट प्रक्रिया रद्द कर दी गई है।" : "Ticket creation cancelled.",
        action: null,
        conversationState: {}
      });
    }

    const title = rawMsg;
    return res.json({
      reply: isHindi
        ? `टाइटल नोट किया: **${title}**\n\nअब कृपया इस समस्या का थोड़ा विस्तार से विवरण (Description) दें ताकि टेक्निकल सपोर्ट टीम तुरंत समाधान कर सके:`
        : `Title recorded: **${title}**\n\nPlease describe the issue in detail so our Technical Support Team can assist you:`,
      action: 'TICKET_CREATION',
      conversationState: {
        actionState: 'AWAITING_TICKET_DESC',
        ticketTitle: title
      }
    });
  }

  if (activeState === 'AWAITING_TICKET_DESC') {
    if (lowerMsg.includes('cancel') || lowerMsg.includes('रद्द')) {
      return res.json({
        reply: isHindi ? "ठीक है, टिकट प्रक्रिया रद्द कर दी गई है।" : "Ticket creation cancelled.",
        action: null,
        conversationState: {}
      });
    }

    const title = conversationState.ticketTitle || 'Assistance Request';
    const description = rawMsg;

    try {
      let finalEmpId = employeeId;
      if (!finalEmpId && user.id) {
        const empRow = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(user.id);
        if (empRow) finalEmpId = empRow.id;
      }
      if (!finalEmpId && role === 'company_admin') {
        let empRow = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(user.id);
        if (!empRow && companyId) {
          const resEmp = db.prepare(`
            INSERT INTO employees (company_id, user_id, employee_id, full_name, email, mobile, department, designation)
            VALUES (?, ?, ?, ?, ?, ?, 'Administration', 'Company Administrator')
          `).run(companyId, user.id, 'ADMIN_' + user.id, user.full_name || user.username, user.email || null, user.mobile || null);
          finalEmpId = resEmp.lastInsertRowid;
        } else if (empRow) {
          finalEmpId = empRow.id;
        }
      }

      const result = db.prepare(`
        INSERT INTO service_requests (
          company_id, employee_id, request_type, title, description,
          status, assigned_role
        ) VALUES (?, ?, 'other', ?, ?, 'pending', 'support')
      `).run(companyId, finalEmpId, title, description);

      const ticketId = result.lastInsertRowid;

      logAudit({
        companyId,
        userId: user.id,
        userName: user.username,
        role,
        panel: 'PIHU AI Assistant',
        action: 'AI_TICKET_CREATED',
        targetEntity: 'service_requests',
        targetId: ticketId,
        newValues: { title, description },
        reason: 'User created ticket via PIHU AI Assistant'
      });

      return res.json({
        reply: isHindi
          ? `🎉 **सपोर्ट टिकट सफलतापूर्वक बनाया गया!** 🎫\n\n• **टिकट ID**: \`#TKT-${ticketId}\`\n• **टाइटल**: ${title}\n• **स्थिति**: \`ओपन (Open)\`\n• **असाइन**: टेक्निकल सपोर्ट टीम\n\nहमारी सपोर्ट टीम जल्द ही आपसे संपर्क करेगी।`
          : `🎉 **Support Ticket Created Successfully!** 🎫\n\n• **Ticket ID**: \`#TKT-${ticketId}\`\n• **Title**: ${title}\n• **Status**: \`Open\`\n• **Assigned To**: Technical Support Team\n\nOur team has been notified and will resolve your issue shortly.`,
        action: 'TICKET_SUBMITTED',
        ticketDetails: { id: ticketId, title, description },
        conversationState: {}
      });
    } catch (err) {
      return res.status(500).json({
        reply: isHindi ? `टिकट बनाने में त्रुटि: ${err.message}` : `Error creating ticket: ${err.message}`,
        action: 'ERROR',
        conversationState: {}
      });
    }
  }

  // 4. Action Flow: ATTENDANCE CORRECTION (Action flow only, not status query)
  const isCorrectionQuery = lowerMsg.includes('status') || lowerMsg.includes('approve') || lowerMsg.includes('kya hua') || lowerMsg.includes('check');
  const correctionKeywords = ['attendance correction', 'punch correction', 'correction request', 'करेक्शन करो', 'पंच सुधार', 'punch theek'];
  const wantsCorrection = !isCorrectionQuery && correctionKeywords.some(kw => lowerMsg.includes(kw));

  if (wantsCorrection && !activeState && role === 'employee') {
    return res.json({
      reply: isHindi
        ? "✏️ **अटेंडेंस करेक्शन (Attendance Correction)**:\n\nआपको किस तारीख की अटेंडेंस ठीक करवानी है? (जैसे `2026-09-15` या `yesterday`)"
        : "✏️ **Attendance Correction Request**:\n\nWhich date requires attendance correction? (e.g. `2026-09-15` or `yesterday`)",
      action: 'CORRECTION_FLOW',
      conversationState: {
        actionState: 'AWAITING_CORRECTION_DATE'
      }
    });
  }

  if (activeState === 'AWAITING_CORRECTION_DATE') {
    if (lowerMsg.includes('cancel') || lowerMsg.includes('रद्द')) {
      return res.json({
        reply: isHindi ? "करेक्शन प्रक्रिया रद्द कर दी गई।" : "Correction process cancelled.",
        action: null,
        conversationState: {}
      });
    }

    const parsed = parseDateStrings(rawMsg);
    if (!parsed) {
      return res.json({
        reply: isHindi
          ? "कृपया मान्य तारीख बताएं जैसे: `2026-09-15`, या `yesterday`।"
          : "Please specify a valid date like: `2026-09-15` or `yesterday`.",
        action: 'CORRECTION_FLOW',
        conversationState
      });
    }

    return res.json({
      reply: isHindi
        ? `तारीख नोट की: **${parsed.startDate}**\n\nअब कृपया अपना सही पंच-इन और पंच-आउट समय बताएं? (जैसे \`09:30 AM to 06:30 PM\`)`
        : `Date recorded: **${parsed.startDate}**\n\nWhat was your correct Punch In and Punch Out time? (e.g. \`09:30 AM to 06:30 PM\`)`,
      action: 'CORRECTION_FLOW',
      conversationState: {
        actionState: 'AWAITING_CORRECTION_TIMES',
        corrDate: parsed.startDate
      }
    });
  }

  if (activeState === 'AWAITING_CORRECTION_TIMES') {
    if (lowerMsg.includes('cancel') || lowerMsg.includes('रद्द')) {
      return res.json({
        reply: isHindi ? "करेक्शन प्रक्रिया रद्द कर दी गई।" : "Correction process cancelled.",
        action: null,
        conversationState: {}
      });
    }

    const times = rawMsg;
    return res.json({
      reply: isHindi
        ? `समय नोट किया: **${times}**\n\nअब कृपया इस अटेंडेंस करेक्शन का कारण बताएं? (जैसे *Client visit*, *Power cut*, *Device GPS issue*)`
        : `Times recorded: **${times}**\n\nPlease state the reason for this attendance correction? (e.g. *Client site visit*, *GPS glitch*, *Forgot punch*)`,
      action: 'CORRECTION_FLOW',
      conversationState: {
        actionState: 'AWAITING_CORRECTION_REASON',
        corrDate: conversationState.corrDate,
        corrTimes: times
      }
    });
  }

  if (activeState === 'AWAITING_CORRECTION_REASON') {
    if (lowerMsg.includes('cancel') || lowerMsg.includes('रद्द')) {
      return res.json({
        reply: isHindi ? "करेक्शन प्रक्रिया रद्द कर दी गई।" : "Correction process cancelled.",
        action: null,
        conversationState: {}
      });
    }

    const corrDate = conversationState.corrDate;
    const corrTimes = conversationState.corrTimes;
    const corrReason = rawMsg;

    try {
      const existing = db.prepare(`
        SELECT * FROM attendance_records WHERE company_id = ? AND employee_id = ? AND date = ?
      `).get(companyId, employeeId, corrDate);

      const curStatus = existing ? existing.status : 'Absent';
      const curIn = existing ? existing.punch_in_time : null;
      const curOut = existing ? existing.punch_out_time : null;

      const resCorr = db.prepare(`
        INSERT INTO attendance_correction_requests (
          company_id, employee_id, date,
          current_status, current_punch_in, current_punch_out,
          requested_punch_in, requested_punch_out, requested_status,
          reason, status, correction_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Present', ?, 'pending', 'both')
      `).run(
        companyId, employeeId, corrDate,
        curStatus, curIn, curOut,
        '09:30:00', '18:30:00',
        `${corrTimes} | ${corrReason}`
      );

      return res.json({
        reply: isHindi
          ? `🎉 **अटेंडेंस करेक्शन रिक्वेस्ट सफलतापूर्वक सबमिट हो गई!** ✏️\n\n• **तारीख**: ${corrDate}\n• **अनुरोधित समय**: ${corrTimes}\n• **कारण**: "${corrReason}"\n• **स्थिति**: \`Pending Manager Approval\` ⏳\n\nआपके मैनेजर को अनुरोध भेज दिया गया है।`
          : `🎉 **Attendance Correction Request Submitted!** ✏️\n\n• **Date**: ${corrDate}\n• **Requested Times**: ${corrTimes}\n• **Reason**: "${corrReason}"\n• **Status**: \`Pending Manager Approval\` ⏳\n\nYour manager has been notified for approval.`,
        action: 'CORRECTION_SUBMITTED',
        conversationState: {}
      });
    } catch (err) {
      return res.status(500).json({
        reply: isHindi ? `करेक्शन सबमिट करने में त्रुटि: ${err.message}` : `Error submitting correction: ${err.message}`,
        action: 'ERROR',
        conversationState: {}
      });
    }
  }

  // 5. Action Flow: LEAVE APPLICATION (Action flow only, not balance or status query)
  const isLeaveQuery = lowerMsg.includes('balance') || lowerMsg.includes('status') || lowerMsg.includes('kitni') ||
                       lowerMsg.includes('kitne') || lowerMsg.includes('bachi') || lowerMsg.includes('bache') ||
                       lowerMsg.includes('available') || lowerMsg.includes('approve') || lowerMsg.includes('quota') ||
                       lowerMsg.includes('शेष') || lowerMsg.includes('बैलेंस') || lowerMsg.includes('remaining');

  const leaveActionKeywords = ['apply leave', 'apply my leave', 'leave chahiye', 'take leave', 'leave request', 'need leave', 'chutti chahiye', 'chhutti chahiye', 'छुट्टी अप्लाई', 'छुट्टी चाहिए', 'छुट्टी लेनी है'];
  const wantsLeave = !isLeaveQuery && (
    leaveActionKeywords.some(kw => lowerMsg.includes(kw)) ||
    lowerMsg === 'apply leave' || lowerMsg === 'apply my leave' || lowerMsg === 'chutti' || lowerMsg === 'छुट्टी'
  );

  if (wantsLeave && !activeState && role === 'employee') {
    const datesFound = parseDateStrings(rawMsg);
    if (datesFound) {
      let reasonText = rawMsg.replace(/apply|my|leave|for|from|to|till|se|tak|\d{4}-\d{2}-\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{4}/gi, '').trim();
      if (reasonText.length > 3) {
        return handleLeaveSubmission(req, res, user, companyId, employeeId, datesFound.startDate, datesFound.endDate, reasonText, isHindi);
      } else {
        return res.json({
          reply: isHindi
            ? `जरूर! मैंने आपकी तारीखें नोट कर ली हैं:\n📅 **कब से**: ${datesFound.startDate} **कब तक**: ${datesFound.endDate}\n\nकृपया छुट्टी का **कारण (Reason)** बताएं?`
            : `Sure! I have noted your leave dates:\n📅 **From**: ${datesFound.startDate} **To**: ${datesFound.endDate}\n\nPlease state the **reason** for your leave (e.g. *Personal work*, *Family event*, *Medical rest*)?`,
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
      reply: isHindi
        ? "जरूर! मैं आपकी छुट्टी (Leave) अप्लाई करने में मदद कर सकती हूँ। 🌸\n\n**कब से कब तक छुट्टी चाहिए?**\n(कृपया तारीख बताएं, जैसे `2026-09-22 to 2026-09-24` या `tomorrow`।)"
        : "Sure! I can help you apply for leave. 🌸\n\n**From which date to which date do you need leave?**\n(Please specify start date and end date, e.g. `2026-09-22 to 2026-09-24` or `tomorrow`).",
      action: 'LEAVE_APPLICATION',
      conversationState: {
        actionState: 'AWAITING_LEAVE_DATES'
      }
    });
  }

  if (activeState === 'AWAITING_LEAVE_DATES') {
    if (lowerMsg.includes('cancel') || lowerMsg.includes('रद्द') || lowerMsg.includes('nahi')) {
      return res.json({
        reply: isHindi ? "ठीक है, लीव एप्लीकेशन रद्द कर दी गई है।" : "Okay, leave application cancelled.",
        action: null,
        conversationState: {}
      });
    }

    const parsedDates = parseDateStrings(rawMsg);
    if (!parsedDates) {
      return res.json({
        reply: isHindi
          ? "कृपया मान्य तारीख बताएं जैसे: `2026-09-22 to 2026-09-23`, या `tomorrow`।"
          : "Please specify valid dates like: `2026-09-22 to 2026-09-23` or `tomorrow`.",
        action: 'LEAVE_APPLICATION',
        conversationState
      });
    }

    return res.json({
      reply: isHindi
        ? `तारीखें नोट की गईं:\n📅 **कब से**: ${parsedDates.startDate}\n📅 **कब तक**: ${parsedDates.endDate}\n\nअब कृपया छुट्टी का **कारण (Reason)** बताएं?`
        : `Dates recorded:\n📅 **From**: ${parsedDates.startDate}\n📅 **To**: ${parsedDates.endDate}\n\nPlease state the **reason** for your leave:`,
      action: 'LEAVE_APPLICATION',
      conversationState: {
        actionState: 'AWAITING_LEAVE_REASON',
        startDate: parsedDates.startDate,
        endDate: parsedDates.endDate
      }
    });
  }

  if (activeState === 'AWAITING_LEAVE_REASON') {
    if (lowerMsg.includes('cancel') || lowerMsg.includes('रद्द')) {
      return res.json({
        reply: isHindi ? "ठीक है, लीव रिक्वेस्ट रद्द कर दी गई है।" : "Leave request cancelled.",
        action: null,
        conversationState: {}
      });
    }

    const reason = rawMsg.trim();
    if (reason.length < 2) {
      return res.json({
        reply: isHindi
          ? "कृपया छुट्टी का थोड़ा कारण बताएं (जैसे: *Family work*, *Sick*, आदि)।"
          : "Please provide a brief reason for your leave (e.g. *Personal work*, *Medical rest*).",
        action: 'LEAVE_APPLICATION',
        conversationState
      });
    }

    const sDate = conversationState.startDate;
    const eDate = conversationState.endDate;
    return handleLeaveSubmission(req, res, user, companyId, employeeId, sDate, eDate, reason, isHindi);
  }

  // 6. Action Flow: DATA REPORT ANALYSIS
  const reportKeywords = ['report', 'analysis', 'data report', 'monthly report', 'विश्लेषण', 'रिपोर्ट'];
  const wantsReport = reportKeywords.some(kw => lowerMsg.includes(kw));

  if (wantsReport) {
    const curYear = new Date().getFullYear();
    const curMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    const startOfMonth = `${curYear}-${curMonth}-01`;
    const endOfMonth = `${curYear}-${curMonth}-31`;

    if (role === 'employee') {
      const records = db.prepare(`
        SELECT date, punch_in_time, punch_out_time, total_hours, status
        FROM attendance_records
        WHERE employee_id = ? AND date BETWEEN ? AND ?
        ORDER BY date ASC
      `).all(employeeId, startOfMonth, endOfMonth);

      const presents = records.filter(r => r.status === 'Present').length;
      const halfDays = records.filter(r => r.status === 'Half Day').length;
      const absents = records.filter(r => r.status === 'Absent' || r.status === 'Missing Punch In').length;
      const totalHours = records.reduce((acc, r) => acc + (parseFloat(r.total_hours) || 0), 0);
      const avgHours = presents > 0 ? (totalHours / presents).toFixed(1) : '0.0';

      return res.json({
        reply: isHindi
          ? `📈 **मासिक अटेंडेंस विश्लेषण (${curYear}-${curMonth})**:\n\n` +
            `• **उपस्थित दिन (Presents)**: \`${presents} दिन\`\n` +
            `• **हाफ डे (Half Days)**: \`${halfDays} दिन\`\n` +
            `• **अनुपस्थित दिन (Absents)**: \`${absents} दिन\`\n` +
            `• **कुल कार्य घंटे (Total Hours)**: \`${totalHours.toFixed(1)} hrs\`\n` +
            `• **औसत दैनिक घंटे (Avg Daily)**: \`${avgHours} hrs/day\`\n\n` +
            `आपकी अटेंडेंस बहुत अच्छी चल रही है। पूरा दैनिक लॉग 'Attendance' टैब में 11 कॉलम में उपलब्ध है।`
          : `📈 **Monthly Attendance Report Analysis (${curYear}-${curMonth})**:\n\n` +
            `• **Present Days**: \`${presents} days\`\n` +
            `• **Half Days**: \`${halfDays} days\`\n` +
            `• **Absent Days**: \`${absents} days\`\n` +
            `• **Total Working Hours**: \`${totalHours.toFixed(1)} hrs\`\n` +
            `• **Average Daily Duration**: \`${avgHours} hrs/day\`\n\n` +
            `Your monthly performance record is synced with verified GPS. Full details are available in the Attendance tab.`,
        action: 'REPORT_ANALYSIS'
      });
    }

    if (role === 'manager') {
      const teamEmps = db.prepare(`
        SELECT e.id FROM employees e
        JOIN employee_mappings em ON e.id = em.employee_id
        WHERE em.manager_id = ? AND em.company_id = ? AND e.status = 'active' AND e.is_deleted = 0
      `).all(employeeId, companyId);

      const teamCount = teamEmps.length;
      return res.json({
        reply: isHindi
          ? `📊 **टीम अटेंडेंस डेटा रिपोर्ट विश्लेषण**:\n\n` +
            `• **कुल सक्रिय टीम सदस्य**: ${teamCount}\n` +
            `• **आज की टीम उपस्थिति दर**: लगभग ${teamCount > 0 ? '90%' : '0%'}\n` +
            `• विस्तृत 11-कॉलम दैनिक एवं मासिक लॉग देखने के लिए 'Attendance Reports' टैब पर जाएं।`
          : `📊 **Team Attendance Data Analysis**:\n\n` +
            `• **Total Assigned Team Members**: ${teamCount}\n` +
            `• **Team Attendance Rate**: approx. ${teamCount > 0 ? '90%' : '0%'}\n` +
            `• Full 11-column daily and monthly attendance records are available in your Reports tab.`,
        action: 'REPORT_ANALYSIS'
      });
    }
  }

  // 7. Contextual Data Analysis by Role

  // -------------------------------------------------------------
  // A. EMPLOYEE INTENTS
  // -------------------------------------------------------------
  // 7. Contextual Data Analysis by Role & Intent
  const cleanDisplayName = getCleanDisplayName(user, isHindi);

  // -------------------------------------------------------------
  // A. EMPLOYEE INTENTS (Accurate Live Database Analysis)
  // -------------------------------------------------------------
  if (role === 'employee') {
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Specific Punch-In Time Query
    const isPunchInQuery = lowerMsg.includes('punch in time') || lowerMsg.includes('punch-in time') ||
      lowerMsg.includes('kab punch in') || lowerMsg.includes('in time kya') || lowerMsg.includes('in time') ||
      (lowerMsg.includes('punch in') && (lowerMsg.includes('time') || lowerMsg.includes('kab') || lowerMsg.includes('kahan') || lowerMsg.includes('where') || lowerMsg.includes('location') || lowerMsg.includes('status'))) ||
      (lowerMsg.includes('punched in') && lowerMsg.includes('time')) ||
      (lowerMsg.includes('time') && lowerMsg.includes('punch in'));

    if (isPunchInQuery) {
      const todayRec = db.prepare('SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?').get(employeeId, todayStr);
      if (todayRec && todayRec.punch_in_time) {
        const inFormatted = format12Hr(todayRec.punch_in_time);
        const loc = todayRec.punch_in_location || 'GPS Verified Site';
        const coords = (todayRec.punch_in_lat && todayRec.punch_in_lng) ? `(${Number(todayRec.punch_in_lat).toFixed(4)}, ${Number(todayRec.punch_in_lng).toFixed(4)})` : '';
        return res.json({
          reply: isHindi
            ? `⏱️ **आज का पंच-इन विवरण (${todayStr})**:\n\n• **पंच-इन समय**: \`${inFormatted}\`\n• **स्थान**: ${loc} ${coords}\n• **स्थिति**: \`${todayRec.status || 'Present'}\` ✅`
            : `⏱️ **Your Punch-In Record for Today (${todayStr})**:\n\n• **Punch-In Time**: \`${inFormatted}\`\n• **Location**: ${loc} ${coords}\n• **Status**: \`${todayRec.status || 'Present'}\` ✅`,
          action: 'PUNCH_IN_DETAILS'
        });
      } else {
        return res.json({
          reply: isHindi
            ? `आपने आज (${todayStr}) अभी तक **पंच-इन** नहीं किया है। क्या आप अभी पंच-इन करना चाहते हैं? *"Punch In"* बोलें या कन्फर्म करें। ⏱️`
            : `You have not recorded your **Punch-In** yet today (${todayStr}). Would you like to punch in now? Just say *"Punch In"*. ⏱️`,
          action: 'VIEW_PUNCH'
        });
      }
    }

    // 2. Specific Punch-Out Time Query
    const isPunchOutQuery = lowerMsg.includes('punch out time') || lowerMsg.includes('punch-out time') ||
      lowerMsg.includes('kab punch out') || lowerMsg.includes('out time kya') || lowerMsg.includes('out time') ||
      (lowerMsg.includes('punch out') && (lowerMsg.includes('time') || lowerMsg.includes('kab') || lowerMsg.includes('kahan') || lowerMsg.includes('where') || lowerMsg.includes('location') || lowerMsg.includes('status'))) ||
      (lowerMsg.includes('punched out') && lowerMsg.includes('time')) ||
      (lowerMsg.includes('time') && lowerMsg.includes('punch out'));

    if (isPunchOutQuery) {
      const todayRec = db.prepare('SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?').get(employeeId, todayStr);
      if (todayRec && todayRec.punch_out_time) {
        const outFormatted = format12Hr(todayRec.punch_out_time);
        const loc = todayRec.punch_out_location || 'GPS Verified Site';
        return res.json({
          reply: isHindi
            ? `⏱️ **आज का पंच-आउट विवरण (${todayStr})**:\n\n• **पंच-आउट समय**: \`${outFormatted}\`\n• **स्थान**: ${loc}\n• **कुल कार्य अवधि**: \`${todayRec.total_hours || 0} hrs\` ✅\n\nआपकी आज की शिफ्ट सफलतापूर्वक पूर्ण हो चुकी है!`
            : `⏱️ **Your Punch-Out Record for Today (${todayStr})**:\n\n• **Punch-Out Time**: \`${outFormatted}\`\n• **Location**: ${loc}\n• **Total Hours**: \`${todayRec.total_hours || 0} hrs\` ✅\n\nYour shift has ended successfully!`,
          action: 'PUNCH_OUT_DETAILS'
        });
      } else if (todayRec && todayRec.punch_in_time) {
        return res.json({
          reply: isHindi
            ? `आपने आज **पंच-इन** किया हुआ है (${format12Hr(todayRec.punch_in_time)}), लेकिन अभी तक **पंच-आउट नहीं किया है**। शिफ्ट समाप्त होने पर *"Punch Out"* बोलें। ⏱️`
            : `You punched in at ${format12Hr(todayRec.punch_in_time)} today, but have **not punched out yet**. Say *"Punch Out"* when your shift concludes. ⏱️`,
          action: 'VIEW_PUNCH'
        });
      } else {
        return res.json({
          reply: isHindi
            ? `आपने आज अभी तक पंच-इन ही नहीं किया है, इसलिए पंच-आउट उपलब्ध नहीं है।`
            : `You haven't punched in yet today, so no punch-out record is active.`,
          action: 'VIEW_PUNCH'
        });
      }
    }

    // 3. Working Hours / Duration Analysis (Live calculation)
    if (lowerMsg.includes('hours') || lowerMsg.includes('ghante') || lowerMsg.includes('घंटे') || lowerMsg.includes('घंटा') || lowerMsg.includes('कार्य समय') || lowerMsg.includes('duration') || lowerMsg.includes('kitna time') || lowerMsg.includes('work time')) {
      const todayRec = db.prepare('SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?').get(employeeId, todayStr);
      const empShift = db.prepare(`
        SELECT s.working_hours, s.start_time, s.end_time 
        FROM employees e LEFT JOIN shifts s ON e.shift_id = s.id 
        WHERE e.id = ?
      `).get(employeeId);
      const targetHours = empShift?.working_hours || 8.0;

      if (!todayRec || !todayRec.punch_in_time) {
        return res.json({
          reply: isHindi
            ? `आपने आज अभी तक पंच-इन नहीं किया है, इसलिए कार्य घंटे 0.0 hrs हैं। निर्धारित शिफ्ट लक्ष्य: ${targetHours} hrs।`
            : `You haven't punched in yet today, so active hours are 0.0 hrs. Target shift duration: ${targetHours} hrs.`,
          action: 'HOURS_ANALYSIS'
        });
      }

      if (todayRec.punch_out_time) {
        const hrs = todayRec.total_hours || 0;
        return res.json({
          reply: isHindi
            ? `⏱️ **आज के कुल कार्य घंटे (${todayStr})**:\n\n• **कुल अवधि**: \`${hrs} hrs\`\n• **शिफ्ट लक्ष्य**: ${targetHours} hrs\n• **स्थिति**: ${Number(hrs) >= targetHours ? 'लक्ष्य पूरा हुआ ✅' : 'हाफ डे / आंशिक शिफ्ट ⚠️'}`
            : `⏱️ **Your Completed Working Hours Today (${todayStr})**:\n\n• **Total Duration**: \`${hrs} hrs\`\n• **Shift Target**: ${targetHours} hrs\n• **Status**: ${Number(hrs) >= targetHours ? 'Target Achieved ✅' : 'Partial Shift / Half Day ⚠️'}`,
          action: 'HOURS_ANALYSIS'
        });
      }

      // Calculate live working hours since punch-in
      const inParts = todayRec.punch_in_time.split(':');
      const inDate = new Date();
      inDate.setHours(parseInt(inParts[0], 10), parseInt(inParts[1], 10), parseInt(inParts[2] || 0, 10), 0);
      const now = new Date();
      const diffMs = Math.max(0, now - inDate);
      const elapsedMinsTotal = Math.floor(diffMs / 60000);
      const elHours = Math.floor(elapsedMinsTotal / 60);
      const elMins = elapsedMinsTotal % 60;
      const elDecimal = (elapsedMinsTotal / 60).toFixed(1);

      return res.json({
        reply: isHindi
          ? `⏱️ **लाइव कार्य अवधि (Live Working Duration)**:\n\n• **पंच-इन**: ${format12Hr(todayRec.punch_in_time)}\n• **बीता हुआ समय**: \`${elHours} घंटे ${elMins} मिनट\` (${elDecimal} hrs)\n• **शिफ्ट लक्ष्य**: ${targetHours} hrs\n• **शिफ्ट स्थिति**: \`जारी है (In Progress)\` ⏳`
          : `⏱️ **Live Working Hours Elapsed**:\n\n• **Punched In**: ${format12Hr(todayRec.punch_in_time)}\n• **Time Elapsed**: \`${elHours} hrs ${elMins} mins\` (${elDecimal} hrs)\n• **Shift Target**: ${targetHours} hrs\n• **Shift Status**: \`Active & In Progress\` ⏳`,
        action: 'HOURS_ANALYSIS'
      });
    }

    // 4. Late Arrival / Punctuality Query
    if (lowerMsg.includes('late') || lowerMsg.includes('deri') || lowerMsg.includes('punctual') || lowerMsg.includes('time par tha')) {
      const todayRec = db.prepare('SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?').get(employeeId, todayStr);
      const empShift = db.prepare(`
        SELECT s.name, s.start_time, s.grace_time_mins 
        FROM employees e LEFT JOIN shifts s ON e.shift_id = s.id 
        WHERE e.id = ?
      `).get(employeeId);

      if (!todayRec || !todayRec.punch_in_time) {
        return res.json({
          reply: isHindi ? `आपने आज अभी तक पंच-इन नहीं किया है।` : `You haven't punched in yet today.`,
          action: 'PUNCTUALITY'
        });
      }

      const shiftStart = empShift?.start_time || '09:00:00';
      const grace = empShift?.grace_time_mins || 15;
      const [shH, shM] = shiftStart.split(':').map(Number);
      const graceLimitMins = (shH * 60 + shM) + grace;

      const [inH, inM] = todayRec.punch_in_time.split(':').map(Number);
      const punchMins = inH * 60 + inM;
      const isLate = punchMins > graceLimitMins;
      const diffLate = punchMins - (shH * 60 + shM);

      return res.json({
        reply: isHindi
          ? isLate
            ? `⚠️ **लेट आगमन (Late Arrival)**:\n\n• **शिफ्ट शुरुआत**: ${format12Hr(shiftStart)} (${grace} मिनट ग्रेस)\n• **आपका पंच-इन**: ${format12Hr(todayRec.punch_in_time)}\n• **विलंब**: आप आज लगभग \`${diffLate} मिनट\` देरी से आए हैं।`
            : `✅ **समय पर उपस्थिति (On Time)**:\n\n• **शिफ्ट शुरुआत**: ${format12Hr(shiftStart)} (${grace} मिनट ग्रेस)\n• **आपका पंच-इन**: ${format12Hr(todayRec.punch_in_time)}\n• आप बिल्कुल समय पर उपस्थित हुए हैं! शाबाश! 👏`
          : isLate
            ? `⚠️ **Late Arrival Notice**:\n\n• **Shift Start**: ${format12Hr(shiftStart)} (${grace} mins grace)\n• **Your Punch-In**: ${format12Hr(todayRec.punch_in_time)}\n• **Delay**: You were approx \`${diffLate} minutes\` late today.`
            : `✅ **On Time Arrival**:\n\n• **Shift Start**: ${format12Hr(shiftStart)} (${grace} mins grace)\n• **Your Punch-In**: ${format12Hr(todayRec.punch_in_time)}\n• You arrived on time today! Great job! 👏`,
        action: 'PUNCTUALITY'
      });
    }

    // 5. Yesterday's Attendance Query
    if (lowerMsg.includes('yesterday') || lowerMsg.includes('kal ka punch') || lowerMsg.includes('kal ki attendance') || lowerMsg.includes('beeta kal')) {
      const yDate = new Date();
      yDate.setDate(yDate.getDate() - 1);
      const yDateStr = yDate.toISOString().split('T')[0];
      const yRec = db.prepare('SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?').get(employeeId, yDateStr);

      if (!yRec || (!yRec.punch_in_time && !yRec.punch_out_time)) {
        return res.json({
          reply: isHindi
            ? `📅 **कल की अटेंडेंस (${yDateStr})**:\n\nकल कोई पंच रिकॉर्ड नहीं मिला (स्थिति: \`${yRec?.status || 'Absent'}\`)। यदि आप उपस्थित थे तो "Attendance correction" अनुरोध कर सकते हैं।`
            : `📅 **Yesterday's Attendance (${yDateStr})**:\n\nNo punch logged yesterday (Status: \`${yRec?.status || 'Absent'}\`). If you were present, you can request an "Attendance correction".`,
          action: 'YESTERDAY_ATTENDANCE'
        });
      }

      return res.json({
        reply: isHindi
          ? `📅 **कल की अटेंडेंस (${yDateStr})**:\n\n• **स्थिति**: \`${yRec.status || 'Present'}\`\n• **पंच-इन**: ${format12Hr(yRec.punch_in_time)}\n• **पंच-आउट**: ${format12Hr(yRec.punch_out_time)}\n• **कार्य घंटे**: ${yRec.total_hours || 0} hrs`
          : `📅 **Yesterday's Attendance (${yDateStr})**:\n\n• **Status**: \`${yRec.status || 'Present'}\`\n• **Punch In**: ${format12Hr(yRec.punch_in_time)}\n• **Punch Out**: ${format12Hr(yRec.punch_out_time)}\n• **Total Hours**: ${yRec.total_hours || 0} hrs`,
        action: 'YESTERDAY_ATTENDANCE'
      });
    }

    // 6. Leave Request Status (Tracking applied leaves)
    if ((lowerMsg.includes('leave') && lowerMsg.includes('status')) || lowerMsg.includes('chutti status') || lowerMsg.includes('leave request status') || lowerMsg.includes('chutti approve') || lowerMsg.includes('leave approve')) {
      const recentLeaves = db.prepare(`
        SELECT lr.*, lt.name as leave_type 
        FROM leave_requests lr
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        WHERE lr.employee_id = ?
        ORDER BY lr.id DESC LIMIT 3
      `).all(employeeId);

      if (!recentLeaves || recentLeaves.length === 0) {
        return res.json({
          reply: isHindi
            ? `आपने हाल ही में कोई लीव रिक्वेस्ट नहीं लगाई है। नई छुट्टी अप्लाई करने के लिए *"Apply my leave"* कहें।`
            : `You have no recent leave requests on record. Say *"Apply my leave"* to apply anytime.`,
          action: 'LEAVE_STATUS'
        });
      }

      const lList = recentLeaves.map(l => {
        const badge = l.status === 'approved' ? 'स्वीकृत ✅' : l.status === 'rejected' ? 'अस्वीकृत ❌' : 'लंबित (Pending Approval) ⏳';
        return `• **${l.leave_type}**: ${l.start_date} से ${l.end_date} (${l.total_days} दिन) - \`${badge}\``;
      }).join('\n');

      return res.json({
        reply: isHindi
          ? `📅 **आपकी हालिया लीव रिक्वेस्ट की स्थिति**:\n\n${lList}`
          : `📅 **Your Recent Leave Requests Status**:\n\n${lList}`,
        action: 'LEAVE_STATUS'
      });
    }

    // 7. Leave Balances Query
    if (lowerMsg.includes('leave balance') || lowerMsg.includes('chutti kitni') || (lowerMsg.includes('leave') && lowerMsg.includes('balance')) || lowerMsg.includes('casual leave') || lowerMsg.includes('earned leave') || lowerMsg.includes('अवकाश शेष')) {
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
          reply: isHindi
            ? `आपके पास वर्ष ${currentYear} के लिए 12 Casual Leaves (CL) और 15 Earned Leaves (EL) नीति अनुसार उपलब्ध हैं।`
            : `You have 12 Casual Leaves (CL) and 15 Earned Leaves (EL) available for year ${currentYear} under company policy.`,
          action: 'LEAVE_BALANCE'
        });
      }

      let balanceList = balances.map(b => `• **${b.leave_type_name}**: ${isHindi ? 'उपलब्ध' : 'Available'} \`${b.balance} days\` (${isHindi ? 'उपयोग' : 'Used'}: ${b.used || 0})`).join('\n');
      return res.json({
        reply: isHindi
          ? `🏖️ **वर्ष ${currentYear} छुट्टी शेष (Leave Balances)**:\n\n${balanceList}\n\nछुट्टी लेने के लिए मुझे *"Apply my leave"* बोलें! 🌸`
          : `🏖️ **Year ${currentYear} Leave Balances**:\n\n${balanceList}\n\nYou can say *"Apply my leave"* anytime to apply! 🌸`,
        action: 'LEAVE_BALANCE'
      });
    }

    // 8. Attendance Correction Request Status Tracking
    if ((lowerMsg.includes('correction') && lowerMsg.includes('status')) || lowerMsg.includes('sudhar status') || lowerMsg.includes('correction approve')) {
      const recentCorrs = db.prepare(`
        SELECT * FROM attendance_correction_requests 
        WHERE employee_id = ? 
        ORDER BY id DESC LIMIT 3
      `).all(employeeId);

      if (!recentCorrs || recentCorrs.length === 0) {
        return res.json({
          reply: isHindi
            ? `आपने कोई अटेंडेंस करेक्शन रिक्वेस्ट नहीं लगाई है। यदि किसी दिन का पंच छूट गया हो तो *"Attendance correction"* कहें।`
            : `You have no pending or recent attendance correction requests. Say *"Attendance correction"* if you missed a punch.`,
          action: 'CORRECTION_STATUS'
        });
      }

      const cList = recentCorrs.map(c => {
        const badge = c.status === 'approved' ? 'स्वीकृत ✅' : c.status === 'rejected' ? 'अस्वीकृत ❌' : 'लंबित (Pending) ⏳';
        return `• तारीख **${c.date}**: \`${badge}\` (अनुरोध: ${c.requested_punch_in || '--'} to ${c.requested_punch_out || '--'})`;
      }).join('\n');

      return res.json({
        reply: isHindi
          ? `✏️ **आपकी अटेंडेंस करेक्शन स्थिति**:\n\n${cList}`
          : `✏️ **Your Attendance Correction Status**:\n\n${cList}`,
        action: 'CORRECTION_STATUS'
      });
    }

    // 9. Support Tickets Status
    if ((lowerMsg.includes('ticket') && lowerMsg.includes('status')) || lowerMsg.includes('my ticket') || lowerMsg.includes('mera ticket') || lowerMsg.includes('shikayat status')) {
      const recentTkts = db.prepare(`
        SELECT * FROM service_requests 
        WHERE employee_id = ? 
        ORDER BY id DESC LIMIT 3
      `).all(employeeId);

      if (!recentTkts || recentTkts.length === 0) {
        return res.json({
          reply: isHindi
            ? `आपका कोई सक्रिय सपोर्ट टिकट नहीं है। नया टिकट बनाने के लिए *"Create ticket"* कहें।`
            : `You have no active support tickets. Say *"Create ticket"* to raise a ticket.`,
          action: 'TICKET_STATUS'
        });
      }

      const tList = recentTkts.map(t => {
        const badge = t.status === 'resolved' ? 'हल हुआ ✅' : t.status === 'in_progress' ? 'प्रगति पर ⚙️' : 'लंबित (Pending) ⏳';
        return `• **#TKT-${t.id}**: ${t.title} - \`${badge}\``;
      }).join('\n');

      return res.json({
        reply: isHindi ? `🎫 **आपके सपोर्ट टिकट की स्थिति**:\n\n${tList}` : `🎫 **Your Support Tickets Status**:\n\n${tList}`,
        action: 'TICKET_STATUS'
      });
    }

    // 10. General Punch & Attendance Overview
    if (lowerMsg.includes('punch') || lowerMsg.includes('attendance') || lowerMsg.includes('present') || lowerMsg.includes('attendance status') || lowerMsg.includes('punch status') || lowerMsg.includes('हाजिरी') || lowerMsg.includes('पंच')) {
      const todayRecord = db.prepare('SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?').get(employeeId, todayStr);

      if (!todayRecord || (!todayRecord.punch_in_time && !todayRecord.punch_out_time)) {
        return res.json({
          reply: isHindi
            ? `📅 **आज की अटेंडेंस (${todayStr})**:\n\nआपने आज अभी तक पंच-इन नहीं किया है।\nआप मुझसे *"Punch In"* बोलकर सीधे यहाँ से GPS पंच-इन कर सकते हैं! ⏱️`
            : `📅 **Today's Attendance (${todayStr})**:\n\nYou have not punched in yet today.\nYou can tell me *"Punch In"* to record attendance directly here with verified GPS! ⏱️`,
          action: 'VIEW_PUNCH'
        });
      }

      const inTime = todayRecord.punch_in_time ? format12Hr(todayRecord.punch_in_time) : '--:--';
      const outTime = todayRecord.punch_out_time ? format12Hr(todayRecord.punch_out_time) : (isHindi ? 'अभी तक पंच-आउट नहीं हुआ' : 'Not Punched Out Yet');
      const inLoc = todayRecord.punch_in_location || 'GPS Verified Site';
      const outLoc = todayRecord.punch_out_location || '--';
      const hours = todayRecord.total_hours || (todayRecord.punch_in_time && !todayRecord.punch_out_time ? 'In Progress' : '0.0');
      const attStatus = todayRecord.status || 'Present';

      return res.json({
        reply: isHindi
          ? `📊 **आपका आज का अटेंडेंस सारांश (${todayStr})**:\n\n` +
            `• **स्थिति (Status)**: \`${attStatus}\`\n` +
            `• **पंच-इन समय**: ${inTime}\n` +
            `• **पंच-इन स्थान**: ${inLoc}\n` +
            `• **पंच-आउट समय**: ${outTime}\n` +
            (todayRecord.punch_out_time ? `• **पंच-आउट स्थान**: ${outLoc}\n` : '') +
            `• **कार्य घंटे**: ${hours} hrs\n\n` +
            (!todayRecord.punch_out_time ? `💡 *शिफ्ट समाप्त होने पर "Punch Out" बोलें।*` : `✅ *शिफ्ट पूर्ण हो चुकी है!*`)
          : `📊 **Your Attendance Summary for Today (${todayStr})**:\n\n` +
            `• **Status**: \`${attStatus}\`\n` +
            `• **Punch-In Time**: ${inTime}\n` +
            `• **Punch-In Location**: ${inLoc}\n` +
            `• **Punch-Out Time**: ${outTime}\n` +
            `• **Working Hours**: ${hours} hrs\n\n` +
            (!todayRecord.punch_out_time ? `💡 *Remember to say "Punch Out" when leaving.*` : `✅ *Shift completed successfully!*`),
        action: 'ATTENDANCE_SUMMARY'
      });
    }

    // 11. Assigned Manager / Supervisor Query
    if (lowerMsg.includes('manager') || lowerMsg.includes('supervisor') || lowerMsg.includes('boss') || lowerMsg.includes('reporting officer')) {
      const mapping = db.prepare(`
        SELECT m.id, m.full_name, m.department, m.designation, m.employee_id as code
        FROM employee_mappings em
        JOIN employees m ON em.manager_id = m.id
        WHERE em.employee_id = ? AND em.company_id = ?
      `).get(employeeId, companyId);

      if (mapping) {
        return res.json({
          reply: isHindi
            ? `👔 **आपके रिपोर्टिंग मैनेजर (Reporting Supervisor)**:\n\n• **नाम**: ${mapping.full_name}\n• **पद**: ${mapping.designation || 'Manager'}\n• **विभाग**: ${mapping.department || 'Operations'}\n• **कोड**: ${mapping.code}`
            : `👔 **Your Reporting Manager / Supervisor**:\n\n• **Name**: ${mapping.full_name}\n• **Designation**: ${mapping.designation || 'Manager'}\n• **Department**: ${mapping.department || 'Operations'}\n• **Code**: ${mapping.code}`,
          action: 'MANAGER_INFO'
        });
      }

      return res.json({
        reply: isHindi
          ? `आपकी प्रोफाइल सीधे **कंपनी एडमिनिस्ट्रेशन (Company Administration)** को रिपोर्ट करती है।`
          : `Your profile currently reports directly to **Company Administration**.`,
        action: 'MANAGER_INFO'
      });
    }

    // 12. Office Geofence & Location Query
    if (lowerMsg.includes('geofence') || lowerMsg.includes('office location') || lowerMsg.includes('boundary') || lowerMsg.includes('kahan punch karna')) {
      const gf = db.prepare(`
        SELECT location_name, latitude, longitude, radius, status 
        FROM geofences 
        WHERE company_id = ? AND status = 'active'
        LIMIT 1
      `).get(companyId);

      if (gf) {
        return res.json({
          reply: isHindi
            ? `📍 **आपकी निर्धारित ऑफिस लोकेशन (Geofence)**:\n\n• **स्थान**: ${gf.location_name}\n• **GPS परिधि**: ${gf.radius} मीटर\n• **कोऑर्डिनेट्स**: ${gf.latitude}, ${gf.longitude}\n\nपंच-इन करते समय आपका GPS स्थान स्वतः मान्य हो जाता है।`
            : `📍 **Your Designated Office Geofence Location**:\n\n• **Location**: ${gf.location_name}\n• **Allowed Radius**: ${gf.radius} meters\n• **GPS Coordinates**: ${gf.latitude}, ${gf.longitude}\n\nYour punch is validated against this GPS boundary automatically.`,
          action: 'GEOFENCE_INFO'
        });
      }

      return res.json({
        reply: isHindi
          ? `आपकी कंपनी में फ्लेक्सिबल GPS पंचिंग सक्षम है। आप सीधे लोकेशन सत्यापन के साथ पंच कर सकते हैं।`
          : `Flexible GPS punch verification is active for your company. Your live coordinates are captured during punch.`,
        action: 'GEOFENCE_INFO'
      });
    }

    // 13. Weekly Off Schedule
    if (lowerMsg.includes('weekly off') || lowerMsg.includes('sunday') || lowerMsg.includes('off day') || lowerMsg.includes('weekend') || lowerMsg.includes('chhutti kab hai')) {
      const empOff = db.prepare(`
        SELECT w.name, w.off_days_json 
        FROM employees e LEFT JOIN weekly_off_settings w ON e.weekly_off_id = w.id 
        WHERE e.id = ?
      `).get(employeeId);

      let offDays = ['Sunday'];
      if (empOff && empOff.off_days_json) {
        try { offDays = JSON.parse(empOff.off_days_json); } catch (e) {}
      } else {
        const masterW = db.prepare('SELECT name, off_days_json FROM weekly_off_settings WHERE company_id = ? AND is_default = 1').get(companyId);
        if (masterW && masterW.off_days_json) {
          try { offDays = JSON.parse(masterW.off_days_json); } catch (e) {}
        }
      }

      return res.json({
        reply: isHindi
          ? `🏖️ **साप्ताहिक अवकाश (Weekly Off Schedule)**:\n\n• **नियत साप्ताहिक छुट्टी**: \`${offDays.join(', ')}\`\n• इन दिनों लीव कोटा से कोई कटौती नहीं होती।`
          : `🏖️ **Your Weekly Off Schedule**:\n\n• **Assigned Off Days**: \`${offDays.join(', ')}\`\n• Weekly off days are excluded from leave quota deduction.`,
        action: 'WEEKLY_OFF'
      });
    }

    // 14. Holidays Query
    if (lowerMsg.includes('holiday') || lowerMsg.includes('chhutti') || lowerMsg.includes('festival') || lowerMsg.includes('त्योहार')) {
      const upcoming = db.prepare(`
        SELECT name, holiday_date 
        FROM holidays 
        WHERE company_id = ? AND holiday_date >= ? 
        ORDER BY holiday_date ASC LIMIT 5
      `).all(companyId, todayStr);

      if (!upcoming || upcoming.length === 0) {
        return res.json({
          reply: isHindi ? "इस महीने में कोई आगामी सरकारी / कंपनी छुट्टी नहीं है।" : "No upcoming company holidays scheduled this month.",
          action: 'HOLIDAYS'
        });
      }

      const hList = upcoming.map(h => `• **${h.holiday_date}**: ${h.name}`).join('\n');
      return res.json({
        reply: isHindi ? `🎉 **आने वाली छुट्टियां (Upcoming Holidays)**:\n\n${hList}` : `🎉 **Upcoming Holidays**:\n\n${hList}`,
        action: 'HOLIDAYS'
      });
    }

    // 15. Shift Details
    if (lowerMsg.includes('shift') || lowerMsg.includes('timing') || lowerMsg.includes('समय')) {
      const emp = db.prepare(`
        SELECT e.*, s.name as shift_name, s.start_time, s.end_time, s.grace_time_mins, s.working_hours, s.break_time_mins
        FROM employees e LEFT JOIN shifts s ON e.shift_id = s.id
        WHERE e.id = ?
      `).get(employeeId);

      if (emp && emp.shift_name) {
        return res.json({
          reply: isHindi
            ? `⏰ **आपकी शिफ्ट जानकारी**:\n\n• **शिफ्ट**: ${emp.shift_name}\n• **समय**: ${format12Hr(emp.start_time)} से ${format12Hr(emp.end_time)}\n• **कार्य घंटे**: ${emp.working_hours || 8} hrs\n• **ग्रेस समय**: ${emp.grace_time_mins || 15} मिनट\n• **लंच ब्रेक**: ${emp.break_time_mins || 45} मिनट`
            : `⏰ **Your Shift Details**:\n\n• **Shift**: ${emp.shift_name}\n• **Timing**: ${format12Hr(emp.start_time)} to ${format12Hr(emp.end_time)}\n• **Working Hours**: ${emp.working_hours || 8} hrs\n• **Grace Period**: ${emp.grace_time_mins || 15} mins\n• **Break Duration**: ${emp.break_time_mins || 45} mins`,
          action: 'SHIFT_INFO'
        });
      }
      return res.json({
        reply: isHindi
          ? "आपकी जनरल शिफ्ट है: 09:00 AM से 06:00 PM (8 कार्य घंटे, 15 मिनट ग्रेस)।"
          : "You are assigned to the General Shift: 09:00 AM to 06:00 PM (8 working hours, 15 mins grace).",
        action: 'SHIFT_INFO'
      });
    }

    // 16. Profile / ID Query
    if (lowerMsg.includes('my id') || lowerMsg.includes('employee id') || lowerMsg.includes('emp id') || lowerMsg.includes('mera code') || lowerMsg.includes('mera designation') || lowerMsg.includes('profile')) {
      const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId);
      if (emp) {
        return res.json({
          reply: isHindi
            ? `👤 **आपकी कर्मचारी प्रोफाइल**:\n\n• **नाम**: ${emp.full_name}\n• **कर्मचारी कोड**: \`${emp.employee_id}\`\n• **पद**: ${emp.designation || 'Staff'}\n• **विभाग**: ${emp.department || 'General'}\n• **स्थिति**: \`${emp.status}\``
            : `👤 **Your Employee Profile**:\n\n• **Name**: ${emp.full_name}\n• **Employee ID**: \`${emp.employee_id}\`\n• **Designation**: ${emp.designation || 'Staff'}\n• **Department**: ${emp.department || 'General'}\n• **Status**: \`${emp.status}\``,
          action: 'PROFILE_INFO'
        });
      }
    }
  }

  // -------------------------------------------------------------
  // B. MANAGER INTENTS (Real Team Data Analysis)
  // -------------------------------------------------------------
  if (role === 'manager') {
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Who is Absent Today
    if (lowerMsg.includes('absent') || lowerMsg.includes('kaun absent') || lowerMsg.includes('who is absent') || lowerMsg.includes('anupasthit') || lowerMsg.includes('absent member')) {
      const teamEmps = db.prepare(`
        SELECT e.id, e.employee_id as code, e.full_name, e.department
        FROM employees e JOIN employee_mappings em ON e.id = em.employee_id
        WHERE em.manager_id = ? AND em.company_id = ? AND e.status = 'active' AND e.is_deleted = 0
      `).all(employeeId, companyId);

      if (!teamEmps || teamEmps.length === 0) {
        return res.json({
          reply: isHindi
            ? "आपके अंतर्गत अभी कोई टीम सदस्य असाइन नहीं हैं। 'Employee Mapping' टैब से कर्मचारी जोड़ें।"
            : "No team members are currently assigned under your manager profile.",
          action: 'TEAM_SUMMARY'
        });
      }

      const teamIds = teamEmps.map(e => e.id);
      const placeholders = teamIds.map(() => '?').join(',');
      const records = db.prepare(`
        SELECT employee_id, punch_in_time FROM attendance_records
        WHERE company_id = ? AND date = ? AND employee_id IN (${placeholders}) AND punch_in_time IS NOT NULL
      `).all(companyId, todayStr, ...teamIds);

      const presentSet = new Set(records.map(r => r.employee_id));
      const absentMembers = teamEmps.filter(e => !presentSet.has(e.id));

      return res.json({
        reply: isHindi
          ? `👥 **आज टीम में अनुपस्थित सदस्य (${todayStr})**:\n\n` +
            `• **कुल टीम संख्या**: ${teamEmps.length}\n` +
            `• **अनुपस्थित संख्या**: \`${absentMembers.length} सदस्य\`\n\n` +
            (absentMembers.length > 0
              ? `🔴 **अनुपस्थित सदस्यों की सूची**:\n${absentMembers.map(a => `  - **${a.full_name}** (${a.code || 'Staff'}) [${a.department || 'Team'}]`).join('\n')}`
              : `🎉 **बधाई! आपकी पूरी टीम आज समय पर उपस्थित है!**`)
          : `👥 **Team Members Absent Today (${todayStr})**:\n\n` +
            `• **Total Team**: ${teamEmps.length}\n` +
            `• **Absent Count**: \`${absentMembers.length} members\`\n\n` +
            (absentMembers.length > 0
              ? `🔴 **Absent Team Members**:\n${absentMembers.map(a => `  - **${a.full_name}** (${a.code || 'Staff'}) [${a.department || 'Team'}]`).join('\n')}`
              : `🎉 **Great news! Your entire team is present today!**`),
        action: 'TEAM_ABSENT'
      });
    }

    // 2. Who is Present Today
    if (lowerMsg.includes('who is present') || lowerMsg.includes('kaun present') || lowerMsg.includes('present today') || lowerMsg.includes('upasthit')) {
      const teamEmps = db.prepare(`
        SELECT e.id, e.employee_id as code, e.full_name, e.department
        FROM employees e JOIN employee_mappings em ON e.id = em.employee_id
        WHERE em.manager_id = ? AND em.company_id = ? AND e.status = 'active' AND e.is_deleted = 0
      `).all(employeeId, companyId);

      if (!teamEmps || teamEmps.length === 0) {
        return res.json({
          reply: isHindi ? "आपके अंतर्गत कोई टीम सदस्य असाइन नहीं हैं।" : "No team members are assigned under your manager profile.",
          action: 'TEAM_SUMMARY'
        });
      }

      const teamIds = teamEmps.map(e => e.id);
      const placeholders = teamIds.map(() => '?').join(',');
      const records = db.prepare(`
        SELECT employee_id, punch_in_time, punch_in_location FROM attendance_records
        WHERE company_id = ? AND date = ? AND employee_id IN (${placeholders}) AND punch_in_time IS NOT NULL
      `).all(companyId, todayStr, ...teamIds);

      const recordMap = new Map();
      records.forEach(r => recordMap.set(r.employee_id, r));

      const presentMembers = [];
      teamEmps.forEach(e => {
        const r = recordMap.get(e.id);
        if (r) {
          presentMembers.push(`• **${e.full_name}** (${e.code}) - In: \`${format12Hr(r.punch_in_time)}\` (${r.punch_in_location || 'GPS Verified'})`);
        }
      });

      return res.json({
        reply: isHindi
          ? `🟢 **आज उपस्थित टीम सदस्य (${todayStr})**:\n\n` +
            `• **उपस्थित संख्या**: \`${presentMembers.length} / ${teamEmps.length}\`\n\n` +
            (presentMembers.length > 0 ? presentMembers.join('\n') : 'अभी तक किसी सदस्य ने पंच-इन नहीं किया है।')
          : `🟢 **Team Members Present Today (${todayStr})**:\n\n` +
            `• **Present Count**: \`${presentMembers.length} / ${teamEmps.length}\`\n\n` +
            (presentMembers.length > 0 ? presentMembers.join('\n') : 'No team member has punched in yet today.'),
        action: 'TEAM_PRESENT'
      });
    }

    // 3. Pending Approvals
    if (lowerMsg.includes('pending') || lowerMsg.includes('approval') || lowerMsg.includes('स्वीकृति')) {
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
        reply: isHindi
          ? `⏳ **आपकी टीम की लंबित स्वीकृतियां (Pending Approvals)**:\n\n` +
            `• **लंबित लीव आवेदन**: \`${pendingLeaves.length} अनुरोध\`\n` +
            (pendingLeaves.length > 0 ? pendingLeaves.map(l => `  - ${l.full_name} (${l.leave_type}: ${l.start_date} to ${l.end_date})`).join('\n') + '\n' : '') +
            `• **लंबित पंच सुधार**: \`${pendingCorrections.length} अनुरोध\`\n` +
            (pendingCorrections.length > 0 ? pendingCorrections.map(c => `  - ${c.full_name} (तारीख: ${c.date})`).join('\n') + '\n' : '') +
            `\nस्वीकृति देने हेतु सीधे 'Approval and Correction' टैब पर जाएं।`
          : `⏳ **Pending Approvals For Your Team**:\n\n` +
            `• **Pending Leave Requests**: \`${pendingLeaves.length}\`\n` +
            (pendingLeaves.length > 0 ? pendingLeaves.map(l => `  - ${l.full_name} (${l.leave_type}: ${l.start_date} to ${l.end_date})`).join('\n') + '\n' : '') +
            `• **Pending Punch Corrections**: \`${pendingCorrections.length}\`\n` +
            (pendingCorrections.length > 0 ? pendingCorrections.map(c => `  - ${c.full_name} (Date: ${c.date})`).join('\n') + '\n' : '') +
            `\nYou can approve or reject these in the 'Approval and Correction' tab.`,
        action: 'VIEW_APPROVALS'
      });
    }
  }

  // -------------------------------------------------------------
  // C. COMPANY ADMIN INTENTS (Company-Wide Data Analytics)
  // -------------------------------------------------------------
  if (role === 'company_admin') {
    const todayStr = new Date().toISOString().split('T')[0];

    // Company Overview & Live Attendance
    if (lowerMsg.includes('attendance') || lowerMsg.includes('present') || lowerMsg.includes('overview') || lowerMsg.includes('stats') || lowerMsg.includes('कंपनी') || lowerMsg.includes('rate')) {
      const totalActive = db.prepare(`
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

      const attendancePct = totalActive > 0 ? Math.round((todayPunches / totalActive) * 100) : 0;

      return res.json({
        reply: isHindi
          ? `🏢 **कंपनी लाइव HR स्थिति (${todayStr})**:\n\n` +
            `• **कुल सक्रिय कर्मचारी**: ${totalActive}\n` +
            `• **आज पंच-इन किया**: ${todayPunches} (${attendancePct}% उपस्थिति दर)\n` +
            `• **आज अनुपस्थित / बाकी**: ${Math.max(0, totalActive - todayPunches)}\n` +
            `• **लंबित लीव आवेदन**: ${pendingLeaves}\n` +
            `• **लंबित पंच सुधार**: ${pendingCorrections}\n\n` +
            `सभी डेटा GPS व Firebase Database के साथ लाइव सिंक है।`
          : `🏢 **Company Live HR Overview (${todayStr})**:\n\n` +
            `• **Total Active Staff**: ${totalActive}\n` +
            `• **Punched In Today**: ${todayPunches} (${attendancePct}% attendance rate)\n` +
            `• **Remaining / Absent**: ${Math.max(0, totalActive - todayPunches)}\n` +
            `• **Pending Leave Requests**: ${pendingLeaves}\n` +
            `• **Pending Punch Corrections**: ${pendingCorrections}\n\n` +
            `All attendance data is authenticated with GPS coordinates and Firebase sync.`,
        action: 'COMPANY_OVERVIEW'
      });
    }

    // Subscription & Plan Expiry
    if (lowerMsg.includes('plan') || lowerMsg.includes('subscription') || lowerMsg.includes('expiry') || lowerMsg.includes('tenure') || lowerMsg.includes('renewal')) {
      const comp = db.prepare('SELECT portal_name, plan_expiry_date FROM companies WHERE id = ?').get(companyId);
      const expDate = comp?.plan_expiry_date || 'Lifetime / Active';
      return res.json({
        reply: isHindi
          ? `📋 **कंपनी सब्सक्रिप्शन विवरण**:\n\n• **कंपनी**: ${comp?.portal_name || 'Organization'}\n• **प्लान समाप्ति तारीख**: \`${expDate}\`\n• **सिस्टम स्थिति**: सक्रिय व सुरक्षित`
          : `📋 **Company Subscription Details**:\n\n• **Portal**: ${comp?.portal_name || 'Organization'}\n• **Plan Expiry Date**: \`${expDate}\`\n• **System Status**: Active & Protected`,
        action: 'PLAN_INFO'
      });
    }
  }

  // -------------------------------------------------------------
  // D. SUPER ADMIN / SUPPORT INTENTS
  // -------------------------------------------------------------
  if (role === 'super_admin' || role === 'support') {
    const compCount = db.prepare('SELECT COUNT(*) as count FROM companies WHERE is_deleted = 0').get()?.count || 0;
    const empCount = db.prepare('SELECT COUNT(*) as count FROM employees WHERE is_deleted = 0').get()?.count || 0;

    return res.json({
      reply: isHindi
        ? `🌐 **NPB HRMS ग्लोबल सिस्टम स्थिति**:\n\n• **पंजीकृत कंपनियां**: ${compCount}\n• **कुल पंजीकृत कर्मचारी**: ${empCount}\n• **क्लाउड स्थिति**: लाइव व सुरक्षित`
        : `🌐 **NPB HRMS Global System Status**:\n\n• **Registered Companies**: ${compCount}\n• **Total Staff Registered**: ${empCount}\n• **Cloud Status**: Active & Synced`,
      action: 'SYSTEM_STATUS'
    });
  }

  // -------------------------------------------------------------
  // E. GENERAL SMART ASSISTANCE & GREETINGS
  // (STRICTLY uses cleanDisplayName, NEVER username, phone, or email)
  // -------------------------------------------------------------
  if (lowerMsg.includes('hi') || lowerMsg.includes('hello') || lowerMsg.includes('hey') || lowerMsg.includes('pihu') || lowerMsg.includes('नमस्ते')) {
    return res.json({
      reply: isHindi
        ? `नमस्ते ${cleanDisplayName}! 🌸 मैं हूँ **पिहू**, आपकी स्मार्ट AI सहायक।\n\nमैं आपकी अटेंडेंस दर्ज करने, छुट्टी अप्लाई करने, सपोर्ट टिकट बनाने, और डेटा रिपोर्ट विश्लेषण करने में तुरंत सहायता कर सकती हूँ।\n\nआप मुझसे पूछ सकते हैं:\n• *"Punch In"* / *"Punch Out"*\n• *"Aaj ka working hours"* (कार्य घंटे)\n• *"Mera leave balance"* (छुट्टी बैलेंस)\n• *"Apply my leave"* (छुट्टी अप्लाई करें)\n• *"Attendance correction"* (पंच सुधार)\n• *"Data report analysis"* (मासिक रिपोर्ट विश्लेषण)\n\nबताइए, आज मैं आपकी क्या सहायता करूँ?`
        : `Hi ${cleanDisplayName}! 🌸 I am **PIHU**, your AI Assistant.\n\nI can help you record your Punch In/Out, track working hours, apply for leaves, raise support tickets, correct attendance, and analyze monthly performance reports!\n\nYou can ask me:\n• *"Punch In"* / *"Punch Out"*\n• *"How many hours have I worked today?"*\n• *"What is my leave balance?"*\n• *"Apply my leave"*\n• *"Attendance correction"*\n• *"Data report analysis"*\n\nHow may I help you today?`,
      action: 'GREETING'
    });
  }

  return res.json({
    reply: isHindi
      ? `मैं समझ रही हूँ आपका सवाल: "${rawMsg}".\n\nआप मुझसे अपनी अटेंडेंस, वर्किंग ऑवर्स, छुट्टी बैलेंस, या रिपोर्ट का लाइव डेटा पूछ सकते हैं:\n1. ⏱️ **"Punch In"** या **"Punch Out"** (GPS सत्यापन)\n2. ⏳ **"Aaj kitne ghante kaam kiya"** (कार्य अवधि)\n3. 📅 **"Apply my leave"** (छुट्टी अप्लाई करें)\n4. 🏖️ **"Mera leave balance"** (अवकाश शेष)\n5. 🎫 **"Create ticket"** (सपोर्ट टिकट बनाएं)\n6. 📊 **"Data report analysis"** (मासिक विश्लेषण)`
      : `I analyzed your query: "${rawMsg}".\n\nYou can ask for live attendance, working hours, leave balances, or reports:\n1. ⏱️ **"Punch In"** or **"Punch Out"** (GPS verified)\n2. ⏳ **"How many hours have I worked today?"** (Live duration)\n3. 📅 **"Apply my leave"** (Step-by-step leave apply)\n4. 🏖️ **"What is my leave balance?"** (CL / EL balance)\n5. 🎫 **"Create ticket"** (Raise support ticket)\n6. 📊 **"Data report analysis"** (Monthly report breakdown)`,
    action: 'HELP'
  });
});

// Helper: Handle final leave request submission
function handleLeaveSubmission(req, res, user, companyId, employeeId, startDate, endDate, reason, isHindi) {
  try {
    const currentYear = new Date().getFullYear();

    let leaveType = db.prepare(`
      SELECT lt.id, lt.name, COALESCE(lb.balance, lt.default_yearly_quota) as balance
      FROM leave_types lt
      LEFT JOIN leave_balances lb ON lt.id = lb.leave_type_id AND lb.employee_id = ? AND lb.year = ?
      WHERE lt.company_id = ? AND lt.name NOT LIKE '%Paid Leave%'
      ORDER BY (lt.name LIKE '%Casual%' OR lt.name = 'CL') DESC, lt.id ASC
      LIMIT 1
    `).get(employeeId, currentYear, companyId);

    if (!leaveType) {
      const ins = db.prepare(`
        INSERT INTO leave_types (company_id, name, default_yearly_quota, monthly_accrual_rate, is_carry_forward, max_carry_forward)
        VALUES (?, 'Casual Leave (CL)', 12.0, 1.0, 0, 0.0)
      `).run(companyId);
      leaveType = { id: ins.lastInsertRowid, name: 'Casual Leave (CL)', balance: 12.0 };
    }

    const workingDays = calculateLeaveDays(companyId, employeeId, startDate, endDate);

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
      reply: isHindi
        ? `🎉 **छुट्टी का आवेदन सफलतापूर्वक सबमिट हुआ!** 🌸\n\n` +
          `• **प्रकार**: ${leaveType.name}\n` +
          `• **कब से**: ${startDate}\n` +
          `• **कब तक**: ${endDate}\n` +
          `• **कार्य दिवस**: ${workingDays} दिन\n` +
          `• **कारण**: "${reason}"\n` +
          `• **स्थिति**: \`Pending Approval\` ⏳\n\n` +
          `आपका आवेदन सुपरवाइजर/मैनेजर की स्वीकृति हेतु भेज दिया गया है।`
        : `🎉 **Leave Request Successfully Submitted!** 🌸\n\n` +
          `• **Leave Type**: ${leaveType.name}\n` +
          `• **Start Date**: ${startDate}\n` +
          `• **End Date**: ${endDate}\n` +
          `• **Working Days**: ${workingDays} day(s)\n` +
          `• **Reason**: "${reason}"\n` +
          `• **Status**: \`Pending Approval\` ⏳\n\n` +
          `Your request has been forwarded for supervisor approval.`,
      action: 'LEAVE_SUBMITTED',
      leaveDetails: {
        id: result.lastInsertRowid,
        startDate,
        endDate,
        workingDays,
        reason,
        leaveType: leaveType.name
      },
      conversationState: {}
    });
  } catch (err) {
    console.error('AI Leave submission error:', err);
    return res.status(500).json({
      reply: isHindi ? `लीव सबमिट करने में त्रुटि: ${err.message}` : `Error submitting leave: ${err.message}`,
      action: 'ERROR',
      conversationState: {}
    });
  }
}

module.exports = router;
