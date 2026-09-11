import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock, Calendar, Users, Filter, Download, Upload,
  FileSpreadsheet, FileText, CheckCircle, AlertTriangle, RefreshCw,
  Edit3, Check, X, SlidersHorizontal, ChevronLeft, ChevronRight,
  Eye, CheckSquare, Square, ChevronDown, UserCheck, Plus, Search,
  MapPin, ShieldCheck, ArrowRight, History, Inbox, Ban
} from 'lucide-react';
import { apiRequest } from '../api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function ManagerAttendanceReportsView({ user, company = {}, onStatsUpdate }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Mapped Team Members
  const [teamEmployees, setTeamEmployees] = useState([]);
  const [loadingTeam, setLoadingTeam] = useState(false);

  // Attendance Records & Pagination State (Default 10 per page)
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [customPageSize, setCustomPageSize] = useState('');
  const [isCustomPageSize, setIsCustomPageSize] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // FILTER 1: Date Filter Mode ('today' | 'month' | 'custom' | 'all')
  const [dateFilterMode, setDateFilterMode] = useState('today'); // 'today', 'month', 'custom', 'all'
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [filterYear, setFilterYear] = useState(currentYear);
  const [customFromDate, setCustomFromDate] = useState(todayStr);
  const [customToDate, setCustomToDate] = useState(todayStr);

  // FILTER 2: Employee Filter Mode ('all' | 'individual' | 'multiple')
  const [employeeFilterMode, setEmployeeFilterMode] = useState('all'); // 'all', 'individual', 'multiple'
  const [selectedIndividualEmp, setSelectedIndividualEmp] = useState('');
  const [selectedMultipleEmps, setSelectedMultipleEmps] = useState([]); // array of employee DB IDs
  const [showMultiEmpDropdown, setShowMultiEmpDropdown] = useState(false);
  const [multiEmpSearch, setMultiEmpSearch] = useState('');

  // FILTER 3: Status Filter ('all' | 'Present' | 'Absent' | 'Leave' | 'WO' | 'HO')
  const [statusFilter, setStatusFilter] = useState('all');

  // Text Search
  const [searchQuery, setSearchQuery] = useState('');

  // Summary counts
  const [summary, setSummary] = useState({ total: 0, present: 0, absent: 0, half_day: 0, leave: 0 });

  // Modals state
  // Auto-calculate working hours and status helper
  const calculateWorkingHoursAndStatus = (inTime, outTime, currentStatus) => {
    if (!inTime || !outTime) return { hours: '', status: currentStatus };
    const parts1 = inTime.split(':').map(Number);
    const parts2 = outTime.split(':').map(Number);
    if (parts1.some(isNaN) || parts2.some(isNaN)) return { hours: '', status: currentStatus };
    const s1 = (parts1[0] || 0) * 3600 + (parts1[1] || 0) * 60 + (parts1[2] || 0);
    const s2 = (parts2[0] || 0) * 3600 + (parts2[1] || 0) * 60 + (parts2[2] || 0);
    const diffSec = s2 - s1;
    if (diffSec <= 0) return { hours: '0.0', status: 'Absent' };
    const hrs = Math.round((diffSec / 3600) * 100) / 100;
    let status = currentStatus;
    if (!status || ['Present', 'Half Day', 'Absent'].includes(status)) {
      if (hrs >= 8.0) status = 'Present';
      else if (hrs >= 4.0) status = 'Half Day';
      else status = 'Absent';
    }
    return { hours: String(hrs), status };
  };

  const [showManualModal, setShowManualModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null); // if editing an existing row
  const [manualForm, setManualForm] = useState({
    employee_id: '',
    date: todayStr,
    punch_in_time: '09:00:00',
    punch_out_time: '18:00:00',
    status: 'Present',
    total_hours: '9.0',
    remarks: '',
    reason: ''
  });
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const handleManualTimeChange = (field, val) => {
    const inT = field === 'punch_in_time' ? val : manualForm.punch_in_time;
    const outT = field === 'punch_out_time' ? val : manualForm.punch_out_time;
    const updated = { ...manualForm, [field]: val };
    if (inT && outT) {
      const { hours, status } = calculateWorkingHoursAndStatus(inT, outT, manualForm.status);
      if (hours) {
        updated.total_hours = hours;
        updated.status = status;
      }
    }
    setManualForm(updated);
  };

  // Excel Upload Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [committing, setCommitting] = useState(false);

  // Export State
  const [exporting, setExporting] = useState(false);

  // APPROVALS SECTION: Attendance Corrections & Leave Requests
  const [approvalTab, setApprovalTab] = useState('pending'); // 'pending' | 'archived'
  const [pendingCorrections, setPendingCorrections] = useState([]);
  const [archivedCorrections, setArchivedCorrections] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [archivedLeaves, setArchivedLeaves] = useState([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState('');

  // Load team employees for filter dropdowns
  const fetchTeamEmployees = async () => {
    setLoadingTeam(true);
    try {
      const res = await apiRequest('/employees?limit=200');
      const list = res.employees || [];
      setTeamEmployees(list);
    } catch (err) {
      console.error('Failed to load team employees:', err);
    } finally {
      setLoadingTeam(false);
    }
  };

  useEffect(() => {
    fetchTeamEmployees();
    fetchApprovals();
  }, []);

  // Fetch Attendance Records
  const fetchAttendance = async () => {
    setLoading(true);
    setError('');
    try {
      const offset = (page - 1) * pageSize;
      const params = new URLSearchParams();
      params.append('limit', pageSize);
      params.append('offset', offset);

      // 1. Date Filter
      if (dateFilterMode === 'today') {
        params.append('date', todayStr);
      } else if (dateFilterMode === 'month') {
        params.append('month', filterMonth);
        params.append('year', filterYear);
      } else if (dateFilterMode === 'custom') {
        if (customFromDate) params.append('from_date', customFromDate);
        if (customToDate) params.append('to_date', customToDate);
      }

      // 2. Employee Filter
      if (employeeFilterMode === 'individual' && selectedIndividualEmp) {
        params.append('employee_id', selectedIndividualEmp);
      } else if (employeeFilterMode === 'multiple' && selectedMultipleEmps.length > 0) {
        params.append('employee_ids', selectedMultipleEmps.join(','));
      }

      // 3. Status Filter
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      // 4. Search Query
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }

      const res = await apiRequest(`/attendance/list?${params.toString()}`);
      setRecords(res.records || []);
      setTotalRecords(res.total || 0);
      if (res.summary) setSummary(res.summary);
    } catch (err) {
      setError(err.message || 'Failed to fetch attendance reports.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-filter when filter dependencies change
  useEffect(() => {
    fetchAttendance();
  }, [
    page, pageSize, dateFilterMode, filterMonth, filterYear,
    customFromDate, customToDate, employeeFilterMode,
    selectedIndividualEmp, selectedMultipleEmps, statusFilter
  ]);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchAttendance();
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch Approvals (Corrections & Leaves)
  const fetchApprovals = async () => {
    setLoadingApprovals(true);
    try {
      // 1. Attendance Corrections
      const corrRes = await apiRequest('/attendance/correction-requests?limit=100');
      const allCorrs = corrRes.requests || [];
      setPendingCorrections(allCorrs.filter(c => c.status === 'pending'));
      setArchivedCorrections(allCorrs.filter(c => c.status !== 'pending'));

      // 2. Leave Requests
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

  // Handle Correction Review (Approve / Reject)
  const handleReviewCorrection = async (corrId, status) => {
    try {
      await apiRequest(`/attendance/correction-requests/${corrId}/review`, {
        method: 'PUT',
        body: { status, review_notes: decisionNotes || `Reviewed by ${user.username}` }
      });
      setSuccess(`Attendance correction request #${corrId} ${status} successfully.`);
      setDecisionNotes('');
      // Instant cross-tab and cross-window sync to employee panel
      try {
        new BroadcastChannel('npb_hrms_attendance_sync').postMessage({ type: 'ATTENDANCE_CORRECTED', timestamp: Date.now() });
      } catch (e) {}
      localStorage.setItem('hrms_attendance_updated', String(Date.now()));
      window.dispatchEvent(new CustomEvent('master-refresh'));

      fetchApprovals();
      fetchAttendance();
      if (onStatsUpdate) onStatsUpdate();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || `Failed to ${status} correction request.`);
    }
  };

  // Handle Leave Review (Approve / Reject)
  const handleReviewLeave = async (leaveId, status) => {
    try {
      await apiRequest(`/leave/requests/${leaveId}`, {
        method: 'PUT',
        body: { status, rejection_reason: decisionNotes || `Reviewed by ${user.username}` }
      });
      setSuccess(`Leave request #${leaveId} ${status} successfully.`);
      setDecisionNotes('');
      fetchApprovals();
      fetchAttendance();
      if (onStatsUpdate) onStatsUpdate();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || `Failed to ${status} leave request.`);
    }
  };

  // Export handler (Excel or PDF) with optional scope override
  const handleExport = async (format, scopeOverride = null) => {
    setExporting(true);
    setError('');
    try {
      const exportBody = {
        format,
        status: statusFilter,
        search: searchQuery,
        selected_columns: [
          'Employee',
          'Date',
          'Punch In',
          'Punch Out',
          'Hours',
          'Status',
          'Location / Geofence',
          'Remarks'
        ]
      };

      const targetScope = scopeOverride || dateFilterMode;

      if (targetScope === 'today') {
        exportBody.date = todayStr;
      } else if (targetScope === 'month') {
        exportBody.month = filterMonth;
        exportBody.year = filterYear;
      } else if (targetScope === 'custom') {
        exportBody.from_date = customFromDate;
        exportBody.to_date = customToDate;
      }

      if (employeeFilterMode === 'individual' && selectedIndividualEmp) {
        exportBody.employee_id = selectedIndividualEmp;
      } else if (employeeFilterMode === 'multiple' && selectedMultipleEmps.length > 0) {
        exportBody.employee_ids = selectedMultipleEmps;
      }

      const res = await apiRequest('/attendance/export', {
        method: 'POST',
        body: exportBody
      });

      if (res.isBlob) {
        const url = window.URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `Attendance_${targetScope.toUpperCase()}_${timestamp}.xlsx`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setSuccess(`Exported Excel attendance report successfully.`);
        setTimeout(() => setSuccess(''), 3500);
      } else if (res.isHtmlReport) {
        const win = window.open('', '_blank');
        if (win) {
          win.document.open();
          win.document.write(res.htmlText);
          win.document.close();
          setSuccess('Generated printable PDF attendance report.');
        } else {
          const blob = new Blob([res.htmlText], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Attendance_${targetScope.toUpperCase()}_${Date.now()}.html`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setSuccess('Downloaded printable report file (Open and press Ctrl+P to save as PDF).');
        }
        setTimeout(() => setSuccess(''), 3500);
      }
    } catch (err) {
      setError(err.message || `Failed to export ${format.toUpperCase()} report.`);
    } finally {
      setExporting(false);
    }
  };

  // Page size changing
  const handlePageSizeChange = (val) => {
    if (val === 'custom') {
      setIsCustomPageSize(true);
    } else {
      setIsCustomPageSize(false);
      setPageSize(Number(val));
      setPage(1);
    }
  };

  const handleApplyCustomPageSize = (e) => {
    e.preventDefault();
    const val = parseInt(customPageSize, 10);
    if (!isNaN(val) && val > 0 && val <= 500) {
      setPageSize(val);
      setPage(1);
    } else {
      setError('Please enter a valid row count between 1 and 500.');
    }
  };

  // Multiple Employee Filter Selection Toggle
  const toggleSelectMultipleEmp = (empId) => {
    setSelectedMultipleEmps(prev => {
      if (prev.includes(empId)) {
        return prev.filter(id => id !== empId);
      } else {
        return [...prev, empId];
      }
    });
    setPage(1);
  };

  const handleSelectAllMultiple = () => {
    if (selectedMultipleEmps.length === teamEmployees.length) {
      setSelectedMultipleEmps([]);
    } else {
      setSelectedMultipleEmps(teamEmployees.map(e => e.id));
    }
    setPage(1);
  };

  // Open Edit Attendance Row Modal
  const openEditModal = (rec) => {
    setEditingRecord(rec);
    setManualForm({
      employee_id: rec.employee_id,
      date: rec.date,
      punch_in_time: rec.punch_in_time || '09:00:00',
      punch_out_time: rec.punch_out_time || '18:00:00',
      status: rec.status || 'Present',
      total_hours: rec.total_hours !== undefined ? String(rec.total_hours) : '9.0',
      remarks: rec.remarks || '',
      reason: ''
    });
    setShowManualModal(true);
  };

  // Open Add Manual Attendance Modal
  const openNewManualModal = () => {
    setEditingRecord(null);
    setManualForm({
      employee_id: teamEmployees[0]?.id || '',
      date: todayStr,
      punch_in_time: '09:00:00',
      punch_out_time: '18:00:00',
      status: 'Present',
      total_hours: '9.0',
      remarks: 'Manual supervisor entry',
      reason: ''
    });
    setShowManualModal(true);
  };

  // Save Manual Attendance (Add or Edit)
  const handleSaveManual = async (e) => {
    e.preventDefault();
    if (!manualForm.reason.trim()) {
      setError('A mandatory audit reason is required for attendance update.');
      return;
    }
    setManualSubmitting(true);
    setError('');
    try {
      if (editingRecord?.id) {
        // Correct existing record
        await apiRequest(`/attendance/correct/${editingRecord.id}`, {
          method: 'PUT',
          body: {
            punch_in_time: manualForm.punch_in_time,
            punch_out_time: manualForm.punch_out_time,
            status: manualForm.status,
            total_hours: manualForm.total_hours,
            remarks: manualForm.remarks,
            reason: manualForm.reason
          }
        });
        setSuccess(`Attendance record for ${editingRecord.employee_name} updated successfully.`);
      } else {
        // Upsert manual attendance
        await apiRequest('/attendance/manual', {
          method: 'POST',
          body: manualForm
        });
        setSuccess('Manual attendance entry saved successfully.');
      }
      // Instant cross-tab and cross-window sync to employee panel
      try {
        new BroadcastChannel('npb_hrms_attendance_sync').postMessage({ type: 'ATTENDANCE_UPDATED', timestamp: Date.now() });
      } catch (e) {}
      localStorage.setItem('hrms_attendance_updated', String(Date.now()));
      window.dispatchEvent(new CustomEvent('master-refresh'));

      setShowManualModal(false);
      fetchAttendance();
      if (onStatsUpdate) onStatsUpdate();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to save manual attendance.');
    } finally {
      setManualSubmitting(false);
    }
  };

  // Excel Upload Helpers
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadFile(file);
      setValidationResult(null);
    }
  };

  const handleValidateExcel = async () => {
    if (!uploadFile) return;
    setValidating(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const res = await apiRequest('/attendance/excel/validate', {
        method: 'POST',
        body: formData
      });
      setValidationResult(res);
    } catch (err) {
      setError(err.message || 'Validation failed.');
    } finally {
      setValidating(false);
    }
  };

  const handleCommitExcel = async () => {
    if (!validationResult || !validationResult.validRows?.length) return;
    setCommitting(true);
    setError('');
    try {
      const res = await apiRequest('/attendance/excel/commit', {
        method: 'POST',
        body: { validRows: validationResult.validRows }
      });
      setSuccess(`Successfully synchronized attendance for ${res.synced || validationResult.validRows.length} employee records.`);
      setShowUploadModal(false);
      setUploadFile(null);
      setValidationResult(null);
      fetchAttendance();
      if (onStatsUpdate) onStatsUpdate();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Commit failed.');
    } finally {
      setCommitting(false);
    }
  };

  const handleDownloadTemplate = () => {
    window.location.href = '/api/attendance/excel/template';
  };

  // Format 12-hour display
  const formatTime = (timeStr) => {
    if (!timeStr || timeStr === '-' || timeStr === '--:--') return '--:--';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    return `${h < 10 ? '0' + h : h}:${m} ${ampm}`;
  };

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const totalPendingApprovals = pendingCorrections.length + pendingLeaves.length;

  return (
    <div className="space-y-6">
      {/* 1. PAGE HEADER */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100 shadow-xs">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Daily Attendance Reports
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700 border border-sky-200">
                  Manager Portal
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {company?.name ? `${company.name} • ` : ''}
                Real-time team attendance logs, GPS locations, batch Excel synchronization, and approval decisions
              </p>
            </div>
          </div>

          {/* Action Buttons: Batch Excel Upload & Refresh */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Batch Upload Attendance via Excel */}
            <button
              type="button"
              onClick={() => { setShowUploadModal(true); setValidationResult(null); setUploadFile(null); }}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-all"
              title="Upload Excel to batch update attendance for multiple employees"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Attendance</span>
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={() => { fetchAttendance(); fetchApprovals(); }}
              disabled={loading}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
              title="Refresh attendance and approvals"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{success}</span>
          </div>
        )}

        {/* Quick Summary Strip */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 border-t border-slate-100 text-xs">
          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/60">
            <div className="text-slate-400 text-[11px] font-medium">Total Records</div>
            <div className="text-base font-black text-slate-800 mt-0.5">{totalRecords}</div>
          </div>
          <div className="bg-emerald-50/80 rounded-xl p-3 border border-emerald-200/60">
            <div className="text-emerald-700 text-[11px] font-medium">Present</div>
            <div className="text-base font-black text-emerald-800 mt-0.5">{summary.present || 0}</div>
          </div>
          <div className="bg-rose-50/80 rounded-xl p-3 border border-rose-200/60">
            <div className="text-rose-700 text-[11px] font-medium">Absent</div>
            <div className="text-base font-black text-rose-800 mt-0.5">{summary.absent || 0}</div>
          </div>
          <div className="bg-amber-50/80 rounded-xl p-3 border border-amber-200/60">
            <div className="text-amber-700 text-[11px] font-medium">Half Day</div>
            <div className="text-base font-black text-amber-800 mt-0.5">{summary.half_day || 0}</div>
          </div>
          <div className="bg-purple-50/80 rounded-xl p-3 border border-purple-200/60">
            <div className="text-purple-700 text-[11px] font-medium">Leave / Off</div>
            <div className="text-base font-black text-purple-800 mt-0.5">{summary.leave || 0}</div>
          </div>
        </div>
      </div>

      {/* 2. FILTER SECTION (Date Dropdown, Employee Filter, Status Dropdown, Pagination Limit) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-sky-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Attendance Filters</span>
          </div>
          <span className="text-[11px] text-slate-400">
            Active view: <strong className="text-slate-700">{dateFilterMode === 'today' ? `Today (${todayStr}) - Daily Report` : dateFilterMode === 'month' ? `${MONTH_NAMES[filterMonth - 1]} ${filterYear} (Monthly)` : `${customFromDate} to ${customToDate}`}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* COLUMN 1: FILTER DATE DROPDOWN (Today, Month, Custom) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Date Filter:
            </label>
            <div className="relative">
              <select
                value={dateFilterMode}
                onChange={(e) => {
                  setDateFilterMode(e.target.value);
                  setPage(1);
                }}
                className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="today">Today ({todayStr}) [Default - Daily Basis]</option>
                <option value="month">Month-wise</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            {dateFilterMode === 'today' && (
              <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200/80 rounded-lg text-[11px] text-emerald-800 flex items-center gap-1.5 font-medium">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Auto-showing today's live status for all employees (Present/Absent/Leave).</span>
              </div>
            )}

            {/* If Month selected: Month & Year pickers */}
            {dateFilterMode === 'month' && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <select
                  value={filterMonth}
                  onChange={(e) => { setFilterMonth(parseInt(e.target.value, 10)); setPage(1); }}
                  className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs font-medium focus:outline-none"
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={m} value={idx + 1}>{m}</option>
                  ))}
                </select>
                <select
                  value={filterYear}
                  onChange={(e) => { setFilterYear(parseInt(e.target.value, 10)); setPage(1); }}
                  className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs font-medium focus:outline-none"
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {/* If Custom selected: From Date & To Date */}
            {dateFilterMode === 'custom' && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <span className="text-[10px] text-slate-500 block">From Date:</span>
                  <input
                    type="date"
                    value={customFromDate}
                    onChange={(e) => { setCustomFromDate(e.target.value); setPage(1); }}
                    className="w-full py-1 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs font-medium"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">To Date:</span>
                  <input
                    type="date"
                    value={customToDate}
                    onChange={(e) => { setCustomToDate(e.target.value); setPage(1); }}
                    className="w-full py-1 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs font-medium"
                  />
                </div>
              </div>
            )}
          </div>

          {/* COLUMN 2: EMPLOYEE FILTER (All Employees, Individual, Multiple) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Employee Filter:
            </label>
            <select
              value={employeeFilterMode}
              onChange={(e) => {
                setEmployeeFilterMode(e.target.value);
                setPage(1);
              }}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="all">All Employees [Default - Daily Data]</option>
              <option value="individual">Single Employee</option>
              <option value="multiple">Multiple Employees (Manual Select)</option>
            </select>

            {/* If Individual: Select single employee */}
            {employeeFilterMode === 'individual' && (
              <div className="mt-2">
                <select
                  value={selectedIndividualEmp}
                  onChange={(e) => { setSelectedIndividualEmp(e.target.value); setPage(1); }}
                  className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-medium focus:outline-none"
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

            {/* If Multiple: Multi-select dropdown */}
            {employeeFilterMode === 'multiple' && (
              <div className="relative mt-2">
                <button
                  type="button"
                  onClick={() => setShowMultiEmpDropdown(!showMultiEmpDropdown)}
                  className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-medium flex items-center justify-between"
                >
                  <span className="truncate">
                    {selectedMultipleEmps.length === 0
                      ? 'Select Employees...'
                      : `${selectedMultipleEmps.length} Selected`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {showMultiEmpDropdown && (
                  <div className="absolute left-0 top-full mt-1 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-2.5 z-40 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="font-bold text-[11px] text-slate-700">Team Members</span>
                      <button
                        type="button"
                        onClick={handleSelectAllMultiple}
                        className="text-[11px] text-sky-600 font-semibold hover:underline"
                      >
                        {selectedMultipleEmps.length === teamEmployees.length ? 'Clear All' : 'Select All'}
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="w-3 h-3 absolute left-2.5 top-2 text-slate-400" />
                      <input
                        type="text"
                        value={multiEmpSearch}
                        onChange={(e) => setMultiEmpSearch(e.target.value)}
                        placeholder="Search team..."
                        className="w-full pl-7 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {teamEmployees
                        .filter(e => e.full_name.toLowerCase().includes(multiEmpSearch.toLowerCase()) || e.employee_id.toLowerCase().includes(multiEmpSearch.toLowerCase()))
                        .map(emp => {
                          const isChecked = selectedMultipleEmps.includes(emp.id);
                          return (
                            <label
                              key={emp.id}
                              className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-slate-700 text-xs"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelectMultipleEmp(emp.id)}
                                className="rounded text-sky-600 focus:ring-sky-500"
                              />
                              <span className="font-medium truncate">{emp.full_name}</span>
                              <span className="text-[10px] text-slate-400 font-mono ml-auto">({emp.employee_id})</span>
                            </label>
                          );
                        })}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowMultiEmpDropdown(false)}
                      className="w-full py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold"
                    >
                      Done ({selectedMultipleEmps.length})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* COLUMN 3: STATUS DROPDOWN (Present, Absent, Leave, WO, HO) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Status Filter:
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="all">All Statuses</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Leave">Leave</option>
              <option value="WO">WO (Weekly Off)</option>
              <option value="HO">HO (Holiday)</option>
            </select>

            <div className="relative mt-2">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, code, remark..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs"
              />
            </div>
          </div>

          {/* COLUMN 4: ROWS PER PAGE (10, 25, Custom) & APPLY BUTTON */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Rows Per Page:
            </label>
            <div className="flex items-center gap-1.5">
              <select
                value={isCustomPageSize ? 'custom' : pageSize}
                onChange={(e) => handlePageSizeChange(e.target.value)}
                className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value={10}>10 Employees (Default)</option>
                <option value={25}>25 Employees</option>
                <option value="custom">Custom Limit</option>
              </select>
            </div>

            {isCustomPageSize && (
              <form onSubmit={handleApplyCustomPageSize} className="flex items-center gap-1 mt-2">
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={customPageSize}
                  onChange={(e) => setCustomPageSize(e.target.value)}
                  placeholder="e.g. 15, 50"
                  className="w-24 py-1 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold"
                >
                  Apply
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => { setPage(1); fetchAttendance(); }}
              className="w-full mt-2 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-sm transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Filters</span>
            </button>
          </div>
        </div>

        {/* Quick Date Scope & Download Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          {/* Quick Date Scope Selectors */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Date Scope:</span>
            <button
              type="button"
              onClick={() => { setDateFilterMode('today'); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1 ${
                dateFilterMode === 'today'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Today (Daily Basis) [Default]</span>
            </button>
            <button
              type="button"
              onClick={() => { setDateFilterMode('month'); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1 ${
                dateFilterMode === 'month'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Month-wise ({MONTH_NAMES[filterMonth - 1]})</span>
            </button>
            <button
              type="button"
              onClick={() => { setDateFilterMode('custom'); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1 ${
                dateFilterMode === 'custom'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>Custom Date Range</span>
            </button>
          </div>

          {/* Download Buttons: Excel & PDF */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              disabled={exporting}
              className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              title="Download attendance report in Excel (.xlsx) with all 8 headers: Employee, Date, Punch In, Punch Out, Hours, Status, Location/Geofence, Remarks"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
              <span>{exporting ? 'Exporting...' : 'Download Excel'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={exporting}
              className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              title="Download attendance report in PDF / Printable with all 8 headers: Employee, Date, Punch In, Punch Out, Hours, Status, Location/Geofence, Remarks"
            >
              <FileText className="w-4 h-4 text-rose-300" />
              <span>{exporting ? 'Exporting...' : 'Download PDF'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. ATTENDANCE TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Team Attendance Records
            </h3>
            <p className="text-xs text-slate-400">
              Showing {totalRecords === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalRecords)} of {totalRecords} employee records
            </p>
          </div>

          <div className="text-xs text-slate-500">
            Page <strong className="text-slate-800">{page}</strong> of <strong className="text-slate-800">{totalPages}</strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3">Employee</th>
                <th className="p-3">Date</th>
                <th className="p-3">Punch In</th>
                <th className="p-3">Punch Out</th>
                <th className="p-3">Hours</th>
                <th className="p-3">Status</th>
                <th className="p-3">Location / Geofence</th>
                <th className="p-3">Remarks</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-sky-600" />
                    Loading attendance records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No attendance records found for the selected filter criteria.
                  </td>
                </tr>
              ) : (
                records.map(r => (
                  <tr key={r.id || `${r.employee_id}-${r.date}`} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3 font-semibold text-slate-900">
                      <div>{r.employee_name}</div>
                      <span className="text-[10px] text-slate-400 font-mono font-normal">
                        {r.employee_code} • {r.department || 'Operations'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700 font-mono whitespace-nowrap">
                      {r.date}
                    </td>
                    <td className="p-3">
                      <span className="font-bold text-slate-800 font-mono">
                        {formatTime(r.punch_in_time)}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-bold text-slate-800 font-mono">
                        {formatTime(r.punch_out_time)}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-slate-700 font-mono">
                      {r.total_hours !== null && r.total_hours !== undefined ? (
                        `${r.total_hours} hrs`
                      ) : r.punch_in_time && !r.punch_out_time ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active
                        </span>
                      ) : (
                        '--'
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        r.status === 'Present' ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'Absent' ? 'bg-rose-100 text-rose-700' :
                        r.status === 'Half Day' ? 'bg-amber-100 text-amber-700' :
                        r.status === 'Leave' ? 'bg-purple-100 text-purple-700' :
                        r.status === 'Weekly Off' || r.status === 'WO' ? 'bg-slate-100 text-slate-700' :
                        r.status === 'Holiday' || r.status === 'HO' ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {r.status}
                      </span>
                      {r.is_edited === 1 && (
                        <span className="ml-1 text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1 rounded border border-indigo-200" title="Manually Edited / Corrected">
                          Edited
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-slate-600 max-w-[140px] truncate" title={r.punch_in_location || 'Office'}>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-sky-500 shrink-0" />
                        <span className="truncate">{r.punch_in_location || 'Office / Geofenced'}</span>
                      </div>
                    </td>
                    <td className="p-3 text-slate-500 text-[11px] max-w-[120px] truncate" title={r.remarks || ''}>
                      {r.remarks || '-'}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEditModal(r)}
                        className="px-2 py-1 text-slate-700 hover:text-sky-600 bg-white hover:bg-sky-50 border border-slate-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs transition-colors"
                        title="Edit / Correct Attendance"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-sky-600" />
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-500">
            Showing <strong className="text-slate-800">{totalRecords === 0 ? 0 : (page - 1) * pageSize + 1}</strong> to <strong className="text-slate-800">{Math.min(page * pageSize, totalRecords)}</strong> of <strong className="text-slate-800">{totalRecords}</strong> employees
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span className="px-1 text-slate-400">...</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setPage(p)}
                    className={`min-w-[28px] py-1 px-2 rounded-lg font-bold text-xs transition-colors ${
                      page === p
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {p}
                  </button>
                </React.Fragment>
              ))}

            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || totalRecords === 0}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. TEAM APPROVALS SECTION: ATTENDANCE CORRECTIONS & LEAVE REQUESTS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Approvals Header & Sub-tab Switcher */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Team Approvals (Attendance Corrections & Leaves)
              </h3>
              <p className="text-xs text-slate-400">
                Review and decide on attendance adjustments and leave applications from assigned team members
              </p>
            </div>
          </div>

          {/* Sub-tab Switcher: Pending vs Archived */}
          <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setApprovalTab('pending')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                approvalTab === 'pending'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Pending Approvals</span>
              {totalPendingApprovals > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-black">
                  {totalPendingApprovals}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setApprovalTab('archived')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                approvalTab === 'archived'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Archived / Approved History</span>
            </button>
          </div>
        </div>

        {/* Content for TAB 1: PENDING APPROVALS */}
        {approvalTab === 'pending' && (
          <div className="p-4 space-y-6">
            {/* Section A: Pending Attendance Correction Requests */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-600" />
                  <span>Pending Attendance Corrections ({pendingCorrections.length})</span>
                </h4>
              </div>

              {pendingCorrections.length === 0 ? (
                <div className="p-6 bg-slate-50 rounded-xl text-center text-xs text-slate-400 border border-slate-100">
                  <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-1 opacity-70" />
                  No pending attendance corrections. All team punch adjustments are resolved.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                      <tr>
                        <th className="p-2.5">Employee</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Requested Punch</th>
                        <th className="p-2.5">Reason</th>
                        <th className="p-2.5 text-right">Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pendingCorrections.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50/50">
                          <td className="p-2.5 font-bold text-slate-900">
                            {c.employee_name} <span className="text-slate-400 font-normal">({c.employee_code})</span>
                          </td>
                          <td className="p-2.5 font-mono text-slate-700">{c.date}</td>
                          <td className="p-2.5 font-mono">
                            <span className="text-emerald-700 font-bold">{c.requested_punch_in || '--:--'}</span>
                            {' → '}
                            <span className="text-indigo-700 font-bold">{c.requested_punch_out || '--:--'}</span>
                          </td>
                          <td className="p-2.5 text-slate-600">{c.reason}</td>
                          <td className="p-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleReviewCorrection(c.id, 'approved')}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center gap-1 shadow-xs"
                              >
                                <Check className="w-3 h-3" />
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReviewCorrection(c.id, 'rejected')}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold flex items-center gap-1 shadow-xs"
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

            {/* Section B: Pending Leave Requests */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-purple-600" />
                  <span>Pending Leave Requests ({pendingLeaves.length})</span>
                </h4>
              </div>

              {pendingLeaves.length === 0 ? (
                <div className="p-6 bg-slate-50 rounded-xl text-center text-xs text-slate-400 border border-slate-100">
                  <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-1 opacity-70" />
                  No pending leave requests from team members.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                      <tr>
                        <th className="p-2.5">Employee</th>
                        <th className="p-2.5">Leave Type</th>
                        <th className="p-2.5">Duration</th>
                        <th className="p-2.5">Reason</th>
                        <th className="p-2.5 text-right">Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pendingLeaves.map(l => (
                        <tr key={l.id} className="hover:bg-slate-50/50">
                          <td className="p-2.5 font-bold text-slate-900">
                            {l.employee_name} <span className="text-slate-400 font-normal">({l.employee_code})</span>
                          </td>
                          <td className="p-2.5 font-bold text-sky-700">{l.leave_type_name}</td>
                          <td className="p-2.5 text-slate-700">
                            {l.start_date} to {l.end_date} ({l.total_days} days)
                          </td>
                          <td className="p-2.5 text-slate-600">{l.reason}</td>
                          <td className="p-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleReviewLeave(l.id, 'approved')}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center gap-1 shadow-xs"
                              >
                                <Check className="w-3 h-3" />
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReviewLeave(l.id, 'rejected')}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold flex items-center gap-1 shadow-xs"
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

        {/* Content for TAB 2: ARCHIVED / APPROVED HISTORY */}
        {approvalTab === 'archived' && (
          <div className="p-4 space-y-6">
            {/* Archived Corrections */}
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Resolved Attendance Corrections ({archivedCorrections.length})</span>
              </h4>
              {archivedCorrections.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                  No archived correction records.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                      <tr>
                        <th className="p-2.5">Employee</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Original / Requested</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Reviewer Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {archivedCorrections.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50/50">
                          <td className="p-2.5 font-bold text-slate-900">{c.employee_name} ({c.employee_code})</td>
                          <td className="p-2.5 font-mono">{c.date}</td>
                          <td className="p-2.5 font-mono text-[11px]">
                            {c.requested_punch_in || '--:--'} to {c.requested_punch_out || '--:--'}
                          </td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              c.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-500">{c.review_notes || 'Resolved'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Archived Leaves */}
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Resolved Leave Requests ({archivedLeaves.length})</span>
              </h4>
              {archivedLeaves.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                  No archived leave records.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                      <tr>
                        <th className="p-2.5">Employee</th>
                        <th className="p-2.5">Leave Type</th>
                        <th className="p-2.5">Dates</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {archivedLeaves.map(l => (
                        <tr key={l.id} className="hover:bg-slate-50/50">
                          <td className="p-2.5 font-bold text-slate-900">{l.employee_name} ({l.employee_code})</td>
                          <td className="p-2.5 font-bold text-sky-700">{l.leave_type_name}</td>
                          <td className="p-2.5 font-mono">{l.start_date} to {l.end_date} ({l.total_days} d)</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              l.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}>
                              {l.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-500">{l.rejection_reason || 'Approved by Manager'}</td>
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

      {/* 5. MANUAL RECORD / CORRECTION MODAL */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-scale-up">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {editingRecord ? `Edit Attendance: ${editingRecord.employee_name}` : 'Record Manual Attendance'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManual} className="p-5 space-y-4 text-xs">
              {!editingRecord && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Select Employee: *
                  </label>
                  <select
                    value={manualForm.employee_id}
                    onChange={(e) => setManualForm({ ...manualForm, employee_id: e.target.value })}
                    required
                    className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium"
                  >
                    <option value="">Choose team member...</option>
                    {teamEmployees.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.full_name} ({e.employee_id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Date: *</label>
                  <input
                    type="date"
                    value={manualForm.date}
                    disabled={!!editingRecord}
                    onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                    required
                    className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl font-mono disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Status: *</label>
                  <select
                    value={manualForm.status}
                    onChange={(e) => setManualForm({ ...manualForm, status: e.target.value })}
                    className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                    <option value="Half Day">Half Day</option>
                    <option value="Leave">Leave</option>
                    <option value="Weekly Off">Weekly Off (WO)</option>
                    <option value="Holiday">Holiday (HO)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Punch In:</label>
                  <input
                    type="time"
                    step="1"
                    value={manualForm.punch_in_time}
                    onChange={(e) => handleManualTimeChange('punch_in_time', e.target.value)}
                    className="w-full py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Punch Out:</label>
                  <input
                    type="time"
                    step="1"
                    value={manualForm.punch_out_time}
                    onChange={(e) => handleManualTimeChange('punch_out_time', e.target.value)}
                    className="w-full py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Total Hours:</label>
                  <input
                    type="number"
                    step="0.01"
                    value={manualForm.total_hours}
                    onChange={(e) => setManualForm({ ...manualForm, total_hours: e.target.value })}
                    placeholder="9.0"
                    className="w-full py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              {/* Auto Calculated Live Hours & Status Banner */}
              {manualForm.punch_in_time && manualForm.punch_out_time && (
                <div className="p-2.5 bg-indigo-50/80 border border-indigo-200/80 rounded-xl text-xs text-indigo-900 flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    Auto-Calculated Working Hours:
                  </span>
                  <span className="font-mono font-bold bg-indigo-200/70 px-2 py-0.5 rounded text-indigo-950">
                    {manualForm.total_hours || '0'} hrs • {manualForm.status}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Remarks (Optional):</label>
                <input
                  type="text"
                  value={manualForm.remarks}
                  onChange={(e) => setManualForm({ ...manualForm, remarks: e.target.value })}
                  placeholder="e.g. On-duty visit, biometric malfunction..."
                  className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-rose-700 mb-1">
                  Mandatory Audit Reason: *
                </label>
                <textarea
                  rows={2}
                  value={manualForm.reason}
                  onChange={(e) => setManualForm({ ...manualForm, reason: e.target.value })}
                  required
                  placeholder="Explain why this attendance entry or correction was made..."
                  className="w-full p-2.5 bg-rose-50/40 border border-rose-200 rounded-xl text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={manualSubmitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {manualSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Attendance</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. EXCEL UPLOAD ATTENDANCE MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden animate-scale-up">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Update Team Attendance via Excel Upload
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Instructions & Template Download */}
              <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200/80 flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-emerald-950">Excel Sync Format</h4>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Columns: Employee ID, Employee Name, Date (YYYY-MM-DD), Punch In, Punch Out, Attendance Status, Remarks.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg font-bold flex items-center gap-1 shadow-xs shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Template</span>
                </button>
              </div>

              {/* File Input */}
              <div className="border-2 border-dashed border-slate-200 hover:border-sky-400 rounded-xl p-6 text-center transition-colors">
                <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                <label className="cursor-pointer font-bold text-sky-600 hover:underline">
                  <span>Choose Excel File</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                <p className="text-[11px] text-slate-400 mt-1">
                  {uploadFile ? uploadFile.name : 'Drag and drop or browse .xlsx file from your device'}
                </p>
              </div>

              {/* Validation Results */}
              {validationResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Total Rows</div>
                      <div className="text-base font-black text-slate-800">{validationResult.totalRows}</div>
                    </div>
                    <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                      <div className="text-[10px] text-emerald-600 font-bold uppercase">Valid Rows</div>
                      <div className="text-base font-black text-emerald-700">{validationResult.validCount}</div>
                    </div>
                    <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200">
                      <div className="text-[10px] text-rose-600 font-bold uppercase">Errors</div>
                      <div className="text-base font-black text-rose-700">{validationResult.errorCount}</div>
                    </div>
                  </div>

                  {validationResult.errors?.length > 0 && (
                    <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 max-h-36 overflow-y-auto space-y-1">
                      <div className="font-bold text-rose-800 text-[11px]">Validation Errors Found:</div>
                      {validationResult.errors.map((err, idx) => (
                        <div key={idx} className="text-[10px] text-rose-700">
                          Row {err.row} ({err.employeeId}): {err.errors.join(', ')}
                        </div>
                      ))}
                    </div>
                  )}

                  {validationResult.validRows?.length > 0 && (
                    <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200">
                      <div className="font-bold text-emerald-900 text-[11px] mb-1">
                        Ready to Commit: {validationResult.validRows.length} Attendance Records
                      </div>
                      <p className="text-[10px] text-emerald-700">
                        Proceeding will synchronize and update the attendance records for all valid team employees listed.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>

                {!validationResult ? (
                  <button
                    type="button"
                    onClick={handleValidateExcel}
                    disabled={!uploadFile || validating}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {validating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    <span>Validate Excel</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCommitExcel}
                    disabled={committing || validationResult.validCount === 0}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {committing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Commit & Synchronize ({validationResult.validCount})</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
