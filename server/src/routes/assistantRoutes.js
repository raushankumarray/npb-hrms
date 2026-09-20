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

  // 0. Super Admin AI Assistant Module Toggle Check
  if (companyId && role !== 'super_admin' && role !== 'support') {
    try {
      const aiMod = db.prepare("SELECT is_enabled FROM company_modules WHERE company_id = ? AND module_name = 'ai_assistant'").get(companyId);
      if (aiMod && !aiMod.is_enabled) {
        return res.status(403).json({
          reply: isHindi
            ? "⚠️ इस कंपनी के लिए सुपर एडमिन द्वारा AI सहायक (Pihu AI) को अक्षम (disable) कर दिया गया है।"
            : "⚠️ AI Assistant (Pihu AI) has been disabled for this company by the Super Administrator.",
          action: 'AI_DISABLED',
          disabled: true,
          conversationState: {}
        });
      }
    } catch (e) {}
  }

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

  // 6. Natural Language Greetings (Strictly when query is pure conversational greeting)
  const cleanDisplayName = getCleanDisplayName(user, isHindi);
  const pureGreetings = ['hi', 'hello', 'hey', 'pihu', 'नमस्ते', 'namaste', 'good morning', 'good afternoon', 'good evening'];
  const isPureGreeting = pureGreetings.some(g => lowerMsg === g || lowerMsg === `${g}!` || lowerMsg === `${g}.` || lowerMsg === `${g} pihu` || lowerMsg === `hi pihu` || lowerMsg === `hello pihu`);

  if (isPureGreeting) {
    if (role === 'manager') {
      return res.json({
        reply: isHindi
          ? `नमस्ते ${cleanDisplayName}! 🌸 मैं हूँ **पिहू**, आपकी टीम प्रबंधन AI सहायक।\n\nआप मुझसे अपनी टीम के बारे में पूछ सकते हैं:\n• *"Who is absent today in my team?"* (आज कौन अनुपस्थित है?)\n• *"Who is present today?"* (आज कौन उपस्थित है?)\n• *"Pending leave approvals"* (लंबित स्वीकृतियां)\n• *"Team attendance report"* (टीम रिपोर्ट विश्लेषण)\n• *"Upcoming holidays"* (आगामी छुट्टियां)\n\nबताइए, आज टीम का क्या विवरण देखना चाहते हैं?`
          : `Hi ${cleanDisplayName}! 🌸 I am **PIHU**, your AI Assistant for Team Management.\n\nYou can ask me:\n• *"Who is absent today in my team?"*\n• *"Who is present today?"*\n• *"Pending leave approvals"*\n• *"Team attendance report"*\n• *"Upcoming holidays"*\n\nHow may I assist you with your team today?`,
        action: 'GREETING'
      });
    }

    if (role === 'company_admin') {
      return res.json({
        reply: isHindi
          ? `नमस्ते ${cleanDisplayName}! 🌸 मैं हूँ **पिहू**, कंपनी प्रशासन के लिए आपकी AI सहायक।\n\nआप मुझसे कंपनी के बारे में पूछ सकते हैं:\n• *"Today company attendance overview"* (कंपनी उपस्थिति दर)\n• *"Active employees count"* (सक्रिय कर्मचारी संख्या)\n• *"Recent bills and invoices"* (मर्चेंट बिलिंग रिकॉर्ड्स)\n• *"Company pending approvals"* (लंबित स्वीकृतियां)\n• *"Monthly attendance report"* (डेटा रिपोर्ट विश्लेषण)\n\nबताइए, आज कंपनी का कौन सा डेटा देखना चाहते हैं?`
          : `Hi ${cleanDisplayName}! 🌸 I am **PIHU**, your Executive AI Assistant for Company Administration.\n\nYou can ask me:\n• *"Today company attendance overview"*\n• *"Active employees count"*\n• *"Recent bills and invoices"*\n• *"Company pending approvals"*\n• *"Monthly attendance report analysis"*\n\nWhat would you like to inspect today?`,
        action: 'GREETING'
      });
    }

    if (role === 'super_admin' || role === 'support') {
      return res.json({
        reply: isHindi
          ? `नमस्ते ${cleanDisplayName}! 🌸 मैं हूँ **पिहू**, आपकी प्लेटफॉर्म एडमिनिस्ट्रेटिव AI सहायक।\n\nआप मुझसे पूछ सकते हैं:\n• *"Platform system overview"*\n• *"Registered companies"*\n• *"Support tickets status"*\n\nबताइए, आज क्या सहायता करूँ?`
          : `Hi ${cleanDisplayName}! 🌸 I am **PIHU**, your Administrative AI Assistant.\n\nYou can ask me:\n• *"Platform system overview"*\n• *"Registered companies overview"*\n• *"Support tickets status"*\n\nHow may I assist you today?`,
        action: 'GREETING'
      });
    }

    // Default: Employee Panel
    return res.json({
      reply: isHindi
        ? `नमस्ते ${cleanDisplayName}! 🌸 मैं हूँ **पिहू**, आपकी स्मार्ट AI सहायक।\n\nमैं आपकी अटेंडेंस दर्ज करने, छुट्टी अप्लाई करने, सपोर्ट टिकट बनाने, और डेटा रिपोर्ट विश्लेषण करने में तुरंत सहायता कर सकती हूँ।\n\nआप मुझसे पूछ सकते हैं:\n• *"Punch In"* / *"Punch Out"*\n• *"Aaj ka working hours"* (कार्य घंटे)\n• *"Mera leave balance"* (छुट्टी बैलेंस)\n• *"Apply my leave"* (छुट्टी अप्लाई करें)\n• *"Attendance correction"* (पंच सुधार)\n• *"Data report analysis"* (मासिक रिपोर्ट विश्लेषण)\n\nबताइए, आज मैं आपकी क्या सहायता करूँ?`
        : `Hi ${cleanDisplayName}! 🌸 I am **PIHU**, your AI Assistant.\n\nI can help you record your Punch In/Out, track working hours, apply for leaves, raise support tickets, correct attendance, and analyze monthly performance reports!\n\nYou can ask me:\n• *"Punch In"* / *"Punch Out"*\n• *"How many hours have I worked today?"*\n• *"What is my leave balance?"*\n• *"Apply my leave"*\n• *"Attendance correction"*\n• *"Data report analysis"*\n\nHow may I help you today?`,
      action: 'GREETING'
    });
  }

  // Active Portal Data Search & Thinking Analysis for Manual User Input
  const searchResult = searchPortalDatabase(user, rawMsg, language);
  return res.json(searchResult);
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

