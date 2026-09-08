const XLSX = require('xlsx');
const db = require('../db');

function formatTo12Hour(timeStr) {
  if (!timeStr) return '-';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hStr = hours < 10 ? `0${hours}` : hours;
  return `${hStr}:${minutes} ${ampm}`;
}

/**
 * Builds an Excel buffer from rows and selected column keys with Company Name & filter metadata header.
 */
function exportCustomExcel({ data, selectedColumns, sheetName = 'Attendance Report', companyName, reportTitle, dateRange, totalRecords }) {
  const compHeader = companyName || 'NPB HRMS Attendance Management';
  const title = reportTitle || 'Employee Daily Attendance Record (Day-wise)';
  const metaText = `Date/Period: ${dateRange || 'All Time'} | Total Filtered Records: ${totalRecords !== undefined ? totalRecords : data.length} | Generated: ${new Date().toLocaleString()}`;

  const headerRows = [
    [compHeader],
    [title],
    [metaText],
    [], // Blank spacing row
    selectedColumns // Actual table headers
  ];

  const dataRows = data.map(item => {
    return selectedColumns.map(col => {
      let val = item[col];
      // Format punch times if detected
      if ((col.includes('Punch In') || col.includes('Punch Out')) && typeof val === 'string' && val.includes(':')) {
        val = formatTo12Hour(val);
      }
      return val !== undefined && val !== null ? val : '-';
    });
  });

  const allRows = [...headerRows, ...dataRows];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Set column widths automatically
  const colWidths = selectedColumns.map(col => {
    const maxLen = Math.max(
      col.length,
      ...data.slice(0, 100).map(r => String(r[col] || '').length)
    );
    return { wch: Math.min(Math.max(maxLen + 4, 14), 45) };
  });
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Generates an HTML-based printable report document with Company Name, Filter Period, and Record Counts for browser PDF printing.
 */
function exportHtmlReport({ data, selectedColumns, title, companyName, dateRange, totalRecords, generatedBy }) {
  const headers = selectedColumns.map(c => `<th style="border: 1px solid #cbd5e1; padding: 8px 10px; background: #f1f5f9; text-align: left; font-size: 11px; font-weight: 700; color: #1e293b;">${c}</th>`).join('');

  const rows = data.map((item, idx) => {
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    const cells = selectedColumns.map(col => {
      let val = item[col];
      if ((col.includes('Punch In') || col.includes('Punch Out')) && typeof val === 'string' && val.includes(':')) {
        val = formatTo12Hour(val);
      }
      return `<td style="border: 1px solid #e2e8f0; padding: 6px 10px; font-size: 11px; color: #1e293b;">${val !== undefined && val !== null ? val : '-'}</td>`;
    }).join('');
    return `<tr style="background: ${bg};">${cells}</tr>`;
  }).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>${title} - ${companyName || 'NPB HRMS'}</title>
    <style>
      @page { size: landscape; margin: 10mm; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; }
      .header-box { border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 16px; }
      .company-name { font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
      .report-title { font-size: 14px; font-weight: 600; color: #4f46e5; margin-top: 2px; }
      .meta-grid { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 11px; color: #475569; background: #f8fafc; padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0; }
      .meta-item { font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .footer { margin-top: 20px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    </style>
  </head>
  <body>
    <div class="no-print" style="margin-bottom: 16px; display: flex; justify-content: flex-end;">
      <button onclick="window.print()" style="background: #4f46e5; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; items-center; gap: 6px;">
        🖨️ Print / Save as PDF
      </button>
    </div>
    <div class="header-box">
      <div class="company-name">${companyName || 'NPB HRMS Attendance Management'}</div>
      <div class="report-title">${title || 'Employee Daily Attendance Record (Day-Wise)'}</div>
      <div class="meta-grid">
        <div>Period / Filter: <span class="meta-item">${dateRange || 'All Time'}</span></div>
        <div>Total Filtered Records: <span class="meta-item">${totalRecords !== undefined ? totalRecords : data.length}</span></div>
        <div>Generated: <span class="meta-item">${new Date().toLocaleString()}</span></div>
        <div>Generated By: <span class="meta-item">${generatedBy || 'Authorized User'}</span></div>
      </div>
    </div>
    <table>
      <thead>
        <tr>${headers}</tr>
      </thead>
      <tbody>
        ${rows.length ? rows : '<tr><td colspan="' + selectedColumns.length + '" style="text-align:center; padding: 20px; color:#94a3b8;">No records found for this period.</td></tr>'}
      </tbody>
    </table>
    <div class="footer">
      <div>NPB HRMS - Operational Attendance & Audit Record (Zero-Payroll Compliant)</div>
      <div>Confidential &bull; Proprietary Tenant Record</div>
    </div>
    <script>
      window.onload = function() {
        setTimeout(function() { window.print(); }, 400);
      };
    </script>
  </body>
  </html>
  `;
}

/**
 * Generates a Monthly Master Attendance Sheet (1..31 horizontal matrix with P/A/WO/HD/HO/L and Final Payable Days).
 */
function exportMonthlyMatrixHtmlReport({ companyName, employee, month, year, matrixDays, summary }) {
  const mStr = String(month).padStart(2, '0');
  const monthLabel = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Build day header cells (1, 2, 3...)
  const dayNumCells = matrixDays.map(d => `<th style="border: 1px solid #cbd5e1; padding: 4px 2px; font-size: 10px; font-weight: 800; text-align: center; background: #f8fafc; color: #0f172a; min-width: 24px;">${d.day}</th>`).join('');
  const dayNameCells = matrixDays.map(d => {
    const isW = d.status === 'WO' || d.dayName === 'Su';
    return `<th style="border: 1px solid #cbd5e1; padding: 3px 2px; font-size: 8px; font-weight: 700; text-align: center; background: ${isW ? '#fee2e2' : '#f1f5f9'}; color: ${isW ? '#b91c1c' : '#475569'};">${d.dayName}</th>`;
  }).join('');

  // Status badges mapping
  const statusCells = matrixDays.map(d => {
    let bg = '#ffffff';
    let color = '#334155';
    let border = '#e2e8f0';

    if (d.status === 'P') {
      bg = '#dcfce7'; color = '#15803d'; border = '#86efac';
    } else if (d.status === 'HD') {
      bg = '#fef3c7'; color = '#b45309'; border = '#fde68a';
    } else if (d.status === 'A') {
      bg = '#fee2e2'; color = '#b91c1c'; border = '#fca5a5';
    } else if (d.status === 'WO') {
      bg = '#ffe4e6'; color = '#be123c'; border = '#fecdd3';
    } else if (d.status === 'HO') {
      bg = '#ffedd5'; color = '#c2410c'; border = '#fed7aa';
    } else if (d.status === 'L') {
      bg = '#f3e8ff'; color = '#7e22ce'; border = '#d8b4fe';
    } else {
      bg = '#f8fafc'; color = '#94a3b8'; border = '#e2e8f0';
    }

    return `<td style="border: 1px solid ${border}; padding: 4px 1px; text-align: center; font-size: 9px; font-weight: 800; background: ${bg}; color: ${color};" title="${d.tooltip || d.status}">${d.status}</td>`;
  }).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Monthly Master Attendance Sheet - ${employee.fullName || employee.full_name} (${monthLabel})</title>
    <style>
      @page { size: landscape; margin: 8mm; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 16px; }
      @media print { .no-print { display: none !important; } }
      .header-box { border-bottom: 2px solid #4f46e5; padding-bottom: 10px; margin-bottom: 12px; }
      .comp-title { font-size: 18px; font-weight: 900; color: #0f172a; }
      .sheet-title { font-size: 13px; font-weight: 700; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.05em; }
      .emp-badge-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; font-size: 11px; }
      .emp-item span { color: #64748b; font-weight: 500; }
      .emp-item strong { color: #0f172a; font-weight: 700; }
      table.matrix-table { width: 100%; border-collapse: collapse; margin-top: 14px; table-layout: fixed; }
      .legend-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; font-size: 10px; font-weight: 600; padding: 6px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
      .legend-item { display: flex; align-items: center; gap: 4px; }
      .legend-box { display: inline-block; width: 16px; height: 16px; line-height: 16px; text-align: center; font-weight: 800; border-radius: 3px; font-size: 9px; }
      .summary-card { margin-top: 14px; display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
      .stat-tile { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; text-align: center; }
      .stat-tile .val { font-size: 16px; font-weight: 900; color: #0f172a; }
      .stat-tile .lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-top: 2px; }
      .stat-payable { background: #ecfdf5; border: 1.5px solid #10b981; }
      .stat-payable .val { color: #047857; font-size: 18px; }
      .stat-payable .lbl { color: #065f46; font-weight: 800; }
      .footer { margin-top: 20px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 6px; }
    </style>
  </head>
  <body>
    <div class="no-print" style="margin-bottom: 12px; display: flex; justify-content: flex-end;">
      <button onclick="window.print()" style="background: #4f46e5; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">
        🖨️ Print / Save as PDF
      </button>
    </div>

    <div class="header-box">
      <div class="comp-title">${companyName || 'NPB HRMS Attendance Management'}</div>
      <div class="sheet-title">Monthly Employee Attendance Master Sheet</div>

      <div class="emp-badge-grid">
        <div class="emp-item"><span>Staff Name:</span> <strong>${employee.fullName || employee.full_name}</strong></div>
        <div class="emp-item"><span>Employee ID:</span> <strong>${employee.employeeCode || employee.employee_id}</strong></div>
        <div class="emp-item"><span>Department:</span> <strong>${employee.department || 'Operations'}</strong></div>
        <div class="emp-item"><span>Month & Year:</span> <strong>${monthLabel}</strong></div>
      </div>
    </div>

    <!-- Matrix Table 1..31 -->
    <table class="matrix-table">
      <thead>
        <tr>
          <th style="border: 1px solid #cbd5e1; padding: 4px 6px; font-size: 10px; font-weight: 800; text-align: left; background: #f1f5f9; width: 140px;">Employee / Day</th>
          ${dayNumCells}
        </tr>
        <tr>
          <th style="border: 1px solid #cbd5e1; padding: 3px 6px; font-size: 9px; font-weight: 700; text-align: left; background: #e2e8f0; color: #334155;">Weekday</th>
          ${dayNameCells}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10px; font-weight: 700; background: #f8fafc; color: #0f172a;">
            ${employee.fullName || employee.full_name}<br>
            <span style="font-size: 8px; font-weight: normal; color: #64748b;">${employee.employeeCode || employee.employee_id}</span>
          </td>
          ${statusCells}
        </tr>
      </tbody>
    </table>

    <!-- Legend -->
    <div class="legend-bar">
      <div class="legend-item"><span class="legend-box" style="background:#dcfce7; color:#15803d; border:1px solid #86efac;">P</span> Present</div>
      <div class="legend-item"><span class="legend-box" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a;">HD</span> Half Day</div>
      <div class="legend-item"><span class="legend-box" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;">A</span> Absent</div>
      <div class="legend-item"><span class="legend-box" style="background:#ffe4e6; color:#be123c; border:1px solid #fecdd3;">WO</span> Weekly Off</div>
      <div class="legend-item"><span class="legend-box" style="background:#ffedd5; color:#c2410c; border:1px solid #fed7aa;">HO</span> Official Holiday</div>
      <div class="legend-item"><span class="legend-box" style="background:#f3e8ff; color:#7e22ce; border:1px solid #d8b4fe;">L</span> Approved Leave</div>
    </div>

    <!-- Monthly Summary Cards -->
    <div class="summary-card">
      <div class="stat-tile">
        <div class="val">${summary.present}</div>
        <div class="lbl">Present Days (P)</div>
      </div>
      <div class="stat-tile">
        <div class="val">${summary.half_day}</div>
        <div class="lbl">Half Days (HD)</div>
      </div>
      <div class="stat-tile">
        <div class="val">${summary.weekly_off}</div>
        <div class="lbl">Weekly Offs (WO)</div>
      </div>
      <div class="stat-tile">
        <div class="val">${summary.holiday}</div>
        <div class="lbl">Holidays (HO)</div>
      </div>
      <div class="stat-tile">
        <div class="val">${summary.leave}</div>
        <div class="lbl">Leaves (L)</div>
      </div>
      <div class="stat-tile">
        <div class="val" style="color: #b91c1c;">${summary.absent}</div>
        <div class="lbl">Absent Days (A)</div>
      </div>
      <div class="stat-tile stat-payable">
        <div class="val">${summary.payable_days}</div>
        <div class="lbl">Final Payable Days</div>
      </div>
    </div>

    <div class="footer">
      <div>NPB HRMS - Operational Attendance & Audit Record (Zero-Payroll Compliant: Tracks attendance days credit without salary computation)</div>
      <div>Generated: ${new Date().toLocaleString()} &bull; Official Employee Record</div>
    </div>

    <script>
      window.onload = function() {
        setTimeout(function() { window.print(); }, 400);
      };
    </script>
  </body>
  </html>
  `;
}

module.exports = {
  formatTo12Hour,
  exportCustomExcel,
  exportHtmlReport,
  exportMonthlyMatrixHtmlReport
};

