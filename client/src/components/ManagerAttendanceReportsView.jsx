import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock, Calendar, Users, Filter, Download,
  FileSpreadsheet, FileText, CheckCircle, AlertTriangle, RefreshCw,
  Check, X, SlidersHorizontal, ChevronLeft, ChevronRight,
  Eye, CheckSquare, Square, ChevronDown, Search,
  MapPin, ShieldCheck, ArrowRight, History, Inbox, Ban,
  Layers, ChevronUp, Sparkles, FileCheck, HelpCircle, Columns
} from 'lucide-react';
import { apiRequest } from '../api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// The 10 standard report headers specified
const STANDARD_REPORT_HEADERS = [
  { key: 'Employee ID', label: 'Employee ID', description: 'Unique company employee code' },
  { key: 'Employee Name', label: 'Employee Name', description: 'Full legal name of staff' },
  { key: 'Punch In Time', label: 'Punch In Time', description: 'Recorded punch-in in 12-hr format or --:--:--' },
  { key: 'Punch In Lat/Long', label: 'Punch In Lat/Long', description: 'GPS coordinates of punch in' },
  { key: 'Punch In Address', label: 'Punch In Address', description: 'Clean area / office location name' },
  { key: 'Punch Out Time', label: 'Punch Out Time', description: 'Recorded punch-out in 12-hr format or --:--:--' },
  { key: 'Punch Out Lat/Long', label: 'Punch Out Lat/Long', description: 'GPS coordinates of punch out' },
  { key: 'Punch Out Address', label: 'Punch Out Address', description: 'Clean area / office location name' },
  { key: 'Status', label: 'Status', description: 'Present, Absent, Leave, Holiday, Weekly Off, Half Day' },
  { key: 'Working Hours (HH:MM)', label: 'Working Hours (HH:MM)', description: 'Total shift duration strictly in HH:MM' }
];

// Section 2 headers with Date strictly as 1st column
const SECTION_2_REPORT_HEADERS = [
  { key: 'Date', label: 'Date (Day)', description: 'Calendar date and weekday without skipping any date' },
  ...STANDARD_REPORT_HEADERS
];