// Helper: Active Portal Data Search & Thinking Analysis
function searchPortalDatabase(user, rawMsg, language) {
  const isHindi = language === 'hi';
  const role = user.role_name || user.role;
  const companyId = user.company_id || (user.company ? user.company.id : null);
  const employeeId = user.employee_id;
  const lowerMsg = (rawMsg || '').toLowerCase();

  const thinkingSteps = [
    `• Query received: "${rawMsg}"`,
    `• Context: User Role = "${role}", Company ID = ${companyId || 'Global'}`,
    `• Analyzing natural language intent and extracting entities...`
  ];

  let reply = '';
  let dataFound = false;

  // 1. Check for specific date
  const dateInfo = parseDateStrings(rawMsg);
  const targetDate = dateInfo ? dateInfo.startDate : new Date().toISOString().split('T')[0];
  if (dateInfo) {
    thinkingSteps.push(`• Target Date recognized: ${targetDate}`);
  }

  // 2. Search Employees in this company
  let matchedEmployees = [];
  let searchedSpecificPerson = false;
  let candidateName = '';

  if (companyId) {
    try {
      const allEmps = db.prepare(`
        SELECT id, full_name, employee_id, department, designation, mobile, status
        FROM employees
        WHERE company_id = ? AND is_deleted = 0
      `).all(companyId);

      // Check if query targets a specific person/employee
      const personMatch = rawMsg.match(/(?:employee|staff|user|karmachari|worker|for|member)\s+([a-zA-Z0-9_]+)/i);
      if (personMatch && !['all', 'everyone', 'sabhi', 'today', 'my', 'the', 'attendance', 'leave', 'bill', 'ticket', 'correction', 'report', 'records', 'record'].includes(personMatch[1].toLowerCase())) {
        searchedSpecificPerson = true;
        candidateName = personMatch[1];
      }

      const words = lowerMsg.replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/).filter(w => w.length >= 3);
      matchedEmployees = allEmps.filter(emp => {
        const fn = (emp.full_name || '').toLowerCase();
        const code = (emp.employee_id || '').toLowerCase();
        const mob = (emp.mobile || '');
        if (lowerMsg.includes(fn) || (code && lowerMsg.includes(code)) || (mob && lowerMsg.includes(mob))) {
          return true;
        }
        return words.some(w => fn.includes(w) && !['attendance', 'record', 'records', 'leave', 'shift', 'punch', 'status', 'report'].includes(w));
      });
    } catch (e) {}
  }

  // 3. Classify intent & Search Portal:

  // A. Non-existent specific person search
  if (searchedSpecificPerson && matchedEmployees.length === 0) {
    thinkingSteps.push(`• Targeted employee search for entity: "${candidateName}"`);
    thinkingSteps.push(`• Queried "employees" table in company ID ${companyId}...`);
    thinkingSteps.push(`• Result: No employee matching "${candidateName}" found in the portal database.`);
    dataFound = false;
    reply = isHindi
      ? `🔍 **पोर्टल सर्च परिणाम**:\n\nकंपनी पोर्टल डेटाबेस में **'${candidateName}'** नाम या कोड का कोई भी कर्मचारी रिकॉर्ड दर्ज नहीं मिला।`
      : `🔍 **Portal Search Result**:\n\nNo employee matching **'${candidateName}'** was found in the portal database for your company.`;
  }

  // B. Specific Matched Employee Query
  else if (matchedEmployees.length > 0 && !lowerMsg.includes('all employee') && !lowerMsg.includes('sabhi') && !lowerMsg.includes('everyone') && !lowerMsg.includes('count') && !lowerMsg.includes('total')) {
    const emp = matchedEmployees[0];
    thinkingSteps.push(`• Found matching employee in database: "${emp.full_name}" (ID: ${emp.employee_id || emp.id})`);
    thinkingSteps.push(`• Querying attendance records and leave balances for employee ID ${emp.id}...`);

    let att = null;
    let leaves = [];
    try {
      att = db.prepare(`
        SELECT * FROM attendance_records
        WHERE company_id = ? AND employee_id = ? AND date = ?
      `).get(companyId, emp.id, targetDate);

      const curYear = new Date().getFullYear();
      leaves = db.prepare(`
        SELECT lt.name, COALESCE(lb.balance, lt.default_yearly_quota) as bal
        FROM leave_types lt
        LEFT JOIN leave_balances lb ON lt.id = lb.leave_type_id AND lb.employee_id = ? AND lb.year = ?
        WHERE lt.company_id = ?
      `).all(emp.id, curYear, companyId);
    } catch (e) {}

    dataFound = true;
    let attText = att 
      ? `• **Date**: ${targetDate}\n• **Status**: \`${att.status}\`\n• **Punch In**: ${att.punch_in_time ? format12Hr(att.punch_in_time) : '--:--'} (${att.punch_in_area || 'Site'})\n• **Punch Out**: ${att.punch_out_time ? format12Hr(att.punch_out_time) : '--:--'}\n• **Working Hours**: ${att.working_hours || 0} hrs`
      : `• **Attendance on ${targetDate}**: *No punch record found in portal (Absent / Off)*`;

    let leaveText = leaves.map(l => `• ${l.name}: **${l.bal}** days`).join('\n') || '• No leave balances assigned';

    reply = isHindi
      ? `👤 **कर्मचारी पोर्टल रिकॉर्ड: ${emp.full_name}**\n\n` +
        `• **कर्मचारी कोड**: \`${emp.employee_id || 'N/A'}\`\n` +
        `• **विभाग**: ${emp.department || 'General'}\n` +
        `• **पद (Designation)**: ${emp.designation || 'Staff'}\n` +
        `• **मोबाइल**: ${emp.mobile || 'N/A'}\n` +
        `• **स्थिति**: \`${emp.status}\`\n\n` +
        `📅 **उपस्थिति विवरण (${targetDate})**:\n${attText}\n\n` +
        `🏖️ **अवकाश बैलेंस**:\n${leaveText}`
      : `👤 **Portal Employee Record: ${emp.full_name}**\n\n` +
        `• **Employee Code**: \`${emp.employee_id || 'N/A'}\`\n` +
        `• **Department**: ${emp.department || 'General'}\n` +
        `• **Designation**: ${emp.designation || 'Staff'}\n` +
        `• **Mobile**: ${emp.mobile || 'N/A'}\n` +
        `• **Account Status**: \`${emp.status}\`\n\n` +
        `📅 **Attendance Summary (${targetDate})**:\n${attText}\n\n` +
        `🏖️ **Leave Balance Quota**:\n${leaveText}`;
  }

  // C. Data Report Analysis / Monthly Performance
  else if (lowerMsg.includes('report') || lowerMsg.includes('analysis') || lowerMsg.includes('विश्लेषण') || lowerMsg.includes('रिपोर्ट') || lowerMsg.includes('monthly attendance')) {
    thinkingSteps.push(`• Detected attendance report analysis request.`);
    const curYear = new Date().getFullYear();
    const curMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    const startOfMonth = `${curYear}-${curMonth}-01`;
    const endOfMonth = `${curYear}-${curMonth}-31`;

    if (role === 'employee') {
      thinkingSteps.push(`• Querying monthly attendance records for employee ID ${employeeId} (${startOfMonth} to ${endOfMonth})...`);
      let records = [];
      try {
        records = db.prepare(`
          SELECT date, punch_in_time, punch_out_time, total_hours, status
          FROM attendance_records
          WHERE employee_id = ? AND date BETWEEN ? AND ?
          ORDER BY date ASC
        `).all(employeeId, startOfMonth, endOfMonth);
      } catch (e) {}

      if (records.length > 0) {
        dataFound = true;
        const presents = records.filter(r => r.status === 'Present').length;
        const halfDays = records.filter(r => r.status === 'Half Day').length;
        const absents = records.filter(r => r.status === 'Absent' || r.status === 'Missing Punch In').length;
        const totalHours = records.reduce((acc, r) => acc + (parseFloat(r.total_hours) || 0), 0);
        const avgHours = presents > 0 ? (totalHours / presents).toFixed(1) : '0.0';

        reply = isHindi
          ? `📈 **मासिक अटेंडेंस विश्लेषण (${curYear}-${curMonth})**:\n\n` +
            `• **उपस्थित दिन (Presents)**: \`${presents} दिन\`\n` +
            `• **हाफ डे (Half Days)**: \`${halfDays} दिन\`\n` +
            `• **अनुपस्थित दिन (Absents)**: \`${absents} दिन\`\n` +
            `• **कुल कार्य घंटे (Total Hours)**: \`${totalHours.toFixed(1)} hrs\`\n` +
            `• **औसत दैनिक घंटे (Avg Daily)**: \`${avgHours} hrs/day\`\n\n` +
            `आपकी अटेंडेंस बहुत अच्छी चल रही है। पूरा दैनिक लॉग 'Attendance' टैब में उपलब्ध है।`
          : `📈 **Monthly Attendance Report Analysis (${curYear}-${curMonth})**:\n\n` +
            `• **Present Days**: \`${presents} days\`\n` +
            `• **Half Days**: \`${halfDays} days\`\n` +
            `• **Absent Days**: \`${absents} days\`\n` +
            `• **Total Working Hours**: \`${totalHours.toFixed(1)} hrs\`\n` +
            `• **Average Daily Duration**: \`${avgHours} hrs/day\`\n\n` +
            `Your monthly performance record is synced with verified GPS. Full details are available in the Attendance tab.`;
      } else {
        dataFound = false;
        reply = isHindi
          ? `🔍 **पोर्टल सर्च परिणाम (रिपोर्ट)**:\n\nचालू माह (${curYear}-${curMonth}) के लिए पोर्टल में कोई उपस्थिति रिकॉर्ड दर्ज नहीं मिला।`
          : `🔍 **Portal Search Result (Report)**:\n\nNo monthly attendance records found in the portal for period ${curYear}-${curMonth}.`;
      }
    } else {
      // Manager or Company Admin
      thinkingSteps.push(`• Querying company-wide attendance records for ${curYear}-${curMonth}...`);
      let records = [];
      let totalEmps = 0;
      try {
        records = db.prepare(`
          SELECT a.id, a.status, a.total_hours
          FROM attendance_records a
          WHERE a.company_id = ? AND a.date BETWEEN ? AND ?
        `).all(companyId, startOfMonth, endOfMonth);
        totalEmps = db.prepare('SELECT COUNT(*) as c FROM employees WHERE company_id = ? AND is_deleted = 0').get(companyId).c;
      } catch (e) {}

      if (records.length > 0) {
        dataFound = true;
        const totalPunches = records.length;
        reply = isHindi
          ? `📊 **कंपनी मासिक उपस्थिति विश्लेषण रिपोर्ट (${curYear}-${curMonth})**:\n\n` +
            `• **सक्रिय कर्मचारी**: ${totalEmps}\n` +
            `• **माह के कुल उपस्थिति लॉग**: ${totalPunches} रिकॉर्ड्स\n` +
            `• विस्तृत रिपोर्ट देखने के लिए **Attendance Reports** टैब पर जाएं।`
          : `📊 **Company Monthly Attendance Report Analysis (${curYear}-${curMonth})**:\n\n` +
            `• **Active Staff**: ${totalEmps}\n` +
            `• **Total Monthly Punch Records**: ${totalPunches}\n` +
            `• For detailed exportable reports, please navigate to the **Attendance Reports** tab.`;
      } else {
        dataFound = false;
        reply = isHindi
          ? `🔍 **पोर्टल सर्च परिणाम (रिपोर्ट)**:\n\nइस माह कंपनी के लिए कोई उपस्थिति रिकॉर्ड दर्ज नहीं मिला।`
          : `🔍 **Portal Search Result (Report)**:\n\nNo monthly attendance records found in the portal database for this period.`;
      }
    }
  }

  // D. Attendance / Punch Inquiry
  else if (
    lowerMsg.includes('attendance') || lowerMsg.includes('punch') || lowerMsg.includes('upsthiti') ||
    lowerMsg.includes('present') || lowerMsg.includes('absent') || lowerMsg.includes('working hour') ||
    lowerMsg.includes('hours') || lowerMsg.includes('ghante') || lowerMsg.includes('in time') || lowerMsg.includes('out time') || lowerMsg.includes('late')
  ) {
    thinkingSteps.push(`• Detected attendance inquiry for date: ${targetDate}`);
    thinkingSteps.push(`• Querying table "attendance_records" where company_id = ${companyId}...`);

    if (role === 'employee') {
      let myAtt = null;
      try {
        myAtt = db.prepare(`
          SELECT * FROM attendance_records
          WHERE company_id = ? AND employee_id = ? AND date = ?
        `).get(companyId, employeeId, targetDate);
      } catch (e) {}

      if (myAtt) {
        dataFound = true;
        reply = isHindi
          ? `📅 **पोर्टल उपस्थिति रिकॉर्ड (${targetDate})**:\n\n` +
            `• **स्थिति**: \`${myAtt.status}\`\n` +
            `• **पंच-इन**: **${myAtt.punch_in_time ? format12Hr(myAtt.punch_in_time) : '--:--'}** (${myAtt.punch_in_area || 'Verified Location'})\n` +
            `• **पंच-आउट**: **${myAtt.punch_out_time ? format12Hr(myAtt.punch_out_time) : '--:--'}**\n` +
            `• **कुल कार्य अवधि**: **${myAtt.working_hours || 0} घंटे**`
          : `📅 **Portal Attendance Record (${targetDate})**:\n\n` +
            `• **Status**: \`${myAtt.status}\`\n` +
            `• **Punch-In Time**: **${myAtt.punch_in_time ? format12Hr(myAtt.punch_in_time) : '--:--'}** (${myAtt.punch_in_area || 'Verified Location'})\n` +
            `• **Punch-Out Time**: **${myAtt.punch_out_time ? format12Hr(myAtt.punch_out_time) : '--:--'}**\n` +
            `• **Total Working Duration**: **${myAtt.working_hours || 0} hrs**`;
      } else {
        dataFound = false;
        reply = isHindi
          ? `🔍 **पोर्टल सर्च परिणाम (उपस्थिति)**:\n\n` +
            `तारीख **${targetDate}** के लिए पोर्टल डेटाबेस में आपका कोई पंच रिकॉर्ड दर्ज नहीं है।\n` +
            `यदि आप पंच लगाना भूल गए थे, तो आप **"Attendance correction"** लिखकर पंच सुधार अनुरोध भेज सकते हैं।`
          : `🔍 **Portal Search Result (Attendance)**:\n\n` +
            `No punch record was found in the portal database for date **${targetDate}**.\n` +
            `If you forgot to punch, you can request an attendance correction by typing **"Attendance correction"**.`;
      }
    } else {
      // Manager or Company Admin
      let records = [];
      let totalEmps = 0;
      try {
        records = db.prepare(`
          SELECT a.*, e.full_name, e.employee_id as emp_code, e.department
          FROM attendance_records a
          JOIN employees e ON a.employee_id = e.id
          WHERE a.company_id = ? AND a.date = ?
        `).all(companyId, targetDate);

        totalEmps = db.prepare('SELECT COUNT(*) as c FROM employees WHERE company_id = ? AND is_deleted = 0').get(companyId).c;
      } catch (e) {}

      if (records.length > 0) {
        dataFound = true;
        const presentList = records.filter(r => r.status === 'Present' || r.status === 'Half Day');
        reply = isHindi
          ? `📊 **कंपनी उपस्थिति डेटा (${targetDate})**:\n\n` +
            `• **कुल कर्मचारी**: ${totalEmps}\n` +
            `• **उपस्थित**: **${presentList.length}** कर्मचारी\n` +
            `• **अनुपस्थित/ऑफ**: **${Math.max(0, totalEmps - presentList.length)}** कर्मचारी\n\n` +
            `**हाल के पंच:**\n` +
            records.slice(0, 5).map(r => `• ${r.full_name} (${r.emp_code || 'Staff'}): \`${r.status}\` | In: ${r.punch_in_time ? format12Hr(r.punch_in_time) : '--:--'}`).join('\n')
          : `📊 **Company Attendance Data (${targetDate})**:\n\n` +
            `• **Total Staff**: ${totalEmps}\n` +
            `• **Present**: **${presentList.length}** employees\n` +
            `• **Absent / Off**: **${Math.max(0, totalEmps - presentList.length)}** employees\n\n` +
            `**Recent Punches:**\n` +
            records.slice(0, 5).map(r => `• ${r.full_name} (${r.emp_code || 'Staff'}): \`${r.status}\` | In: ${r.punch_in_time ? format12Hr(r.punch_in_time) : '--:--'}`).join('\n');
      } else {
        dataFound = false;
        reply = isHindi
          ? `🔍 **पोर्टल सर्च परिणाम (उपस्थिति)**:\n\n` +
            `तारीख **${targetDate}** के लिए कंपनी पोर्टल डेटाबेस में कोई भी पंच उपस्थिति रिकॉर्ड नहीं मिला।`
          : `🔍 **Portal Search Result (Attendance)**:\n\n` +
            `No attendance punch records found in the portal database for date **${targetDate}**.`;
      }
    }
  }

  // E. Leave Balance / Leave Requests
  else if (lowerMsg.includes('leave') || lowerMsg.includes('chutti') || lowerMsg.includes('balance') || lowerMsg.includes('cl') || lowerMsg.includes('el')) {
    thinkingSteps.push(`• Detected leave inquiry. Querying leave_types, leave_balances, and leave_requests...`);

    const curYear = new Date().getFullYear();
    let leaves = [];
    let reqs = [];
    try {
      leaves = employeeId ? db.prepare(`
        SELECT lt.name, COALESCE(lb.balance, lt.default_yearly_quota) as bal
        FROM leave_types lt
        LEFT JOIN leave_balances lb ON lt.id = lb.leave_type_id AND lb.employee_id = ? AND lb.year = ?
        WHERE lt.company_id = ?
      `).all(employeeId, curYear, companyId) : [];

      reqs = employeeId ? db.prepare(`
        SELECT * FROM leave_requests
        WHERE company_id = ? AND employee_id = ?
        ORDER BY id DESC LIMIT 3
      `).all(companyId, employeeId) : [];
    } catch (e) {}

    if (leaves.length > 0 || reqs.length > 0) {
      dataFound = true;
      const balStr = leaves.map(l => `• **${l.name}**: ${l.bal} days available`).join('\n');
      const reqStr = reqs.length > 0
        ? reqs.map(r => `• ${r.start_date} to ${r.end_date} (${r.total_days} days) - Status: \`${r.status}\``).join('\n')
        : '• No recent leave requests submitted.';

      reply = isHindi
        ? `🏖️ **पोर्टल अवकाश विवरण (Leave Balances & Status)**:\n\n` +
          `**उपलब्ध लीव बैलेंस (${curYear}):**\n${balStr}\n\n` +
          `**हाल के आवेदन:**\n${reqStr}`
        : `🏖️ **Portal Leave Details & Quota**:\n\n` +
          `**Available Leave Balances (${curYear}):**\n${balStr}\n\n` +
          `**Recent Leave Applications:**\n${reqStr}`;
    } else {
      dataFound = false;
      reply = isHindi
        ? `🔍 **पोर्टल सर्च परिणाम (लीव)**:\n\nपोर्टल में आपके लिए कोई लीव रिकॉर्ड या बैलेंस दर्ज नहीं मिला।`
        : `🔍 **Portal Search Result (Leave)**:\n\nNo leave balances or requests found in the portal records for your account.`;
    }
  }

  // F. Tickets / Complaints
  else if (lowerMsg.includes('ticket') || lowerMsg.includes('complaint') || lowerMsg.includes('helpdesk') || lowerMsg.includes('shikayat')) {
    thinkingSteps.push(`• Detected ticket/helpdesk inquiry. Querying service_requests table...`);
    let tickets = [];
    try {
      if (role === 'employee') {
        tickets = db.prepare(`
          SELECT id, title, status, priority, created_at FROM service_requests
          WHERE company_id = ? AND employee_id = ?
          ORDER BY id DESC LIMIT 5
        `).all(companyId, employeeId);
      } else {
        tickets = db.prepare(`
          SELECT id, title, status, priority, created_at FROM service_requests
          WHERE company_id = ?
          ORDER BY id DESC LIMIT 5
        `).all(companyId);
      }
    } catch (e) {}

    if (tickets.length > 0) {
      dataFound = true;
      reply = isHindi
        ? `🎫 **पोर्टल सपोर्ट टिकट्स (${tickets.length} रिकॉर्ड मिले)**:\n\n` +
          tickets.map(t => `• **#TKT-${t.id}**: ${t.title} [Status: \`${t.status}\`, Priority: \`${t.priority || 'Normal'}\`]`).join('\n')
        : `🎫 **Portal Support Tickets (${tickets.length} record(s) found)**:\n\n` +
          tickets.map(t => `• **#TKT-${t.id}**: ${t.title} [Status: \`${t.status}\`, Priority: \`${t.priority || 'Normal'}\`]`).join('\n');
    } else {
      dataFound = false;
      reply = isHindi
        ? `🔍 **पोर्टल सर्च परिणाम (टिकट)**:\n\nपोर्टल डेटाबेस में आपका कोई भी टिकट दर्ज नहीं है। टिकट बनाने के लिए **"Create support ticket"** लिखें।`
        : `🔍 **Portal Search Result (Tickets)**:\n\nNo tickets found in the portal database for your account. Type **"Create support ticket"** to raise a new one.`;
    }
  }

  // G. Billing / Invoices Query
  else if (lowerMsg.includes('bill') || lowerMsg.includes('invoice') || lowerMsg.includes('pos') || lowerMsg.includes('merchant')) {
    thinkingSteps.push(`• Detected merchant billing inquiry. Querying billing_invoices table...`);
    let invs = [];
    try {
      invs = db.prepare(`
        SELECT invoice_no, bill_date, customer_name, grand_total, status
        FROM billing_invoices
        WHERE company_id = ?
        ORDER BY id DESC LIMIT 5
      `).all(companyId);
    } catch (e) {}

    if (invs.length > 0) {
      dataFound = true;
      reply = isHindi
        ? `🧾 **मर्चेंट बिलिंग रिकॉर्ड्स (${invs.length} बिल मिले)**:\n\n` +
          invs.map(b => `• **${b.invoice_no}** (${b.bill_date}) - ${b.customer_name}: **₹${b.grand_total}** [\`${b.status}\`]`).join('\n')
        : `🧾 **Merchant Billing Records (${invs.length} bills found)**:\n\n` +
          invs.map(b => `• **${b.invoice_no}** (${b.bill_date}) - ${b.customer_name}: **₹${b.grand_total}** [\`${b.status}\`]`).join('\n');
    } else {
      dataFound = false;
      reply = isHindi
        ? `🔍 **पोर्टल सर्च परिणाम (बिलिंग)**:\n\nकंपनी डेटाबेस में कोई बिल या इनवॉइस दर्ज नहीं मिला। आप **Merchant & Billing** टैब से नया बिल बना सकते हैं।`
        : `🔍 **Portal Search Result (Billing)**:\n\nNo invoices or bills found in the portal database. You can create a new bill from the **Merchant & Billing** tab.`;
    }
  }

  // H. Fallback General Search across portal
  else {
    thinkingSteps.push(`• Querying general portal directories (employees, holidays, company metrics)...`);
    const todayStr = new Date().toISOString().split('T')[0];
    dataFound = false;
    thinkingSteps.push(`• No specific entity pattern matched. Queried portal database.`);

    reply = isHindi
      ? `🔍 **पोर्टल डेटाबेस सर्च विश्लेषण**:\n\n` +
        `मैंने आपके सवाल: *"${rawMsg}"* का विश्लेषण किया और आपके **${role}** पैनल के पोर्टल डेटाबेस में खोज की।\n\n` +
        `❌ **पोर्टल में इस अनुरोध से संबंधित कोई रिकॉर्ड नहीं मिला।**\n\n` +
        `💡 **पोर्टल में आप क्या पूछ सकते हैं?**\n` +
        `• किसी भी कर्मचारी का नाम या कोड (जैसे: *Rahul Sharma*, *EMP001*)\n` +
        `• किसी विशेष तारीख की अटेंडेंस (जैसे: *Attendance on ${todayStr}*)\n` +
        `• छुट्टी व बैलेंस (जैसे: *Mera leave balance kitna hai?*)\n` +
        `• सपोर्ट टिकट्स (जैसे: *Ticket status*)\n` +
        `• आगामी छुट्टियां (जैसे: *Upcoming holidays*)`
      : `🔍 **Portal Database Search Analysis**:\n\n` +
        `I analyzed your query: *"${rawMsg}"* and actively searched the portal database within your **${role}** panel scope.\n\n` +
        `❌ **No matching data records were found in the portal database.**\n\n` +
        `💡 **What you can search directly from the portal:**\n` +
        `• Search any staff member by name or code (e.g. *Rahul*, *EMP001*)\n` +
        `• Check attendance for any date (e.g. *Attendance on ${todayStr}*)\n` +
        `• Inquire leave balance (e.g. *What is my leave balance?*)\n` +
        `• Check tickets (e.g. *Show my tickets*)\n` +
        `• View upcoming holidays (e.g. *Upcoming holidays*)`;
  }

  thinkingSteps.push(`• Search completed. Result: ${dataFound ? 'Data Found in Portal' : 'No Data Found in Portal'}.`);

  return {
    reply,
    thinking: thinkingSteps.join('\n'),
    dataFound,
    action: 'SEARCH_COMPLETE',
    conversationState: {}
  };
}

module.exports = router;
