import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock, Calendar, MapPin, Search, Filter, Download, Upload,
  FileSpreadsheet, FileText, CheckCircle, AlertTriangle, RefreshCw,
  Edit3, Check, X, SlidersHorizontal, ChevronLeft, ChevronRight,
  Eye, CheckSquare, Square, Building2, UserCheck, Shield
} from 'lucide-react';
import { apiRequest } from '../api';

// All 10 standard columns requested
const ALL_COLUMNS = [
  { id: 'name', label: 'Employee Name & Code' },
  { id: 'date', label: 'Attendance Date' },
  { id: 'punch_in', label: 'Punch In Time' },
  { id: 'punch_in_gps', label: 'GPS Lat/Long (Punch In)' },
  { id: 'punch_in_address', label: 'Address (Punch In)' },
  { id: 'punch_out', label: 'Punch Out Time' },
  { id: 'punch_out_gps', label: 'GPS Lat/Long (Punch Out)' },
  { id: 'punch_out_address', label: 'Address (Punch Out)' },
  { id: 'working_hours', label: 'Working Hours' },
  { id: 'status', label: 'Status' }
];

export default function AttendanceManagementView({ role = 'company_admin', company = {} }) {
  // Data state
  const [records, setRecords] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState({ total: 0, present: 0, absent: 0, half_day: 0, leave: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Pagination & limits (Default 10 rows per page as requested)
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [customLimit, setCustomLimit] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Date Filter mode: 'day' | 'month' | 'custom'
  const todayStr = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [dateFilterMode, setDateFilterMode] = useState('month'); // 'day', 'month', 'custom'
  const [filterDay, setFilterDay] = useState(todayStr);
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [filterYear, setFilterYear] = useState(currentYear);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Other filters
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'Present', 'Absent', 'Half Day', 'Leave'
  const [searchQuery, setSearchQuery] = useState('');

  // Column Picker / Header Filter state (only required fields can be selected to download & display)
  const [selectedColumns, setSelectedColumns] = useState(ALL_COLUMNS.map(c => c.id));
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  // Manual Edit / Correction modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editForm, setEditForm] = useState({
    punch_in_time: '',
    punch_out_time: '',
    status: 'Present',
    total_hours: '',
    reason: ''
  });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Excel Upload / Import Attendance modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [committing, setCommitting] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Fetch Attendance Records
  const fetchAttendance = async () => {
    setLoading(true);
    setError('');
    try {
      const offset = (page - 1) * limit;
      const params = new URLSearchParams();
      params.append('limit', limit);
      params.append('offset', offset);

      if (dateFilterMode === 'day' && filterDay) {
        params.append('date', filterDay);
      } else if (dateFilterMode === 'month') {
        params.append('month', filterMonth);
        params.append('year', filterYear);
      } else if (dateFilterMode === 'custom') {
        if (fromDate) params.append('from_date', fromDate);
        if (toDate) params.append('to_date', toDate);
      }

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }

      const res = await apiRequest(`/attendance/list?${params.toString()}`);
      setRecords(res.records || []);
      setTotalCount(res.total || 0);
      if (res.summary) setSummary(res.summary);
    } catch (err) {
      setError(err.message || 'Failed to load attendance records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [page, limit, dateFilterMode, filterDay, filterMonth, filterYear, fromDate, toDate, statusFilter]);

  // Search debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1);
      fetchAttendance();
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Column picker toggle
  const toggleColumn = (colId) => {
    if (selectedColumns.includes(colId)) {
      if (selectedColumns.length === 1) return; // Keep at least one column
      setSelectedColumns(prev => prev.filter(c => c !== colId));
    } else {
      setSelectedColumns(prev => [...prev, colId]);
    }
  };

  const selectAllColumns = () => {
    setSelectedColumns(ALL_COLUMNS.map(c => c.id));
  };

  // Limit change
  const handleLimitChange = (newLimit) => {
    setLimit(newLimit);
    setPage(1);
    setShowCustomInput(false);
  };

  const handleApplyCustomLimit = (e) => {
    e.preventDefault();
    const val = parseInt(customLimit, 10);
    if (!isNaN(val) && val > 0 && val <= 500) {
      setLimit(val);
      setPage(1);
      setShowCustomInput(false);
    } else {
      setError('Please enter a limit between 1 and 500.');
    }
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

  // Export handler (Excel or PDF) with Company Header & Filter Metadata
  const handleExport = async (format) => {
    setExporting(true);
    setError('');
    try {
      // Map selected column IDs to proper labels
      const columnLabels = ALL_COLUMNS.filter(c => selectedColumns.includes(c.id)).map(c => {
        if (c.id === 'name') return 'Employee Name';
        if (c.id === 'date') return 'Date';
        if (c.id === 'punch_in') return 'Punch In';
        if (c.id === 'punch_in_gps') return 'GPS Lat/Long (Punch In)';
        if (c.id === 'punch_in_address') return 'Address (Punch In)';
        if (c.id === 'punch_out') return 'Punch Out';
        if (c.id === 'punch_out_gps') return 'GPS Lat/Long (Punch Out)';
        if (c.id === 'punch_out_address') return 'Address (Punch Out)';
        if (c.id === 'working_hours') return 'Working Hours';
        if (c.id === 'status') return 'Status';
        return c.label;
      });

      const exportBody = {
        format,
        selected_columns: columnLabels,
        status: statusFilter,
        search: searchQuery
      };

      if (dateFilterMode === 'day') {
        exportBody.date = filterDay;
      } else if (dateFilterMode === 'month') {
        exportBody.month = filterMonth;
        exportBody.year = filterYear;
      } else if (dateFilterMode === 'custom') {
        exportBody.from_date = fromDate;
        exportBody.to_date = toDate;
      }

      const res = await apiRequest('/attendance/export', {
        method: 'POST',
        body: exportBody
      });

      if (res.isBlob) {
        const url = window.URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${company?.name || 'Company'}_Attendance_Report_${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setSuccess(`Exported attendance report (${format.toUpperCase()}) successfully.`);
      } else if (res.isHtmlReport) {
        const win = window.open('', '_blank');
        win.document.write(res.htmlText);
        win.document.close();
        setSuccess('Opened printable PDF attendance report in new tab.');
      }
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  // Download Attendance Template
  const handleDownloadTemplate = async () => {
    try {
      const res = await apiRequest('/attendance/excel/template');
      if (res.isBlob) {
        const url = window.URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Attendance_Import_Template.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      setError(err.message || 'Failed to download template.');
    }
  };

  // Validate Uploaded Attendance Excel
  const handleValidateUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      setError('Please select an Excel file to validate.');
      return;
    }
    setValidating(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);

      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/attendance/excel/validate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Validation failed');
      setValidationResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setValidating(false);
    }
  };

  // Commit Uploaded Attendance Records
  const handleCommitUpload = async () => {
    if (!validationResult || !validationResult.validRows || validationResult.validRows.length === 0) {
      setError('No valid rows to commit.');
      return;
    }
    setCommitting(true);
    setError('');
    try {
      const res = await apiRequest('/attendance/excel/commit', {
        method: 'POST',
        body: { validRows: validationResult.validRows }
      });
      setSuccess(`Imported/Updated ${res.count || validationResult.validRows.length} attendance records successfully.`);
      setUploadModalOpen(false);
      setUploadFile(null);
      setValidationResult(null);
      fetchAttendance();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Commit failed.');
    } finally {
      setCommitting(false);
    }
  };

  // Open Edit Attendance Modal
  const openEditModal = (rec) => {
    setSelectedRecord(rec);
    setEditForm({
      punch_in_time: rec.punch_in_time || '09:00:00',
      punch_out_time: rec.punch_out_time || '18:00:00',
      status: rec.status || 'Present',
      total_hours: rec.total_hours || '8.0',
      reason: ''
    });
    setEditModalOpen(true);
  };

  // Save Attendance Correction
  const handleSaveCorrection = async (e) => {
    e.preventDefault();
    if (!editForm.reason.trim()) {
      setError('A mandatory audit reason is required for attendance correction.');
      return;
    }
    setEditSubmitting(true);
    setError('');
    try {
      await apiRequest(`/attendance/correct/${selectedRecord.id}`, {
        method: 'PUT',
        body: editForm
      });
      setSuccess(`Attendance for ${selectedRecord.employee_name} corrected successfully.`);
      setEditModalOpen(false);
      fetchAttendance();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to correct attendance.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return (
    <div className="space-y-5">
      {/* Top Banner & Stats Strip */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Daily Attendance Log & GPS Tracking Master
                </h2>
                <p className="text-xs text-slate-500">
                  {company?.name ? `${company.name} • ` : ''}
                  Day-wise punch in/out, coordinates, addresses, working hours, and operational status
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons: Export Excel, Export PDF, Excel Upload, Column Filter */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Filter Headers / Column Picker Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold flex items-center gap-1.5 transition-colors"
                title="Select required columns to view and export"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                <span>Filter Headers ({selectedColumns.length}/{ALL_COLUMNS.length})</span>
              </button>

              {/* Column Picker Dropdown */}
              {showColumnPicker && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-30 space-y-2 animate-fade-in text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-bold text-slate-800">Select Visible Fields</span>
                    <button
                      type="button"
                      onClick={selectAllColumns}
                      className="text-[11px] text-indigo-600 font-semibold hover:underline"
                    >
                      Select All
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {ALL_COLUMNS.map(col => {
                      const checked = selectedColumns.includes(col.id);
                      return (
                        <label
                          key={col.id}
                          className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleColumn(col.id)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-[11px] font-medium">{col.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowColumnPicker(false)}
                    className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors"
                  >
                    Apply Columns
                  </button>
                </div>
              )}
            </div>

            {/* Excel Upload / Update Attendance */}
            <button
              type="button"
              onClick={() => { setUploadModalOpen(true); setValidationResult(null); setUploadFile(null); }}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Attendance</span>
            </button>

            {/* Export Excel */}
            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              disabled={exporting}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-colors"
              title="Download Excel with Company Header"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Excel</span>
            </button>

            {/* Export PDF */}
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={exporting}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-colors"
              title="Download PDF Report with Company Header"
            >
              <FileText className="w-3.5 h-3.5 text-rose-400" />
              <span>PDF</span>
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={() => fetchAttendance()}
              disabled={loading}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
              title="Refresh attendance"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Feedback Messages */}
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

        {/* Summary Metric Strip */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 border-t border-slate-100 text-xs">
          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/60">
            <div className="text-slate-400 text-[11px] font-medium">Total Records</div>
            <div className="text-base font-bold text-slate-800 mt-0.5">{summary.total || totalCount}</div>
          </div>
          <div className="bg-emerald-50/80 rounded-xl p-3 border border-emerald-200/60">
            <div className="text-emerald-700 text-[11px] font-medium">Present</div>
            <div className="text-base font-bold text-emerald-800 mt-0.5">{summary.present || 0}</div>
          </div>
          <div className="bg-rose-50/80 rounded-xl p-3 border border-rose-200/60">
            <div className="text-rose-700 text-[11px] font-medium">Absent</div>
            <div className="text-base font-bold text-rose-800 mt-0.5">{summary.absent || 0}</div>
          </div>
          <div className="bg-amber-50/80 rounded-xl p-3 border border-amber-200/60">
            <div className="text-amber-700 text-[11px] font-medium">Half Day</div>
            <div className="text-base font-bold text-amber-800 mt-0.5">{summary.half_day || 0}</div>
          </div>
          <div className="bg-indigo-50/80 rounded-xl p-3 border border-indigo-200/60">
            <div className="text-indigo-700 text-[11px] font-medium">Leave / Off</div>
            <div className="text-base font-bold text-indigo-800 mt-0.5">{summary.leave || 0}</div>
          </div>
        </div>
      </div>

      {/* Date Filter & Control Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Date Filter Presets (Day / Month / Custom) */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              Filter By Date:
            </span>
            <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
              <button
                type="button"
                onClick={() => { setDateFilterMode('day'); setPage(1); }}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  dateFilterMode === 'day' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Day
              </button>
              <button
                type="button"
                onClick={() => { setDateFilterMode('month'); setPage(1); }}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  dateFilterMode === 'month' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => { setDateFilterMode('custom'); setPage(1); }}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  dateFilterMode === 'custom' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Custom Range
              </button>
            </div>
          </div>

          {/* Page Size Controls: 10 default, 25, 50, custom */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium">Rows:</span>
            <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
              {[10, 25, 50].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => handleLimitChange(sz)}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    limit === sz && !showCustomInput
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {sz}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCustomInput(!showCustomInput)}
                className={`px-2 py-1 rounded-lg transition-colors ${
                  showCustomInput || ![10, 25, 50].includes(limit)
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Custom {![10, 25, 50].includes(limit) ? `(${limit})` : ''}
              </button>
            </div>
          </div>
        </div>

        {/* Custom Limit Input Bar */}
        {showCustomInput && (
          <form onSubmit={handleApplyCustomLimit} className="flex items-center gap-2 p-2 bg-indigo-50/60 rounded-xl border border-indigo-200 text-xs">
            <span className="text-indigo-900 font-medium">Enter custom row limit:</span>
            <input
              type="number"
              min="1"
              max="500"
              value={customLimit}
              onChange={(e) => setCustomLimit(e.target.value)}
              placeholder="e.g. 15, 30, 100"
              className="w-24 px-2 py-1 bg-white border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-xs"
            >
              Apply Limit
            </button>
            <button
              type="button"
              onClick={() => setShowCustomInput(false)}
              className="p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Dynamic Filter Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs pt-1">
          {/* 1. Date Controls based on mode */}
          {dateFilterMode === 'day' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Select Day:</label>
              <input
                type="date"
                value={filterDay}
                onChange={(e) => { setFilterDay(e.target.value); setPage(1); }}
                className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              />
            </div>
          )}

          {dateFilterMode === 'month' && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Month:</label>
                <select
                  value={filterMonth}
                  onChange={(e) => { setFilterMonth(parseInt(e.target.value, 10)); setPage(1); }}
                  className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                >
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, idx) => (
                    <option key={m} value={idx + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Year:</label>
                <select
                  value={filterYear}
                  onChange={(e) => { setFilterYear(parseInt(e.target.value, 10)); setPage(1); }}
                  className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {dateFilterMode === 'custom' && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">From Date:</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                  className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">To Date:</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                  className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                />
              </div>
            </>
          )}

          {/* 2. Status Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Half Day">Half Day</option>
              <option value="Leave">Leave</option>
            </select>
          </div>

          {/* 3. Search Box */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Search Staff:</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name or employee ID..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Day-Wise Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
              <tr>
                {selectedColumns.includes('name') && <th className="p-3">Employee</th>}
                {selectedColumns.includes('date') && <th className="p-3">Date</th>}
                {selectedColumns.includes('punch_in') && <th className="p-3">Punch In</th>}
                {selectedColumns.includes('punch_in_gps') && <th className="p-3">Punch In GPS</th>}
                {selectedColumns.includes('punch_in_address') && <th className="p-3">Punch In Address</th>}
                {selectedColumns.includes('punch_out') && <th className="p-3">Punch Out</th>}
                {selectedColumns.includes('punch_out_gps') && <th className="p-3">Punch Out GPS</th>}
                {selectedColumns.includes('punch_out_address') && <th className="p-3">Punch Out Address</th>}
                {selectedColumns.includes('working_hours') && <th className="p-3">Working Hrs</th>}
                {selectedColumns.includes('status') && <th className="p-3">Status</th>}
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={selectedColumns.length + 1} className="p-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
                    Loading day-wise attendance records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={selectedColumns.length + 1} className="p-12 text-center text-slate-400">
                    <AlertTriangle className="w-6 h-6 mx-auto text-slate-300 mb-2" />
                    No attendance records found matching current filters.
                  </td>
                </tr>
              ) : (
                records.map((rec) => {
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name & Code */}
                      {selectedColumns.includes('name') && (
                        <td className="p-3">
                          <div className="font-bold text-slate-900 leading-snug">{rec.employee_name}</div>
                          <div className="text-[11px] font-mono text-indigo-600">{rec.employee_code}</div>
                          <div className="text-[10px] text-slate-400">{rec.department || 'General'}</div>
                        </td>
                      )}

                      {/* Date */}
                      {selectedColumns.includes('date') && (
                        <td className="p-3 font-semibold text-slate-700 whitespace-nowrap">
                          {rec.date}
                        </td>
                      )}

                      {/* Punch In */}
                      {selectedColumns.includes('punch_in') && (
                        <td className="p-3 font-mono font-bold text-emerald-700 whitespace-nowrap">
                          {formatTime(rec.punch_in_time)}
                        </td>
                      )}

                      {/* Punch In GPS Lat/Long */}
                      {selectedColumns.includes('punch_in_gps') && (
                        <td className="p-3">
                          {rec.punch_in_lat && rec.punch_in_lng ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-mono text-[10px] whitespace-nowrap">
                              <MapPin className="w-2.5 h-2.5 text-emerald-600" />
                              {Number(rec.punch_in_lat).toFixed(4)}, {Number(rec.punch_in_lng).toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-slate-300 italic text-[11px]">—</span>
                          )}
                        </td>
                      )}

                      {/* Punch In Address */}
                      {selectedColumns.includes('punch_in_address') && (
                        <td className="p-3 text-slate-600 max-w-xs truncate" title={rec.punch_in_location || 'Office'}>
                          {rec.punch_in_location || 'Office'}
                        </td>
                      )}

                      {/* Punch Out */}
                      {selectedColumns.includes('punch_out') && (
                        <td className="p-3 font-mono font-bold text-rose-700 whitespace-nowrap">
                          {formatTime(rec.punch_out_time)}
                        </td>
                      )}

                      {/* Punch Out GPS Lat/Long */}
                      {selectedColumns.includes('punch_out_gps') && (
                        <td className="p-3">
                          {rec.punch_out_lat && rec.punch_out_lng ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-mono text-[10px] whitespace-nowrap">
                              <MapPin className="w-2.5 h-2.5 text-rose-600" />
                              {Number(rec.punch_out_lat).toFixed(4)}, {Number(rec.punch_out_lng).toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-slate-300 italic text-[11px]">—</span>
                          )}
                        </td>
                      )}

                      {/* Punch Out Address */}
                      {selectedColumns.includes('punch_out_address') && (
                        <td className="p-3 text-slate-600 max-w-xs truncate" title={rec.punch_out_location || 'Office'}>
                          {rec.punch_out_location || 'Office'}
                        </td>
                      )}

                      {/* Working Hours */}
                      {selectedColumns.includes('working_hours') && (
                        <td className="p-3 font-semibold text-slate-800 whitespace-nowrap">
                          {rec.total_hours ? `${rec.total_hours} hrs` : '0.0 hrs'}
                        </td>
                      )}

                      {/* Status */}
                      {selectedColumns.includes('status') && (
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              rec.status === 'Present'
                                ? 'bg-emerald-100 text-emerald-800'
                                : rec.status === 'Absent'
                                ? 'bg-rose-100 text-rose-800'
                                : rec.status === 'Half Day'
                                ? 'bg-amber-100 text-amber-800'
                                : rec.status === 'Leave'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                      )}

                      {/* Actions */}
                      <td className="p-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditModal(rec)}
                          className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                          title="Manual Attendance Correction"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Correct</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500">
            Showing <span className="font-bold text-slate-800">{records.length > 0 ? (page - 1) * limit + 1 : 0}</span> to{' '}
            <span className="font-bold text-slate-800">{Math.min(page * limit, totalCount)}</span> of{' '}
            <span className="font-bold text-slate-800">{totalCount}</span> records
            {limit !== 10 && <span className="ml-1 text-indigo-600">({limit} per page)</span>}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev</span>
            </button>

            {/* Page number buttons */}
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1))
                .map((p, idx, arr) => (
                  <React.Fragment key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span className="px-1 text-slate-400">...</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setPage(p)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                        page === p
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  </React.Fragment>
                ))}
            </div>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Manual Attendance Correction Modal */}
      {editModalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Attendance Audit Correction</h3>
                  <p className="text-[11px] text-slate-500">
                    {selectedRecord.employee_name} ({selectedRecord.employee_code}) &bull; {selectedRecord.date}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCorrection} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Punch In Time:</label>
                  <input
                    type="text"
                    value={editForm.punch_in_time}
                    onChange={(e) => setEditForm({ ...editForm, punch_in_time: e.target.value })}
                    placeholder="09:00:00"
                    className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Punch Out Time:</label>
                  <input
                    type="text"
                    value={editForm.punch_out_time}
                    onChange={(e) => setEditForm({ ...editForm, punch_out_time: e.target.value })}
                    placeholder="18:00:00"
                    className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status:</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                    <option value="Half Day">Half Day</option>
                    <option value="Leave">Leave</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Total Hours:</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.total_hours}
                    onChange={(e) => setEditForm({ ...editForm, total_hours: e.target.value })}
                    placeholder="8.0"
                    className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mandatory Audit Reason: <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows="2"
                  required
                  value={editForm.reason}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  placeholder="State reason for manual correction..."
                  className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-200 transition-colors flex items-center gap-1"
                >
                  {editSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Save Correction
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel Upload Attendance Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Upload / Update Attendance (Excel)</h3>
                  <p className="text-[11px] text-slate-500">
                    Import or batch update attendance records via Excel template
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Template Download Prompt */}
            <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-emerald-900">Need the official template?</span>
                <p className="text-[11px] text-emerald-700">Download formatted Excel sheet with prefilled employee records</p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold shadow-xs flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Template
              </button>
            </div>

            {/* Upload File Input */}
            <form onSubmit={handleValidateUpload} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Completed Excel File (.xlsx):
                </label>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => {
                    setUploadFile(e.target.files[0] || null);
                    setValidationResult(null);
                  }}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>

              {!validationResult && (
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={validating || !uploadFile}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    {validating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Validating File...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Validate Excel File
                      </>
                    )}
                  </button>
                </div>
              )}
            </form>

            {/* Validation Results Preview */}
            {validationResult && (
              <div className="space-y-3 pt-2 border-t border-slate-100 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center">
                    <div className="text-slate-400 text-[10px]">Total Rows</div>
                    <div className="text-sm font-bold text-slate-800">{validationResult.totalRows}</div>
                  </div>
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                    <div className="text-emerald-700 text-[10px]">Valid Records</div>
                    <div className="text-sm font-bold text-emerald-800">{validationResult.validCount}</div>
                  </div>
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-center">
                    <div className="text-rose-700 text-[10px]">Errors</div>
                    <div className="text-sm font-bold text-rose-800">{validationResult.errorCount}</div>
                  </div>
                </div>

                {validationResult.errorCount > 0 && (
                  <div className="max-h-32 overflow-y-auto p-2 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-700 space-y-1">
                    {validationResult.errors.map((err, i) => (
                      <div key={i}>
                        Row {err.row} ({err.employeeId || 'Unknown'}): {err.errors.join(', ')}
                      </div>
                    ))}
                  </div>
                )}

                {validationResult.validCount > 0 && (
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setValidationResult(null)}
                      className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl font-semibold"
                    >
                      Re-Upload
                    </button>
                    <button
                      type="button"
                      onClick={handleCommitUpload}
                      disabled={committing}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md shadow-emerald-200 flex items-center gap-1.5"
                    >
                      {committing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Importing Records...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Commit {validationResult.validCount} Records to Database
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