export default function ManagerAttendanceReportsView({ user, company = {}, onStatsUpdate }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Global Alerts
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Team employees list
  const [teamEmployees, setTeamEmployees] = useState([]);
  const [loadingTeam, setLoadingTeam] = useState(false);

  // ==========================================
  // SECTION 1 STATE: DAILY ATTENDANCE REPORT
  // ==========================================
  const [sec1Date, setSec1Date] = useState(todayStr);
  const [sec1EmpMode, setSec1EmpMode] = useState('all'); // 'all' | 'individual' | 'multiple'
  const [sec1SelectedIndividualEmp, setSec1SelectedIndividualEmp] = useState('');
  const [sec1SelectedMultipleEmps, setSec1SelectedMultipleEmps] = useState([]);
  const [sec1ShowMultiDropdown, setSec1ShowMultiDropdown] = useState(false);
  const [sec1MultiEmpSearch, setSec1MultiEmpSearch] = useState('');

  const [sec1PageSizeOption, setSec1PageSizeOption] = useState('10'); // '10' | '25' | '50' | 'custom'
  const [sec1PageSize, setSec1PageSize] = useState(10);
  const [sec1CustomPageSizeInput, setSec1CustomPageSizeInput] = useState('');
  const [sec1Page, setSec1Page] = useState(1);
  const [sec1StatusFilter, setSec1StatusFilter] = useState('all');
  const [sec1Search, setSec1Search] = useState('');

  const [sec1Records, setSec1Records] = useState([]);
  const [sec1Total, setSec1Total] = useState(0);
  const [sec1Summary, setSec1Summary] = useState({ total: 0, present: 0, absent: 0, half_day: 0, leave: 0 });
  const [sec1Loading, setSec1Loading] = useState(false);

  // Pre-Download Column Customizer for Section 1
  const [sec1SelectedCols, setSec1SelectedCols] = useState(STANDARD_REPORT_HEADERS.map(h => h.key));
  const [showSec1ColModal, setShowSec1ColModal] = useState(false);
  const [sec1Exporting, setSec1Exporting] = useState(false);

  // ========================================================
  // SECTION 2 STATE: ALL EMPLOYEE FULL MONTH LOGS (NO SKIP)
  // ========================================================
  const [sec2Month, setSec2Month] = useState(currentMonth);
  const [sec2Year, setSec2Year] = useState(currentYear);
  const [sec2EmpMode, setSec2EmpMode] = useState('all'); // 'all' | 'individual' | 'multiple'
  const [sec2SelectedIndividualEmp, setSec2SelectedIndividualEmp] = useState('');
  const [sec2SelectedMultipleEmps, setSec2SelectedMultipleEmps] = useState([]);
  const [sec2ShowMultiDropdown, setSec2ShowMultiDropdown] = useState(false);
  const [sec2MultiEmpSearch, setSec2MultiEmpSearch] = useState('');

  // Default 10 rows per page for Section 2 per user requirement
  const [sec2PageSizeOption, setSec2PageSizeOption] = useState('10'); // '10' | '25' | '50' | 'custom'
  const [sec2PageSize, setSec2PageSize] = useState(10);
  const [sec2CustomPageSizeInput, setSec2CustomPageSizeInput] = useState('');
  const [sec2Page, setSec2Page] = useState(1);
  const [sec2StatusFilter, setSec2StatusFilter] = useState('all');
  const [sec2Search, setSec2Search] = useState('');

  const [sec2Records, setSec2Records] = useState([]);
  const [sec2Total, setSec2Total] = useState(0);
  const [sec2Summary, setSec2Summary] = useState({ total: 0, present: 0, absent: 0, half_day: 0, leave: 0, wo: 0, holiday: 0 });
  const [sec2Loading, setSec2Loading] = useState(false);

  // Pre-Download Column Customizer for Section 2 (Date strictly 1st column)
  const [sec2SelectedCols, setSec2SelectedCols] = useState(SECTION_2_REPORT_HEADERS.map(h => h.key));
  const [showSec2ColModal, setShowSec2ColModal] = useState(false);
  const [sec2Exporting, setSec2Exporting] = useState(false);

  // ==========================================
  // APPROVALS SECTION STATE (Corrections & Leaves)
  // ==========================================
  const [approvalTab, setApprovalTab] = useState('pending'); // 'pending' | 'archived'
  const [pendingCorrections, setPendingCorrections] = useState([]);
  const [archivedCorrections, setArchivedCorrections] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [archivedLeaves, setArchivedLeaves] = useState([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState('');

  // ----------------------------------------------------
  // Helpers: Format Clean Area Name, 12-Hour, and HH:MM
  // ----------------------------------------------------
  const cleanAreaName = (raw) => {
    if (!raw || raw === '-' || raw === '--') return '--';
    let cleaned = String(raw).replace(/\s*\(?-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+\)?/g, '').replace(/^Map Area\s*/i, '').trim();
    cleaned = cleaned.replace(/^,\s*|,\s*$/g, '').trim();
    if (!cleaned || cleaned === '-') return 'Office / Designated Area';
    return cleaned;
  };

  const format12Hour = (timeStr) => {
    if (!timeStr || timeStr === '-' || timeStr === '--' || timeStr === '--:--' || timeStr === '--:--:--') return '--:--:--';
    if (typeof timeStr === 'string' && (timeStr.includes('AM') || timeStr.includes('PM'))) return timeStr;
    const parts = String(timeStr).split(':');
    if (parts.length < 2) return timeStr;
    let h = parseInt(parts[0], 10);
    if (isNaN(h)) return '--:--:--';
    const m = parts[1];
    const s = parts[2] || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    return `${String(h).padStart(2, '0')}:${m}:${s} ${ampm}`;
  };

  const formatWorkingHoursHHMM = (totalHours, inTime, outTime) => {
    if (totalHours !== null && totalHours !== undefined && !isNaN(Number(totalHours)) && Number(totalHours) > 0) {
      const th = Number(totalHours);
      let h = Math.floor(th);
      let m = Math.round((th - h) * 60);
      if (m >= 60) { h += 1; m = 0; }
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    if (inTime && outTime && inTime !== '-' && inTime !== '--:--:--' && outTime !== '-' && outTime !== '--:--:--') {
      const p1 = String(inTime).split(':').map(Number);
      const p2 = String(outTime).split(':').map(Number);
      if (!p1.some(isNaN) && !p2.some(isNaN)) {
        const s1 = (p1[0] || 0) * 3600 + (p1[1] || 0) * 60 + (p1[2] || 0);
        const s2 = (p2[0] || 0) * 3600 + (p2[1] || 0) * 60 + (p2[2] || 0);
        const diffSec = s2 - s1;
        if (diffSec > 0) {
          const h = Math.floor(diffSec / 3600);
          const m = Math.floor((diffSec % 3600) / 60);
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
      }
    }
    return '00:00';
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'present') {
      return <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">Present</span>;
    }
    if (s === 'absent') {
      return <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300">Absent</span>;
    }
    if (s === 'half day') {
      return <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">Half Day</span>;
    }
    if (s === 'leave') {
      return <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-300">Leave</span>;
    }
    if (s === 'weekly off' || s === 'wo') {
      return <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-300">Weekly Off</span>;
    }
    if (s === 'holiday' || s === 'ho') {
      return <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-300">Holiday</span>;
    }
    if (s === 'upcoming') {
      return <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200">Upcoming</span>;
    }
    return <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">{status || '-'}</span>;
  };

  // ----------------------------------------------------
  // Load Team Employees
  // ----------------------------------------------------
  const fetchTeamEmployees = async () => {
    setLoadingTeam(true);
    try {
      const res = await apiRequest('/employees?limit=250');
      const list = res.employees || [];
      setTeamEmployees(list);
    } catch (err) {
      console.error('Failed to load team employees:', err);
    } finally {
      setLoadingTeam(false);
    }
  };

  // ----------------------------------------------------
  // Section 1: Fetch Daily Attendance Records
  // ----------------------------------------------------
  const fetchSection1Data = async () => {
    setSec1Loading(true);
    setError('');
    try {
      const offset = (sec1Page - 1) * sec1PageSize;
      const params = new URLSearchParams();
      params.append('date', sec1Date);
      params.append('limit', sec1PageSize);
      params.append('offset', offset);

      if (sec1EmpMode === 'individual' && sec1SelectedIndividualEmp) {
        params.append('employee_id', sec1SelectedIndividualEmp);
      } else if (sec1EmpMode === 'multiple' && sec1SelectedMultipleEmps.length > 0) {
        params.append('employee_ids', sec1SelectedMultipleEmps.join(','));
      }

      if (sec1StatusFilter && sec1StatusFilter !== 'all') {
        params.append('status', sec1StatusFilter);
      }

      if (sec1Search.trim()) {
        params.append('search', sec1Search.trim());
      }

      const res = await apiRequest(`/attendance/list?${params.toString()}`);
      setSec1Records(res.records || []);
      setSec1Total(res.total || 0);
      if (res.summary) setSec1Summary(res.summary);
    } catch (err) {
      setError(err.message || 'Failed to fetch daily attendance report.');
    } finally {
      setSec1Loading(false);
    }
  };

  // ----------------------------------------------------
  // Section 2: Fetch All Employee Full Month Logs
  // ----------------------------------------------------
  const fetchSection2Data = async () => {
    setSec2Loading(true);
    setError('');
    try {
      const offset = (sec2Page - 1) * sec2PageSize;
      const params = new URLSearchParams();
      params.append('month', sec2Month);
      params.append('year', sec2Year);
      params.append('limit', sec2PageSize);
      params.append('offset', offset);

      if (sec2EmpMode === 'individual' && sec2SelectedIndividualEmp) {
        params.append('employee_id', sec2SelectedIndividualEmp);
      } else if (sec2EmpMode === 'multiple' && sec2SelectedMultipleEmps.length > 0) {
        params.append('employee_ids', sec2SelectedMultipleEmps.join(','));
      }

      if (sec2StatusFilter && sec2StatusFilter !== 'all') {
        params.append('status', sec2StatusFilter);
      }

      if (sec2Search.trim()) {
        params.append('search', sec2Search.trim());
      }

      const res = await apiRequest(`/attendance/full-month-logs?${params.toString()}`);
      setSec2Records(res.records || []);
      setSec2Total(res.total || 0);
      if (res.summary) setSec2Summary(res.summary);
    } catch (err) {
      setError(err.message || 'Failed to fetch full month attendance logs.');
    } finally {
      setSec2Loading(false);
    }
  };

  // ----------------------------------------------------
  // Fetch Approvals (Corrections & Leaves)
  // ----------------------------------------------------
  const fetchApprovals = async () => {
    setLoadingApprovals(true);
    try {
      const corrRes = await apiRequest('/attendance/correction-requests?limit=100');
      const allCorrs = corrRes.requests || [];
      setPendingCorrections(allCorrs.filter(c => c.status === 'pending'));
      setArchivedCorrections(allCorrs.filter(c => c.status !== 'pending'));

      const leaveRes = await apiRequest('/leave/requests?limit=100');
      const allLeaves = leaveRes.requests || [];
      setPendingLeaves(allLeaves.filter(l => l.status === 'pending'));
      setArchivedLeaves(allLeaves.filter(l => l.status !== 'pending'));
    } catch (err) {
      console.error('Failed to load approvals:', err);
    } finally {
      setLoadingApprovals(false);
    }
  };

  // Initial Load
  useEffect(() => {
    fetchTeamEmployees();
    fetchSection1Data();
    fetchSection2Data();
    fetchApprovals();
  }, []);

  // Section 1 Page/PageSize Watcher
  useEffect(() => {
    fetchSection1Data();
  }, [sec1Page, sec1PageSize]);

  // Section 2 Page/PageSize Watcher
  useEffect(() => {
    fetchSection2Data();
  }, [sec2Page, sec2PageSize]);

  // ----------------------------------------------------
  // Export Section 1 (Daily Attendance)
  // ----------------------------------------------------
  const handleExportSection1 = async (format) => {
    setSec1Exporting(true);
    setError('');
    try {
      const exportBody = {
        format,
        date: sec1Date,
        status: sec1StatusFilter,
        search: sec1Search,
        selected_columns: sec1SelectedCols.length > 0 ? sec1SelectedCols : STANDARD_REPORT_HEADERS.map(h => h.key)
      };

      if (sec1EmpMode === 'individual' && sec1SelectedIndividualEmp) {
        exportBody.employee_id = sec1SelectedIndividualEmp;
      } else if (sec1EmpMode === 'multiple' && sec1SelectedMultipleEmps.length > 0) {
        exportBody.employee_ids = sec1SelectedMultipleEmps;
      }

      const res = await apiRequest('/attendance/export', {
        method: 'POST',
        body: exportBody
      });

      if (res.isBlob) {
        const url = window.URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = `Daily_Attendance_${sec1Date}_${Date.now()}.xlsx`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setSuccess(`Exported Daily Attendance Excel report for ${sec1Date}.`);
        setTimeout(() => setSuccess(''), 4000);
      } else if (res.isHtmlReport) {
        const win = window.open('', '_blank');
        if (win) {
          win.document.open();
          win.document.write(res.htmlText);
          win.document.close();
          setSuccess('Generated Daily Attendance PDF report.');
        } else {
          const blob = new Blob([res.htmlText], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Daily_Attendance_${sec1Date}_${Date.now()}.html`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setSuccess('Downloaded printable report file (Open and press Ctrl+P to save as PDF).');
        }
        setTimeout(() => setSuccess(''), 4000);
      }
      setShowSec1ColModal(false);
    } catch (err) {
      setError(err.message || `Failed to export daily attendance ${format.toUpperCase()}.`);
    } finally {
      setSec1Exporting(false);
    }
  };

  // ----------------------------------------------------
  // Export Section 2 (Full Month Logs - All Employees)
  // ----------------------------------------------------
  const handleExportSection2 = async (format) => {
    setSec2Exporting(true);
    setError('');
    try {
      const rawCols = sec2SelectedCols.length > 0 ? sec2SelectedCols : SECTION_2_REPORT_HEADERS.map(h => h.key);
      const finalSelectedCols = rawCols.includes('Date')
        ? ['Date', ...rawCols.filter(c => c !== 'Date')]
        : ['Date', ...rawCols];

      const exportBody = {
        format,
        is_full_month: true,
        scope: 'full_month',
        target_scope: 'full_month',
        month: sec2Month,
        year: sec2Year,
        status: sec2StatusFilter,
        search: sec2Search,
        selected_columns: finalSelectedCols
      };

      if (sec2EmpMode === 'individual' && sec2SelectedIndividualEmp) {
        exportBody.employee_id = sec2SelectedIndividualEmp;
      } else if (sec2EmpMode === 'multiple' && sec2SelectedMultipleEmps.length > 0) {
        exportBody.employee_ids = sec2SelectedMultipleEmps;
      }

      const res = await apiRequest('/attendance/export', {
        method: 'POST',
        body: exportBody
      });

      if (res.isBlob) {
        const url = window.URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = `Full_Month_Attendance_Logs_${sec2Year}_${sec2Month}_${Date.now()}.xlsx`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setSuccess(`Exported Full Month Attendance Logs for ${MONTH_NAMES[sec2Month - 1]} ${sec2Year}.`);
        setTimeout(() => setSuccess(''), 4000);
      } else if (res.isHtmlReport) {
        const win = window.open('', '_blank');
        if (win) {
          win.document.open();
          win.document.write(res.htmlText);
          win.document.close();
          setSuccess('Generated Full Month Attendance PDF report.');
        } else {
          const blob = new Blob([res.htmlText], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Full_Month_Attendance_Logs_${sec2Year}_${sec2Month}_${Date.now()}.html`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setSuccess('Downloaded printable report file (Open and press Ctrl+P to save as PDF).');
        }
        setTimeout(() => setSuccess(''), 4000);
      }
      setShowSec2ColModal(false);
    } catch (err) {
      setError(err.message || `Failed to export full month logs ${format.toUpperCase()}.`);
    } finally {
      setSec2Exporting(false);
    }
  };

  // ----------------------------------------------------
  // Approvals Review Handlers
  // ----------------------------------------------------
  const handleReviewCorrection = async (corrId, status) => {
    try {
      await apiRequest(`/attendance/correction-requests/${corrId}/review`, {
        method: 'PUT',
        body: { status, review_notes: decisionNotes || `Reviewed by Manager ${user.username}` }
      });
      setSuccess(`Attendance correction request #${corrId} ${status} successfully.`);
      setDecisionNotes('');
      try {
        new BroadcastChannel('npb_hrms_attendance_sync').postMessage({ type: 'ATTENDANCE_CORRECTED', timestamp: Date.now() });
      } catch (e) {}
      localStorage.setItem('hrms_attendance_updated', String(Date.now()));
      window.dispatchEvent(new CustomEvent('master-refresh'));

      fetchApprovals();
      fetchSection1Data();
      fetchSection2Data();
      if (onStatsUpdate) onStatsUpdate();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || `Failed to ${status} correction request.`);
    }
  };

  const handleReviewLeave = async (leaveId, status) => {
    try {
      await apiRequest(`/leave/requests/${leaveId}`, {
        method: 'PUT',
        body: { status, rejection_reason: decisionNotes || `Reviewed by Manager ${user.username}` }
      });
      setSuccess(`Leave request #${leaveId} ${status} successfully.`);
      setDecisionNotes('');
      fetchApprovals();
      fetchSection1Data();
      fetchSection2Data();
      if (onStatsUpdate) onStatsUpdate();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || `Failed to ${status} leave request.`);
    }
  };

  // ----------------------------------------------------
  // Multi-Employee Dropdown Selection Helpers
  // ----------------------------------------------------
  const toggleSec1MultipleEmp = (empId) => {
    setSec1SelectedMultipleEmps(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  const toggleSec2MultipleEmp = (empId) => {
    setSec2SelectedMultipleEmps(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  // Pagination calculation
  const sec1TotalPages = Math.max(1, Math.ceil(sec1Total / sec1PageSize));
  const sec2TotalPages = Math.max(1, Math.ceil(sec2Total / sec2PageSize));
  const totalPendingApprovals = pendingCorrections.length + pendingLeaves.length;

  return (
    <div className="space-y-8 pb-12">
      {/* Top Banner Alert / Feedback Messages */}
      {error && (
        <div className="p-3.5 bg-rose-50 border-2 border-rose-300 text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-semibold">{error}</span>
          </div>
          <button type="button" onClick={() => setError('')} className="p-1 hover:bg-rose-100 text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-3.5 bg-emerald-50 border-2 border-emerald-300 text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-bold">{success}</span>
          </div>
          <button type="button" onClick={() => setSuccess('')} className="p-1 hover:bg-emerald-100 text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: DAILY ATTENDANCE REPORT (SQUARED CARD)                         */}
      {/* Filters Placed BEFORE the Section Heading As Instructed                    */}
      {/* ========================================================================= */}
      <div className="bg-white border-2 border-slate-300 p-0 shadow-none">
        {/* 1.1 FILTER OPTION BAR (BEFORE HEADING) */}
        <div className="bg-slate-50 border-b-2 border-slate-300 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-sky-700" />
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Filter Options (Daily Basis)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setSec1Date(todayStr); setSec1Page(1); }}
                className={`px-2.5 py-1 text-xs font-bold border-2 transition-colors flex items-center gap-1.5 ${
                  sec1Date === todayStr
                    ? 'bg-sky-700 text-white border-sky-800'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Today's Date ({todayStr})</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            {/* Filter 1: Employee Select (All, Individual, Multiple) */}
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wide mb-1">
                Select Employee:
              </label>
              <select
                value={sec1EmpMode}
                onChange={(e) => {
                  setSec1EmpMode(e.target.value);
                  setSec1Page(1);
                }}
                className="w-full py-1.5 px-2.5 bg-white border-2 border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-sky-600"
              >
                <option value="all">All Assigned Employees</option>
                <option value="individual">Individual Employee</option>
                <option value="multiple">Multiple Employees (Tick Option)</option>
              </select>

              {sec1EmpMode === 'individual' && (
                <div className="mt-2">
                  <select
                    value={sec1SelectedIndividualEmp}
                    onChange={(e) => { setSec1SelectedIndividualEmp(e.target.value); setSec1Page(1); }}
                    className="w-full py-1.5 px-2 bg-white border-2 border-slate-300 text-slate-800 text-xs font-semibold focus:outline-none focus:border-sky-600"
                  >
                    <option value="">Select Employee...</option>
                    {teamEmployees.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.full_name} ({e.employee_id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {sec1EmpMode === 'multiple' && (
                <div className="relative mt-2">
                  <button
                    type="button"
                    onClick={() => setSec1ShowMultiDropdown(!sec1ShowMultiDropdown)}
                    className="w-full py-1.5 px-2.5 bg-white border-2 border-slate-300 text-slate-800 text-xs font-bold flex items-center justify-between"
                  >
                    <span className="truncate">
                      {sec1SelectedMultipleEmps.length === 0
                        ? 'Select Employees (0)'
                        : `${sec1SelectedMultipleEmps.length} Employees Ticked`}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  </button>

                  {sec1ShowMultiDropdown && (
                    <div className="absolute left-0 top-full mt-1 w-72 bg-white border-2 border-slate-400 p-2.5 z-40 space-y-2 shadow-lg">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                        <span className="font-black text-[11px] text-slate-800 uppercase">Team Members</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (sec1SelectedMultipleEmps.length === teamEmployees.length) {
                              setSec1SelectedMultipleEmps([]);
                            } else {
                              setSec1SelectedMultipleEmps(teamEmployees.map(e => e.id));
                            }
                          }}
                          className="text-[11px] text-sky-700 font-bold hover:underline"
                        >
                          {sec1SelectedMultipleEmps.length === teamEmployees.length ? 'Clear All' : 'Select All'}
                        </button>
                      </div>

                      <div className="relative">
                        <Search className="w-3 h-3 absolute left-2 top-2 text-slate-400" />
                        <input
                          type="text"
                          value={sec1MultiEmpSearch}
                          onChange={(e) => setSec1MultiEmpSearch(e.target.value)}
                          placeholder="Search staff..."
                          className="w-full pl-6 pr-2 py-1 bg-slate-50 border border-slate-300 text-xs"
                        />
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {teamEmployees
                          .filter(e =>
                            e.full_name.toLowerCase().includes(sec1MultiEmpSearch.toLowerCase()) ||
                            e.employee_id.toLowerCase().includes(sec1MultiEmpSearch.toLowerCase())
                          )
                          .map(emp => {
                            const isChecked = sec1SelectedMultipleEmps.includes(emp.id);
                            return (
                              <label
                                key={emp.id}
                                className="flex items-center gap-2 p-1 hover:bg-slate-100 cursor-pointer text-slate-800 text-xs"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleSec1MultipleEmp(emp.id)}
                                  className="w-3.5 h-3.5 border-slate-400 rounded-none text-sky-600 focus:ring-0"
                                />
                                <span className="font-semibold truncate">{emp.full_name}</span>
                                <span className="text-[10px] text-slate-400 font-mono ml-auto">({emp.employee_id})</span>
                              </label>
                            );
                          })}
                      </div>

                      <button
                        type="button"
                        onClick={() => setSec1ShowMultiDropdown(false)}
                        className="w-full py-1 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold"
                      >
                        Done ({sec1SelectedMultipleEmps.length} Selected)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Filter 2: Date Selector */}
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wide mb-1">
                Report Date:
              </label>
              <input
                type="date"
                value={sec1Date}
                onChange={(e) => { setSec1Date(e.target.value); setSec1Page(1); }}
                className="w-full py-1.5 px-2.5 bg-white border-2 border-slate-300 text-slate-900 font-mono font-bold focus:outline-none focus:border-sky-600"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                {sec1Date === todayStr ? '✓ Today Live Attendance' : `Historical Date: ${sec1Date}`}
              </span>
            </div>

            {/* Filter 3: Status Filter */}
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wide mb-1">
                Status:
              </label>
              <select
                value={sec1StatusFilter}
                onChange={(e) => { setSec1StatusFilter(e.target.value); setSec1Page(1); }}
                className="w-full py-1.5 px-2.5 bg-white border-2 border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-sky-600"
              >
                <option value="all">All Statuses</option>
                <option value="Present">Present</option>
                <option value="Absent">Absent</option>
                <option value="Half Day">Half Day</option>
                <option value="Leave">Leave</option>
                <option value="WO">Weekly Off (WO)</option>
                <option value="HO">Holiday (HO)</option>
              </select>
            </div>

            {/* Filter 4: Rows Per Page Dropdown (10 Default, 25, 50, Custom) */}
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wide mb-1">
                Rows Per Page:
              </label>
              <select
                value={sec1PageSizeOption}
                onChange={(e) => {
                  const val = e.target.value;
                  setSec1PageSizeOption(val);
                  if (val !== 'custom') {
                    setSec1PageSize(Number(val));
                    setSec1Page(1);
                  }
                }}
                className="w-full py-1.5 px-2.5 bg-white border-2 border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-sky-600"
              >
                <option value="10">10 Rows (Default)</option>
                <option value="25">25 Rows</option>
                <option value="50">50 Rows</option>
                <option value="custom">Custom Enter...</option>
              </select>

              {sec1PageSizeOption === 'custom' && (
                <div className="flex items-center gap-1 mt-2">
                  <input
                    type="number"
                    min="1"
                    max="500"
                    placeholder="e.g. 15"
                    value={sec1CustomPageSizeInput}
                    onChange={(e) => setSec1CustomPageSizeInput(e.target.value)}
                    className="w-24 py-1 px-2 border-2 border-slate-300 bg-white font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = parseInt(sec1CustomPageSizeInput, 10);
                      if (!isNaN(val) && val > 0 && val <= 500) {
                        setSec1PageSize(val);
                        setSec1Page(1);
                      } else {
                        setError('Please enter a valid row count between 1 and 500.');
                      }
                    }}
                    className="px-2.5 py-1 bg-slate-800 text-white font-bold text-xs"
                  >
                    Set
                  </button>
                </div>
              )}
            </div>

            {/* Filter 5: Apply Filter Button */}
            <div className="flex flex-col justify-end gap-1.5">
              <button
                type="button"
                onClick={() => { setSec1Page(1); fetchSection1Data(); }}
                disabled={sec1Loading}
                className="w-full py-2 bg-sky-700 hover:bg-sky-800 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 border-2 border-sky-900 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${sec1Loading ? 'animate-spin' : ''}`} />
                <span>Apply Filter</span>
              </button>
            </div>
          </div>
        </div>

        {/* 1.2 SECTION HEADING (AFTER FILTERS) */}
        <div className="p-4 bg-white border-b-2 border-slate-300 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-sky-600 inline-block"></span>
              <h2 className="text-base font-black text-slate-900 tracking-tight uppercase">
                Section 1: Daily Attendance Report
              </h2>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-300 text-[11px] font-mono font-bold">
                Date: {sec1Date}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Daily basis assigned employee data with live punch records, verified area names, GPS coordinates, and HH:MM working hours
            </p>
          </div>

          {/* Action Area: Pre-Download Header Customizer & Download Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Header Modifier Button */}
            <button
              type="button"
              onClick={() => setShowSec1ColModal(true)}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border-2 border-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
              title="Select which of the 10 headers to include in your download or table"
            >
              <Columns className="w-3.5 h-3.5 text-slate-600" />
              <span>Modify Headers ({sec1SelectedCols.length}/10)</span>
            </button>

            {/* Direct Download Excel */}
            <button
              type="button"
              onClick={() => handleExportSection1('xlsx')}
              disabled={sec1Exporting}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white border-2 border-emerald-900 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Download Daily Attendance Excel (.xlsx) with ticked headers"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
              <span>{sec1Exporting ? 'Exporting...' : 'Download Excel'}</span>
            </button>

            {/* Direct Download PDF */}
            <button
              type="button"
              onClick={() => handleExportSection1('pdf')}
              disabled={sec1Exporting}
              className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white border-2 border-rose-900 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Download Daily Attendance PDF / Printable report with ticked headers"
            >
              <FileText className="w-3.5 h-3.5 text-rose-200" />
              <span>{sec1Exporting ? 'Exporting...' : 'Download PDF'}</span>
            </button>
          </div>
        </div>

        {/* 1.3 SUMMARY COUNTER STRIP */}
        <div className="grid grid-cols-2 sm:grid-cols-5 border-b-2 border-slate-300 text-xs">
          <div className="p-3 border-r-2 border-slate-200 bg-slate-50/70">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Total Employees</span>
            <span className="text-lg font-black text-slate-900 font-mono mt-0.5 block">{sec1Total}</span>
          </div>
          <div className="p-3 border-r-2 border-slate-200 bg-emerald-50/60">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">Present</span>
            <span className="text-lg font-black text-emerald-900 font-mono mt-0.5 block">{sec1Summary.present || 0}</span>
          </div>
          <div className="p-3 border-r-2 border-slate-200 bg-rose-50/60">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 block">Absent</span>
            <span className="text-lg font-black text-rose-900 font-mono mt-0.5 block">{sec1Summary.absent || 0}</span>
          </div>
          <div className="p-3 border-r-2 border-slate-200 bg-amber-50/60">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block">Half Day</span>
            <span className="text-lg font-black text-amber-900 font-mono mt-0.5 block">{sec1Summary.half_day || 0}</span>
          </div>
          <div className="p-3 bg-purple-50/60">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-800 block">Leave / WO / Holiday</span>
            <span className="text-lg font-black text-purple-900 font-mono mt-0.5 block">{sec1Summary.leave || 0}</span>
          </div>
        </div>

        {/* 1.4 DAILY ATTENDANCE DATA TABLE (STRICTLY 10 HEADERS, NO OVERRIDE BUTTONS) */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-800 uppercase font-black tracking-wider border-b-2 border-slate-300">
              <tr>
                {sec1SelectedCols.includes('Employee ID') && <th className="p-3 border-r border-slate-200">Employee ID</th>}
                {sec1SelectedCols.includes('Employee Name') && <th className="p-3 border-r border-slate-200">Employee Name</th>}
                {sec1SelectedCols.includes('Punch In Time') && <th className="p-3 border-r border-slate-200">Punch In Time</th>}
                {sec1SelectedCols.includes('Punch In Lat/Long') && <th className="p-3 border-r border-slate-200">Punch In Lat/Long</th>}
                {sec1SelectedCols.includes('Punch In Address') && <th className="p-3 border-r border-slate-200">Punch In Address</th>}
                {sec1SelectedCols.includes('Punch Out Time') && <th className="p-3 border-r border-slate-200">Punch Out Time</th>}
                {sec1SelectedCols.includes('Punch Out Lat/Long') && <th className="p-3 border-r border-slate-200">Punch Out Lat/Long</th>}
                {sec1SelectedCols.includes('Punch Out Address') && <th className="p-3 border-r border-slate-200">Punch Out Address</th>}
                {sec1SelectedCols.includes('Status') && <th className="p-3 border-r border-slate-200">Status</th>}
                {sec1SelectedCols.includes('Working Hours (HH:MM)') && <th className="p-3">Working Hours (HH:MM)</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sec1Loading ? (
                <tr>
                  <td colSpan={sec1SelectedCols.length} className="p-8 text-center text-slate-500 font-medium">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-sky-700" />
                    Loading daily attendance data for {sec1Date}...
                  </td>
                </tr>
              ) : sec1Records.length === 0 ? (
                <tr>
                  <td colSpan={sec1SelectedCols.length} className="p-8 text-center text-slate-400">
                    <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No employee attendance records found for this date and filter criteria.
                  </td>
                </tr>
              ) : (
                sec1Records.map(r => {
                  const inTime12 = format12Hour(r.punch_in_time);
                  const outTime12 = format12Hour(r.punch_out_time);
                  const inLatLong = (r.punch_in_lat && r.punch_in_lng) ? `${Number(r.punch_in_lat).toFixed(4)}, ${Number(r.punch_in_lng).toFixed(4)}` : '--';
                  const outLatLong = (r.punch_out_lat && r.punch_out_lng) ? `${Number(r.punch_out_lat).toFixed(4)}, ${Number(r.punch_out_lng).toFixed(4)}` : '--';
                  const inAddress = cleanAreaName(r.punch_in_location);
                  const outAddress = cleanAreaName(r.punch_out_location);
                  const workingHours = formatWorkingHoursHHMM(r.total_hours, r.punch_in_time, r.punch_out_time);

                  return (
                    <tr key={r.id || `${r.employee_id}-${r.date}`} className="hover:bg-slate-50 transition-colors">
                      {sec1SelectedCols.includes('Employee ID') && (
                        <td className="p-3 border-r border-slate-200 font-mono font-bold text-slate-900">
                          {r.employee_code || '-'}
                        </td>
                      )}
                      {sec1SelectedCols.includes('Employee Name') && (
                        <td className="p-3 border-r border-slate-200 font-bold text-slate-900">
                          <div>{r.employee_name}</div>
                          <span className="text-[10px] text-slate-400 font-normal">{r.department || 'Operations'}</span>
                        </td>
                      )}
                      {sec1SelectedCols.includes('Punch In Time') && (
                        <td className="p-3 border-r border-slate-200 font-mono font-bold text-slate-800 whitespace-nowrap">
                          {inTime12}
                        </td>
                      )}
                      {sec1SelectedCols.includes('Punch In Lat/Long') && (
                        <td className="p-3 border-r border-slate-200 font-mono text-slate-600 whitespace-nowrap">
                          {inLatLong}
                        </td>
                      )}
                      {sec1SelectedCols.includes('Punch In Address') && (
                        <td className="p-3 border-r border-slate-200 text-slate-700 max-w-[180px] truncate" title={inAddress}>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-sky-600 shrink-0" />
                            <span className="truncate font-medium">{inAddress}</span>
                          </div>
                        </td>
                      )}
                      {sec1SelectedCols.includes('Punch Out Time') && (
                        <td className="p-3 border-r border-slate-200 font-mono font-bold text-slate-800 whitespace-nowrap">
                          {outTime12}
                        </td>
                      )}
                      {sec1SelectedCols.includes('Punch Out Lat/Long') && (
                        <td className="p-3 border-r border-slate-200 font-mono text-slate-600 whitespace-nowrap">
                          {outLatLong}
                        </td>
                      )}
                      {sec1SelectedCols.includes('Punch Out Address') && (
                        <td className="p-3 border-r border-slate-200 text-slate-700 max-w-[180px] truncate" title={outAddress}>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-indigo-600 shrink-0" />
                            <span className="truncate font-medium">{outAddress}</span>
                          </div>
                        </td>
                      )}
                      {sec1SelectedCols.includes('Status') && (
                        <td className="p-3 border-r border-slate-200 whitespace-nowrap">
                          {getStatusBadge(r.status)}
                        </td>
                      )}
                      {sec1SelectedCols.includes('Working Hours (HH:MM)') && (
                        <td className="p-3 font-mono font-black text-slate-900 whitespace-nowrap">
                          {workingHours}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 1.5 PAGINATION BAR (SECTION 1) */}
        <div className="p-3 bg-slate-50 border-t-2 border-slate-300 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-600 font-medium">
            Showing <strong className="text-slate-900 font-bold">{sec1Total === 0 ? 0 : (sec1Page - 1) * sec1PageSize + 1}</strong> to <strong className="text-slate-900 font-bold">{Math.min(sec1Page * sec1PageSize, sec1Total)}</strong> of <strong className="text-slate-900 font-bold">{sec1Total}</strong> employees
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSec1Page(p => Math.max(1, p - 1))}
              disabled={sec1Page === 1}
              className="px-3 py-1 border-2 border-slate-300 bg-white text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            {Array.from({ length: sec1TotalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === sec1TotalPages || Math.abs(p - sec1Page) <= 2)
              .map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span className="px-1 text-slate-400 font-bold">...</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSec1Page(p)}
                    className={`min-w-[32px] py-1 px-2 border-2 font-black text-xs ${
                      sec1Page === p
                        ? 'bg-sky-700 text-white border-sky-800'
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {p}
                  </button>
                </React.Fragment>
              ))}

            <button
              type="button"
              onClick={() => setSec1Page(p => Math.min(sec1TotalPages, p + 1))}
              disabled={sec1Page >= sec1TotalPages || sec1Total === 0}
              className="px-3 py-1 border-2 border-slate-300 bg-white text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: ALL EMPLOYEE FULL MONTH ATTENDANCE LOG FILE (SQUARED CARD)      */}
      {/* Shows Every Day 1 to 30/31 Without Skipping Any Date For All Employees    */}
      {/* ========================================================================= */}
      <div className="bg-white border-2 border-slate-300 p-0 shadow-none">
        {/* 2.1 FILTER BAR FOR FULL MONTH LOG FILE (BEFORE HEADING) */}
        <div className="bg-slate-50 border-b-2 border-slate-300 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-700" />
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Full Month Log File Filters (Zero Skipped Dates)
              </span>
            </div>
            <span className="text-[11px] font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 border border-emerald-300 font-bold">
              Guaranteed 1 to {new Date(sec2Year, sec2Month, 0).getDate()} Full Calendar Days
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
            {/* Filter 1: Month Selector */}
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wide mb-1">
                Month:
              </label>
              <select
                value={sec2Month}
                onChange={(e) => { setSec2Month(parseInt(e.target.value, 10)); setSec2Page(1); }}
                className="w-full py-1.5 px-2.5 bg-white border-2 border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-emerald-600"
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx + 1}>{m}</option>
                ))}
              </select>
            </div>

            {/* Filter 2: Year Selector */}
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wide mb-1">
                Year:
              </label>
              <select
                value={sec2Year}
                onChange={(e) => { setSec2Year(parseInt(e.target.value, 10)); setSec2Page(1); }}
                className="w-full py-1.5 px-2.5 bg-white border-2 border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-emerald-600"
              >
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Filter 3: Employee Selector (All, Individual, Multiple) */}
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wide mb-1">
                Employee Filter:
              </label>
              <select
                value={sec2EmpMode}
                onChange={(e) => { setSec2EmpMode(e.target.value); setSec2Page(1); }}
                className="w-full py-1.5 px-2.5 bg-white border-2 border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-emerald-600"
              >
                <option value="all">All Employees (Full Staff)</option>
                <option value="individual">Single Employee</option>
                <option value="multiple">Multiple (Tick Selection)</option>
              </select>

              {sec2EmpMode === 'individual' && (
                <div className="mt-2">
                  <select
                    value={sec2SelectedIndividualEmp}
                    onChange={(e) => { setSec2SelectedIndividualEmp(e.target.value); setSec2Page(1); }}
                    className="w-full py-1.5 px-2 bg-white border-2 border-slate-300 text-slate-800 text-xs font-semibold focus:outline-none focus:border-emerald-600"
                  >
                    <option value="">Select Employee...</option>
                    {teamEmployees.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.full_name} ({e.employee_id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {sec2EmpMode === 'multiple' && (
                <div className="relative mt-2">
                  <button
                    type="button"
                    onClick={() => setSec2ShowMultiDropdown(!sec2ShowMultiDropdown)}
                    className="w-full py-1.5 px-2.5 bg-white border-2 border-slate-300 text-slate-800 text-xs font-bold flex items-center justify-between"
                  >
                    <span className="truncate">
                      {sec2SelectedMultipleEmps.length === 0
                        ? 'Select Staff (0)'
                        : `${sec2SelectedMultipleEmps.length} Staff Ticked`}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  </button>

                  {sec2ShowMultiDropdown && (
                    <div className="absolute left-0 top-full mt-1 w-72 bg-white border-2 border-slate-400 p-2.5 z-40 space-y-2 shadow-lg">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                        <span className="font-black text-[11px] text-slate-800 uppercase">Team Members</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (sec2SelectedMultipleEmps.length === teamEmployees.length) {
                              setSec2SelectedMultipleEmps([]);
                            } else {
                              setSec2SelectedMultipleEmps(teamEmployees.map(e => e.id));
                            }
                          }}
                          className="text-[11px] text-emerald-700 font-bold hover:underline"
                        >
                          {sec2SelectedMultipleEmps.length === teamEmployees.length ? 'Clear All' : 'Select All'}
                        </button>
                      </div>

                      <div className="relative">
                        <Search className="w-3 h-3 absolute left-2 top-2 text-slate-400" />
                        <input
                          type="text"
                          value={sec2MultiEmpSearch}
                          onChange={(e) => setSec2MultiEmpSearch(e.target.value)}
                          placeholder="Search staff..."
                          className="w-full pl-6 pr-2 py-1 bg-slate-50 border border-slate-300 text-xs"
                        />
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {teamEmployees
                          .filter(e =>
                            e.full_name.toLowerCase().includes(sec2MultiEmpSearch.toLowerCase()) ||
                            e.employee_id.toLowerCase().includes(sec2MultiEmpSearch.toLowerCase())
                          )
                          .map(emp => {
                            const isChecked = sec2SelectedMultipleEmps.includes(emp.id);
                            return (
                              <label
                                key={emp.id}
                                className="flex items-center gap-2 p-1 hover:bg-slate-100 cursor-pointer text-slate-800 text-xs"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleSec2MultipleEmp(emp.id)}
                                  className="w-3.5 h-3.5 border-slate-400 rounded-none text-emerald-600 focus:ring-0"
                                />
                                <span className="font-semibold truncate">{emp.full_name}</span>
                                <span className="text-[10px] text-slate-400 font-mono ml-auto">({emp.employee_id})</span>
                              </label>
                            );
                          })}
                      </div>

                      <button
                        type="button"
                        onClick={() => setSec2ShowMultiDropdown(false)}
                        className="w-full py-1 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold"
                      >
                        Done ({sec2SelectedMultipleEmps.length} Selected)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Filter 4: Status Filter */}
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wide mb-1">
                Status Filter:
              </label>
              <select
                value={sec2StatusFilter}
                onChange={(e) => { setSec2StatusFilter(e.target.value); setSec2Page(1); }}
                className="w-full py-1.5 px-2.5 bg-white border-2 border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-emerald-600"
              >
                <option value="all">All Days & Statuses</option>
                <option value="Present">Present Only</option>
                <option value="Absent">Absent Only</option>
                <option value="Half Day">Half Day Only</option>
                <option value="Leave">Leave Only</option>
                <option value="WO">Weekly Off (WO)</option>
                <option value="HO">Holiday (HO)</option>
              </select>
            </div>

            {/* Filter 5: Rows Per Page (10, 25 Default, 50, Custom) */}
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wide mb-1">
                Rows Per Page:
              </label>
              <select
                value={sec2PageSizeOption}
                onChange={(e) => {
                  const val = e.target.value;
                  setSec2PageSizeOption(val);
                  if (val !== 'custom') {
                    setSec2PageSize(Number(val));
                    setSec2Page(1);
                  }
                }}
                className="w-full py-1.5 px-2.5 bg-white border-2 border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-emerald-600"
              >
                <option value="10">10 Rows (Default)</option>
                <option value="25">25 Rows</option>
                <option value="50">50 Rows</option>
                <option value="100">100 Rows</option>
                <option value="custom">Custom Enter...</option>
              </select>

              {sec2PageSizeOption === 'custom' && (
                <div className="flex items-center gap-1 mt-2">
                  <input
                    type="number"
                    min="1"
                    max="500"
                    placeholder="e.g. 50"
                    value={sec2CustomPageSizeInput}
                    onChange={(e) => setSec2CustomPageSizeInput(e.target.value)}
                    className="w-24 py-1 px-2 border-2 border-slate-300 bg-white font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = parseInt(sec2CustomPageSizeInput, 10);
                      if (!isNaN(val) && val > 0 && val <= 500) {
                        setSec2PageSize(val);
                        setSec2Page(1);
                      } else {
                        setError('Please enter a valid row count between 1 and 500.');
                      }
                    }}
                    className="px-2.5 py-1 bg-slate-800 text-white font-bold text-xs"
                  >
                    Set
                  </button>
                </div>
              )}
            </div>

            {/* Filter 6: Search Input & Apply Button */}
            <div className="flex flex-col justify-end gap-1.5">
              <button
                type="button"
                onClick={() => { setSec2Page(1); fetchSection2Data(); }}
                disabled={sec2Loading}
                className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 border-2 border-emerald-900 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${sec2Loading ? 'animate-spin' : ''}`} />
                <span>Load Month Logs</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2.2 SECTION 2 HEADING (AFTER FILTERS) */}
        <div className="p-4 bg-white border-b-2 border-slate-300 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-emerald-600 inline-block"></span>
              <h2 className="text-base font-black text-slate-900 tracking-tight uppercase">
                Section 2: All Employee Full Month Attendance Log File
              </h2>
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 text-[11px] font-mono font-bold">
                {MONTH_NAMES[sec2Month - 1]} {sec2Year} • Full Month
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Complete calendar log of all assigned team members for all 1 to {new Date(sec2Year, sec2Month, 0).getDate()} days without skipping any date. Export entire month's data directly to Excel or PDF.
            </p>
          </div>

          {/* Action Area: Pre-Download Header Customizer & Download Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Header Modifier Button */}
            <button
              type="button"
              onClick={() => setShowSec2ColModal(true)}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border-2 border-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
              title="Select which of the 10 headers to include in full month log export"
            >
              <Columns className="w-3.5 h-3.5 text-slate-600" />
              <span>Modify Headers ({sec2SelectedCols.length}/10)</span>
            </button>

            {/* Full Month Download Excel */}
            <button
              type="button"
              onClick={() => handleExportSection2('xlsx')}
              disabled={sec2Exporting}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white border-2 border-emerald-900 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Download Full Month Attendance Log for All Employees in Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
              <span>{sec2Exporting ? 'Exporting...' : 'Export Full Month Excel'}</span>
            </button>

            {/* Full Month Download PDF */}
            <button
              type="button"
              onClick={() => handleExportSection2('pdf')}
              disabled={sec2Exporting}
              className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white border-2 border-rose-900 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Download Full Month Attendance Log for All Employees in PDF / Printable format"
            >
              <FileText className="w-3.5 h-3.5 text-rose-200" />
              <span>{sec2Exporting ? 'Exporting...' : 'Export Full Month PDF'}</span>
            </button>
          </div>
        </div>

        {/* 2.3 SECTION 2 SUMMARY STRIP */}
        <div className="grid grid-cols-2 sm:grid-cols-6 border-b-2 border-slate-300 text-xs">
          <div className="p-3 border-r-2 border-slate-200 bg-slate-50/70">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Total Log Days</span>
            <span className="text-lg font-black text-slate-900 font-mono mt-0.5 block">{sec2Total}</span>
          </div>
          <div className="p-3 border-r-2 border-slate-200 bg-emerald-50/60">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">Present Days</span>
            <span className="text-lg font-black text-emerald-900 font-mono mt-0.5 block">{sec2Summary.present || 0}</span>
          </div>
          <div className="p-3 border-r-2 border-slate-200 bg-rose-50/60">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 block">Absent Days</span>
            <span className="text-lg font-black text-rose-900 font-mono mt-0.5 block">{sec2Summary.absent || 0}</span>
          </div>
          <div className="p-3 border-r-2 border-slate-200 bg-amber-50/60">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block">Half Days</span>
            <span className="text-lg font-black text-amber-900 font-mono mt-0.5 block">{sec2Summary.half_day || 0}</span>
          </div>
          <div className="p-3 border-r-2 border-slate-200 bg-purple-50/60">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-800 block">Leaves</span>
            <span className="text-lg font-black text-purple-900 font-mono mt-0.5 block">{sec2Summary.leave || 0}</span>
          </div>
          <div className="p-3 bg-slate-100/70">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 block">Weekly Off / Holidays</span>
            <span className="text-lg font-black text-slate-800 font-mono mt-0.5 block">{(sec2Summary.wo || 0) + (sec2Summary.holiday || 0)}</span>
          </div>
        </div>

        {/* 2.4 FULL MONTH LOG DATA TABLE (STRICTLY 10 HEADERS + DATE) */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-800 uppercase font-black tracking-wider border-b-2 border-slate-300">
              <tr>
                <th className="p-3 border-r border-slate-200">Date (Day)</th>
                {sec2SelectedCols.includes('Employee ID') && <th className="p-3 border-r border-slate-200">Employee ID</th>}
                {sec2SelectedCols.includes('Employee Name') && <th className="p-3 border-r border-slate-200">Employee Name</th>}
                {sec2SelectedCols.includes('Punch In Time') && <th className="p-3 border-r border-slate-200">Punch In Time</th>}
                {sec2SelectedCols.includes('Punch In Lat/Long') && <th className="p-3 border-r border-slate-200">Punch In Lat/Long</th>}
                {sec2SelectedCols.includes('Punch In Address') && <th className="p-3 border-r border-slate-200">Punch In Address</th>}
                {sec2SelectedCols.includes('Punch Out Time') && <th className="p-3 border-r border-slate-200">Punch Out Time</th>}
                {sec2SelectedCols.includes('Punch Out Lat/Long') && <th className="p-3 border-r border-slate-200">Punch Out Lat/Long</th>}
                {sec2SelectedCols.includes('Punch Out Address') && <th className="p-3 border-r border-slate-200">Punch Out Address</th>}
                {sec2SelectedCols.includes('Status') && <th className="p-3 border-r border-slate-200">Status</th>}
                {sec2SelectedCols.includes('Working Hours (HH:MM)') && <th className="p-3">Working Hours (HH:MM)</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sec2Loading ? (
                <tr>
                  <td colSpan={sec2SelectedCols.length + 1} className="p-8 text-center text-slate-500 font-medium">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-700" />
                    Generating non-skipping monthly attendance logs for {MONTH_NAMES[sec2Month - 1]} {sec2Year}...
                  </td>
                </tr>
              ) : sec2Records.length === 0 ? (
                <tr>
                  <td colSpan={sec2SelectedCols.length + 1} className="p-8 text-center text-slate-400">
                    <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No attendance logs found for the selected month and filter criteria.
                  </td>
                </tr>
              ) : (
                sec2Records.map(r => (
                  <tr key={r.id || `${r.employee_db_id}-${r.date_raw}`} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 border-r border-slate-200 font-mono font-bold text-slate-800 whitespace-nowrap bg-slate-50/50">
                      {r.Date}
                    </td>
                    {sec2SelectedCols.includes('Employee ID') && (
                      <td className="p-3 border-r border-slate-200 font-mono font-bold text-slate-900">
                        {r['Employee ID']}
                      </td>
                    )}
                    {sec2SelectedCols.includes('Employee Name') && (
                      <td className="p-3 border-r border-slate-200 font-bold text-slate-900">
                        <div>{r['Employee Name']}</div>
                        <span className="text-[10px] text-slate-400 font-normal">{r.Department || 'Operations'}</span>
                      </td>
                    )}
                    {sec2SelectedCols.includes('Punch In Time') && (
                      <td className="p-3 border-r border-slate-200 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {r['Punch In Time']}
                      </td>
                    )}
                    {sec2SelectedCols.includes('Punch In Lat/Long') && (
                      <td className="p-3 border-r border-slate-200 font-mono text-slate-600 whitespace-nowrap">
                        {r['Punch In Lat/Long']}
                      </td>
                    )}
                    {sec2SelectedCols.includes('Punch In Address') && (
                      <td className="p-3 border-r border-slate-200 text-slate-700 max-w-[180px] truncate" title={r['Punch In Address']}>
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-sky-600 shrink-0" />
                          <span className="truncate font-medium">{r['Punch In Address']}</span>
                        </div>
                      </td>
                    )}
                    {sec2SelectedCols.includes('Punch Out Time') && (
                      <td className="p-3 border-r border-slate-200 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {r['Punch Out Time']}
                      </td>
                    )}
                    {sec2SelectedCols.includes('Punch Out Lat/Long') && (
                      <td className="p-3 border-r border-slate-200 font-mono text-slate-600 whitespace-nowrap">
                        {r['Punch Out Lat/Long']}
                      </td>
                    )}
                    {sec2SelectedCols.includes('Punch Out Address') && (
                      <td className="p-3 border-r border-slate-200 text-slate-700 max-w-[180px] truncate" title={r['Punch Out Address']}>
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-indigo-600 shrink-0" />
                          <span className="truncate font-medium">{r['Punch Out Address']}</span>
                        </div>
                      </td>
                    )}
                    {sec2SelectedCols.includes('Status') && (
                      <td className="p-3 border-r border-slate-200 whitespace-nowrap">
                        {getStatusBadge(r.Status)}
                      </td>
                    )}
                    {sec2SelectedCols.includes('Working Hours (HH:MM)') && (
                      <td className="p-3 font-mono font-black text-slate-900 whitespace-nowrap">
                        {r['Working Hours (HH:MM)']}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 2.5 PAGINATION BAR (SECTION 2) */}
        <div className="p-3 bg-slate-50 border-t-2 border-slate-300 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-600 font-medium">
            Showing <strong className="text-slate-900 font-bold">{sec2Total === 0 ? 0 : (sec2Page - 1) * sec2PageSize + 1}</strong> to <strong className="text-slate-900 font-bold">{Math.min(sec2Page * sec2PageSize, sec2Total)}</strong> of <strong className="text-slate-900 font-bold">{sec2Total}</strong> full month date records
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSec2Page(p => Math.max(1, p - 1))}
              disabled={sec2Page === 1}
              className="px-3 py-1 border-2 border-slate-300 bg-white text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            {Array.from({ length: sec2TotalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === sec2TotalPages || Math.abs(p - sec2Page) <= 2)
              .map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span className="px-1 text-slate-400 font-bold">...</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSec2Page(p)}
                    className={`min-w-[32px] py-1 px-2 border-2 font-black text-xs ${
                      sec2Page === p
                        ? 'bg-emerald-700 text-white border-emerald-800'
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {p}
                  </button>
                </React.Fragment>
              ))}

            <button
              type="button"
              onClick={() => setSec2Page(p => Math.min(sec2TotalPages, p + 1))}
              disabled={sec2Page >= sec2TotalPages || sec2Total === 0}
              className="px-3 py-1 border-2 border-slate-300 bg-white text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: TEAM APPROVALS (ATTENDANCE CORRECTIONS & LEAVES)               */}
      {/* ========================================================================= */}
      <div className="bg-white border-2 border-slate-300 p-0 shadow-none">
        <div className="p-4 border-b-2 border-slate-300 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-700" />
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                Team Approvals & Correction Decider
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review employee attendance correction applications and leave submissions without manual overrides
              </p>
            </div>
          </div>

          {/* Sub-tab Switcher: Pending vs Archived */}
          <div className="inline-flex border-2 border-slate-300 bg-white text-xs font-bold">
            <button
              type="button"
              onClick={() => setApprovalTab('pending')}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-all ${
                approvalTab === 'pending'
                  ? 'bg-indigo-700 text-white font-black'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Pending Approvals</span>
              {totalPendingApprovals > 0 && (
                <span className="px-1.5 py-0.2 bg-rose-600 text-white font-black text-[10px]">
                  {totalPendingApprovals}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setApprovalTab('archived')}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-all border-l-2 border-slate-300 ${
                approvalTab === 'archived'
                  ? 'bg-indigo-700 text-white font-black'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Archived History</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Pending Approvals */}
        {approvalTab === 'pending' && (
          <div className="p-5 space-y-6">
            {/* 3.1 Attendance Corrections */}
            <div>
              <div className="flex items-center justify-between mb-3 border-b-2 border-slate-200 pb-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-sky-700" />
                  <span>Pending Attendance Corrections ({pendingCorrections.length})</span>
                </h4>
              </div>

              {pendingCorrections.length === 0 ? (
                <div className="p-6 bg-slate-50 border-2 border-slate-200 text-center text-xs text-slate-500 font-medium">
                  <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
                  No pending attendance corrections from assigned team members.
                </div>
              ) : (
                <div className="overflow-x-auto border-2 border-slate-300">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-800 uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 border-r border-slate-200">Employee</th>
                        <th className="p-2.5 border-r border-slate-200">Date</th>
                        <th className="p-2.5 border-r border-slate-200">Requested Punch In / Out</th>
                        <th className="p-2.5 border-r border-slate-200">Reason</th>
                        <th className="p-2.5 text-right">Action Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {pendingCorrections.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="p-2.5 border-r border-slate-200 font-bold text-slate-900">
                            {c.employee_name} <span className="text-slate-400 font-mono font-normal">({c.employee_code})</span>
                          </td>
                          <td className="p-2.5 border-r border-slate-200 font-mono font-bold text-slate-700">{c.date}</td>
                          <td className="p-2.5 border-r border-slate-200 font-mono">
                            <span className="text-emerald-800 font-bold">{c.requested_punch_in || '--:--:--'}</span>
                            {' → '}
                            <span className="text-indigo-800 font-bold">{c.requested_punch_out || '--:--:--'}</span>
                          </td>
                          <td className="p-2.5 border-r border-slate-200 text-slate-700">{c.reason}</td>
                          <td className="p-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleReviewCorrection(c.id, 'approved')}
                                className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1 border border-emerald-900"
                              >
                                <Check className="w-3 h-3" />
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReviewCorrection(c.id, 'rejected')}
                                className="px-3 py-1 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs flex items-center gap-1 border border-rose-900"
                              >
                                <X className="w-3 h-3" />
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 3.2 Leave Requests */}
            <div>
              <div className="flex items-center justify-between mb-3 border-b-2 border-slate-200 pb-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-purple-700" />
                  <span>Pending Leave Requests ({pendingLeaves.length})</span>
                </h4>
              </div>

              {pendingLeaves.length === 0 ? (
                <div className="p-6 bg-slate-50 border-2 border-slate-200 text-center text-xs text-slate-500 font-medium">
                  <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
                  No pending leave applications from assigned team members.
                </div>
              ) : (
                <div className="overflow-x-auto border-2 border-slate-300">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-800 uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 border-r border-slate-200">Employee</th>
                        <th className="p-2.5 border-r border-slate-200">Leave Type</th>
                        <th className="p-2.5 border-r border-slate-200">Duration</th>
                        <th className="p-2.5 border-r border-slate-200">Reason</th>
                        <th className="p-2.5 text-right">Action Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {pendingLeaves.map(l => (
                        <tr key={l.id} className="hover:bg-slate-50">
                          <td className="p-2.5 border-r border-slate-200 font-bold text-slate-900">
                            {l.employee_name} <span className="text-slate-400 font-mono font-normal">({l.employee_code})</span>
                          </td>
                          <td className="p-2.5 border-r border-slate-200 font-black text-sky-800">{l.leave_type_name}</td>
                          <td className="p-2.5 border-r border-slate-200 text-slate-800 font-mono font-bold">
                            {l.start_date} to {l.end_date} ({l.total_days} d)
                          </td>
                          <td className="p-2.5 border-r border-slate-200 text-slate-700">{l.reason}</td>
                          <td className="p-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleReviewLeave(l.id, 'approved')}
                                className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1 border border-emerald-900"
                              >
                                <Check className="w-3 h-3" />
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReviewLeave(l.id, 'rejected')}
                                className="px-3 py-1 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs flex items-center gap-1 border border-rose-900"
                              >
                                <X className="w-3 h-3" />
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Archived / Resolved History */}
        {approvalTab === 'archived' && (
          <div className="p-5 space-y-6">
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3">
                Resolved Attendance Corrections ({archivedCorrections.length})
              </h4>
              {archivedCorrections.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 border-2 border-slate-200">
                  No archived correction records.
                </div>
              ) : (
                <div className="overflow-x-auto border-2 border-slate-300">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-800 uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 border-r border-slate-200">Employee</th>
                        <th className="p-2.5 border-r border-slate-200">Date</th>
                        <th className="p-2.5 border-r border-slate-200">Requested Times</th>
                        <th className="p-2.5 border-r border-slate-200">Decision</th>
                        <th className="p-2.5">Reviewer Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {archivedCorrections.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="p-2.5 border-r border-slate-200 font-bold text-slate-900">
                            {c.employee_name} ({c.employee_code})
                          </td>
                          <td className="p-2.5 border-r border-slate-200 font-mono text-slate-700">{c.date}</td>
                          <td className="p-2.5 border-r border-slate-200 font-mono text-[11px]">
                            {c.requested_punch_in || '--:--:--'} to {c.requested_punch_out || '--:--:--'}
                          </td>
                          <td className="p-2.5 border-r border-slate-200">
                            <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                              c.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-rose-100 text-rose-800 border border-rose-300'
                            }`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-600">{c.review_notes || 'Resolved'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3">
                Resolved Leave Requests ({archivedLeaves.length})
              </h4>
              {archivedLeaves.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 border-2 border-slate-200">
                  No archived leave records.
                </div>
              ) : (
                <div className="overflow-x-auto border-2 border-slate-300">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-800 uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 border-r border-slate-200">Employee</th>
                        <th className="p-2.5 border-r border-slate-200">Leave Type</th>
                        <th className="p-2.5 border-r border-slate-200">Dates</th>
                        <th className="p-2.5 border-r border-slate-200">Decision</th>
                        <th className="p-2.5">Review Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {archivedLeaves.map(l => (
                        <tr key={l.id} className="hover:bg-slate-50">
                          <td className="p-2.5 border-r border-slate-200 font-bold text-slate-900">
                            {l.employee_name} ({l.employee_code})
                          </td>
                          <td className="p-2.5 border-r border-slate-200 font-black text-sky-800">{l.leave_type_name}</td>
                          <td className="p-2.5 border-r border-slate-200 font-mono">{l.start_date} to {l.end_date}</td>
                          <td className="p-2.5 border-r border-slate-200">
                            <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                              l.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-rose-100 text-rose-800 border border-rose-300'
                            }`}>
                              {l.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-600">{l.rejection_reason || 'Resolved by Manager'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: PRE-DOWNLOAD HEADER MODIFIER (SECTION 1: DAILY ATTENDANCE)       */}
      {/* ========================================================================= */}
      {showSec1ColModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-400 max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b-2 border-slate-300 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Columns className="w-4 h-4 text-sky-700" />
                <h3 className="text-sm font-black text-slate-900 uppercase">
                  Customize Headers: Daily Attendance Report
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSec1ColModal(false)}
                className="p-1 text-slate-500 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-700">
                  Select which of the 10 headers to include in your export:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSec1SelectedCols(STANDARD_REPORT_HEADERS.map(h => h.key))}
                    className="text-[11px] text-sky-700 font-bold hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSec1SelectedCols([])}
                    className="text-[11px] text-rose-700 font-bold hover:underline"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {STANDARD_REPORT_HEADERS.map(hdr => {
                  const isChecked = sec1SelectedCols.includes(hdr.key);
                  return (
                    <label
                      key={hdr.key}
                      className={`flex items-start gap-2.5 p-2 border-2 cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-sky-50/70 border-sky-400 text-slate-900'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSec1SelectedCols(sec1SelectedCols.filter(k => k !== hdr.key));
                          } else {
                            setSec1SelectedCols([...sec1SelectedCols, hdr.key]);
                          }
                        }}
                        className="mt-0.5 w-4 h-4 border-slate-400 rounded-none text-sky-700 focus:ring-0"
                      />
                      <div>
                        <div className="font-bold text-xs">{hdr.label}</div>
                        <div className="text-[10px] text-slate-500 leading-tight">{hdr.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 text-slate-600 text-[11px]">
                {sec1SelectedCols.length === 0 ? (
                  <span className="text-rose-600 font-bold">Please select at least 1 header to download.</span>
                ) : (
                  <span>
                    <strong>{sec1SelectedCols.length} of 10 headers selected</strong>. Downloaded files will strictly include these columns.
                  </span>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSec1ColModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-300"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSection1('xlsx')}
                  disabled={sec1SelectedCols.length === 0 || sec1Exporting}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold border-2 border-emerald-900 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Download Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSection1('pdf')}
                  disabled={sec1SelectedCols.length === 0 || sec1Exporting}
                  className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white font-bold border-2 border-rose-900 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-200" />
                  <span>Download PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: PRE-DOWNLOAD HEADER MODIFIER (SECTION 2: FULL MONTH LOGS)        */}
      {/* ========================================================================= */}
      {showSec2ColModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-400 max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b-2 border-slate-300 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Columns className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-black text-slate-900 uppercase">
                  Customize Headers: Full Month Attendance Log File
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSec2ColModal(false)}
                className="p-1 text-slate-500 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-700">
                  Select headers for {MONTH_NAMES[sec2Month - 1]} {sec2Year} export:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSec2SelectedCols(SECTION_2_REPORT_HEADERS.map(h => h.key))}
                    className="text-[11px] text-emerald-700 font-bold hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSec2SelectedCols([])}
                    className="text-[11px] text-rose-700 font-bold hover:underline"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {SECTION_2_REPORT_HEADERS.map(hdr => {
                  const isChecked = sec2SelectedCols.includes(hdr.key);
                  return (
                    <label
                      key={hdr.key}
                      className={`flex items-start gap-2.5 p-2 border-2 cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-emerald-50/70 border-emerald-400 text-slate-900'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSec2SelectedCols(sec2SelectedCols.filter(k => k !== hdr.key));
                          } else {
                            setSec2SelectedCols([...sec2SelectedCols, hdr.key]);
                          }
                        }}
                        className="mt-0.5 w-4 h-4 border-slate-400 rounded-none text-emerald-700 focus:ring-0"
                      />
                      <div>
                        <div className="font-bold text-xs">{hdr.label}</div>
                        <div className="text-[10px] text-slate-500 leading-tight">{hdr.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="p-3 bg-emerald-50/60 border border-emerald-300 text-emerald-900 text-[11px]">
                {sec2SelectedCols.length === 0 ? (
                  <span className="text-rose-600 font-bold">Please select at least 1 header to export.</span>
                ) : (
                  <span>
                    <strong>{sec2SelectedCols.length} of {SECTION_2_REPORT_HEADERS.length} headers selected</strong>. Full month log file will include all calendar days with Date as 1st column without skipping any date.
                  </span>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSec2ColModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-300"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSection2('xlsx')}
                  disabled={sec2SelectedCols.length === 0 || sec2Exporting}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold border-2 border-emerald-900 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Export Full Month Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSection2('pdf')}
                  disabled={sec2SelectedCols.length === 0 || sec2Exporting}
                  className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white font-bold border-2 border-rose-900 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-200" />
                  <span>Export Full Month PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
