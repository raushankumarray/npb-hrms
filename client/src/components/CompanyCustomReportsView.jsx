import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar, Users, FileSpreadsheet, FileText, Download,
  RefreshCw, Search, Check, CheckSquare, Square, ChevronLeft,
  ChevronRight, Filter, ChevronDown, Building2, UserCheck, X, AlertCircle,
  Clock, MapPin, ShieldCheck, Eye, Sparkles
} from 'lucide-react';
import { apiRequest } from '../api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CompanyCustomReportsView({ user, company = {} }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Filter States
  const [selectedManager, setSelectedManager] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [reportType, setReportType] = useState('daily_logs'); // 'daily_logs' | 'monthly_sheet'
  const [empMode, setEmpMode] = useState('all'); // 'all' | 'custom'
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [showEmpPickerModal, setShowEmpPickerModal] = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  // Rows per page: "10 (default), 50, custom enter"
  const [pageSizeOption, setPageSizeOption] = useState('10'); // '10' | '50' | 'custom'
  const [pageSize, setPageSize] = useState(10);
  const [customPageSizeInput, setCustomPageSizeInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Requirement: "after filter apply can view all data other waise show empty"
  const [hasApplied, setHasApplied] = useState(false);

  // Directory Data
  const [managers, setManagers] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  // Report Data
  const [dailyRecords, setDailyRecords] = useState([]);
  const [dailyTotal, setDailyTotal] = useState(0);

  const [monthlySheetData, setMonthlySheetData] = useState({
    month: currentMonth,
    year: currentYear,
    daysInMonth: 30,
    total: 0,
    totalPages: 1,
    employees: []
  });

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load Managers and Employees for the filters
  useEffect(() => {
    const loadDirectory = async () => {
      setLoadingDirectory(true);
      try {
        const empRes = await apiRequest('/employees?limit=500');
        const emps = empRes.employees || [];
        setAllEmployees(emps);
        // Filter out managers
        const mgrs = emps.filter(e => e.role_name === 'manager' || e.role === 'manager');
        setManagers(mgrs);
      } catch (err) {
        console.error('Failed to load employee directory:', err);
      } finally {
        setLoadingDirectory(false);
      }
    };
    loadDirectory();
  }, []);

  // Filtered employees list based on selected manager (if any) and search
  const availableEmployees = useMemo(() => {
    let list = allEmployees;
    if (selectedManager !== 'all') {
      const mgrIdNum = parseInt(selectedManager, 10);
      list = list.filter(e => e.manager_id === mgrIdNum);
    }
    return list;
  }, [allEmployees, selectedManager]);

  const filteredEmployeesForPicker = useMemo(() => {
    if (!empSearch.trim()) return availableEmployees;
    const q = empSearch.toLowerCase();
    return availableEmployees.filter(e =>
      (e.full_name || '').toLowerCase().includes(q) ||
      (e.employee_id || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q)
    );
  }, [availableEmployees, empSearch]);

  // Handle Employee Picker Toggles
  const toggleEmployee = (id) => {
    setSelectedEmployeeIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllEmployees = () => {
    setSelectedEmployeeIds(availableEmployees.map(e => e.id));
  };

  const clearAllEmployees = () => {
    setSelectedEmployeeIds([]);
  };

  // Determine effective limit for pagination
  const resolvePageSize = () => {
    if (pageSizeOption === 'custom') {
      const parsed = parseInt(customPageSizeInput, 10);
      return (parsed && parsed > 0) ? parsed : 10;
    }
    return parseInt(pageSizeOption, 10) || 10;
  };

  // Fetch Report Data
  const fetchData = async (pageToFetch = 1, overridePageSize = null) => {
    setLoading(true);
    setError('');
    const effectiveLimit = overridePageSize || resolvePageSize();
    const offset = (pageToFetch - 1) * effectiveLimit;

    try {
      if (reportType === 'daily_logs') {
        const params = new URLSearchParams();
        params.append('month', selectedMonth);
        params.append('year', selectedYear);
        params.append('limit', effectiveLimit);
        params.append('offset', offset);

        if (selectedManager !== 'all') {
          params.append('manager_id', selectedManager);
        }
        if (empMode === 'custom' && selectedEmployeeIds.length > 0) {
          params.append('employee_ids', selectedEmployeeIds.join(','));
        }

        const res = await apiRequest(`/reports/data?${params.toString()}`);
        setDailyRecords(res.records || []);
        setDailyTotal(res.total || 0);
        setCurrentPage(pageToFetch);
      } else {
        // Monthly Attendance Report
        const params = new URLSearchParams();
        params.append('month', selectedMonth);
        params.append('year', selectedYear);
        params.append('limit', effectiveLimit);
        params.append('offset', offset);

        if (selectedManager !== 'all') {
          params.append('manager_id', selectedManager);
        }
        if (empMode === 'custom' && selectedEmployeeIds.length > 0) {
          params.append('employee_ids', selectedEmployeeIds.join(','));
        }

        const res = await apiRequest(`/attendance/monthly-sheet?${params.toString()}`);
        setMonthlySheetData({
          month: res.month || selectedMonth,
          year: res.year || selectedYear,
          daysInMonth: res.daysInMonth || 30,
          total: res.total || 0,
          totalPages: Math.ceil((res.total || 0) / effectiveLimit) || 1,
          employees: res.employees || []
        });
        setCurrentPage(pageToFetch);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch report data.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Apply Filter click
  const handleApplyFilters = () => {
    const targetSize = resolvePageSize();
    setPageSize(targetSize);
    setHasApplied(true);
    setCurrentPage(1);
    fetchData(1, targetSize);
  };

  // Page Size selector handler
  const handlePageSizeOptionChange = (newOpt) => {
    setPageSizeOption(newOpt);
    if (newOpt !== 'custom') {
      const sz = parseInt(newOpt, 10);
      setPageSize(sz);
      if (hasApplied) {
        setCurrentPage(1);
        fetchData(1, sz);
      }
    }
  };

  const handleCustomPageSizeSubmit = (e) => {
    e?.preventDefault();
    const parsed = parseInt(customPageSizeInput, 10);
    const sz = (parsed && parsed > 0) ? parsed : 10;
    setPageSize(sz);
    if (hasApplied) {
      setCurrentPage(1);
      fetchData(1, sz);
    }
  };

  // Pagination page change
  const handlePageChange = (newPage) => {
    const totalItems = reportType === 'daily_logs' ? dailyTotal : monthlySheetData.total;
    const maxPages = Math.ceil(totalItems / pageSize) || 1;
    if (newPage < 1 || newPage > maxPages || newPage === currentPage) return;
    setCurrentPage(newPage);
    fetchData(newPage, pageSize);
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = async () => {
    if (!hasApplied) {
      setError('Please apply filters first before exporting.');
      return;
    }
    setExporting(true);
    setError('');
    try {
      if (reportType === 'daily_logs') {
        const payload = {
          format: 'xlsx',
          month: selectedMonth,
          year: selectedYear,
          selected_columns: [
            'Date', 'Employee ID', 'Employee Name',
            'Punch In Time', 'Punch In Lat/Long', 'Punch In Address',
            'Punch Out Time', 'Punch Out Lat/Long', 'Punch Out Address',
            'Status', 'Working Hours'
          ]
        };
        if (selectedManager !== 'all') payload.manager_id = selectedManager;
        if (empMode === 'custom' && selectedEmployeeIds.length > 0) {
          payload.employee_ids = selectedEmployeeIds;
        }

        const res = await apiRequest('/reports/export', {
          method: 'POST',
          body: payload
        });

        if (res.isBlob) {
          const url = window.URL.createObjectURL(res.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Company_Daily_Logs_${selectedYear}_${selectedMonth}_${Date.now()}.xlsx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          setSuccess('Excel report downloaded successfully!');
        }
      } else {
        // Monthly Attendance Sheet Export
        const payload = {
          format: 'xlsx',
          month: selectedMonth,
          year: selectedYear,
          manager_name: selectedManager !== 'all'
            ? (managers.find(m => m.id === parseInt(selectedManager, 10))?.full_name || 'Assigned Manager')
            : 'All Managers'
        };
        if (selectedManager !== 'all') payload.manager_id = selectedManager;
        if (empMode === 'custom' && selectedEmployeeIds.length > 0) {
          payload.employee_ids = selectedEmployeeIds;
        }

        const res = await apiRequest('/attendance/monthly-sheet-export', {
          method: 'POST',
          body: payload
        });

        if (res.isBlob) {
          const url = window.URL.createObjectURL(res.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Monthly_Attendance_Sheet_${selectedYear}_${selectedMonth}_${Date.now()}.xlsx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          setSuccess('Monthly Attendance Sheet Excel downloaded successfully!');
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to download Excel file.');
    } finally {
      setExporting(false);
    }
  };

  // Export to PDF / Print Report
  const handleExportPdf = async () => {
    if (!hasApplied) {
      setError('Please apply filters first before exporting.');
      return;
    }
    setExporting(true);
    setError('');
    try {
      if (reportType === 'daily_logs') {
        const payload = {
          format: 'pdf',
          month: selectedMonth,
          year: selectedYear,
          selected_columns: [
            'Date', 'Employee ID', 'Employee Name',
            'Punch In Time', 'Punch In Lat/Long', 'Punch In Address',
            'Punch Out Time', 'Punch Out Lat/Long', 'Punch Out Address',
            'Status', 'Working Hours'
          ]
        };
        if (selectedManager !== 'all') payload.manager_id = selectedManager;
        if (empMode === 'custom' && selectedEmployeeIds.length > 0) {
          payload.employee_ids = selectedEmployeeIds;
        }

        const res = await apiRequest('/reports/export', {
          method: 'POST',
          body: payload
        });

        if (res.isHtmlReport) {
          const win = window.open('', '_blank');
          if (win) {
            win.document.open();
            win.document.write(res.htmlText);
            win.document.close();
            win.focus();
            setTimeout(() => {
              try { win.print(); } catch (e) { console.error(e); }
            }, 500);
            setSuccess('PDF print report generated successfully!');
          } else {
            setError('Please allow popups to view and print the PDF report.');
          }
        }
      } else {
        // Monthly Attendance Sheet PDF
        const payload = {
          format: 'pdf',
          month: selectedMonth,
          year: selectedYear,
          manager_name: selectedManager !== 'all'
            ? (managers.find(m => m.id === parseInt(selectedManager, 10))?.full_name || 'Assigned Manager')
            : 'All Managers'
        };
        if (selectedManager !== 'all') payload.manager_id = selectedManager;
        if (empMode === 'custom' && selectedEmployeeIds.length > 0) {
          payload.employee_ids = selectedEmployeeIds;
        }

        const res = await apiRequest('/attendance/monthly-sheet-export', {
          method: 'POST',
          body: payload
        });

        if (res.isHtmlReport) {
          const win = window.open('', '_blank');
          if (win) {
            win.document.open();
            win.document.write(res.htmlText);
            win.document.close();
            win.focus();
            setTimeout(() => {
              try { win.print(); } catch (e) { console.error(e); }
            }, 500);
            setSuccess('Monthly Attendance Sheet PDF generated successfully!');
          } else {
            setError('Please allow popups to view and print the PDF report.');
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to generate PDF report.');
    } finally {
      setExporting(false);
    }
  };

  // Helper status badge renderer
  const renderStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('present')) {
      return <span className="px-2 py-0.5 rounded-none text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">Present</span>;
    }
    if (s.includes('half')) {
      return <span className="px-2 py-0.5 rounded-none text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-300">Half Day</span>;
    }
    if (s.includes('leave')) {
      return <span className="px-2 py-0.5 rounded-none text-[10px] font-bold uppercase bg-sky-100 text-sky-800 border border-sky-300">Leave</span>;
    }
    if (s.includes('holiday')) {
      return <span className="px-2 py-0.5 rounded-none text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-300">Holiday</span>;
    }
    if (s.includes('week') || s === 'wo') {
      return <span className="px-2 py-0.5 rounded-none text-[10px] font-bold uppercase bg-slate-100 text-slate-800 border border-slate-300">Weekly Off</span>;
    }
    return <span className="px-2 py-0.5 rounded-none text-[10px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-300">Absent</span>;
  };

  // Calculate pagination variables
  const totalRecordsCount = reportType === 'daily_logs' ? dailyTotal : monthlySheetData.total;
  const totalPagesCount = Math.max(1, Math.ceil(totalRecordsCount / pageSize));
  const startIndex = totalRecordsCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalRecordsCount);

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 border-2 border-rose-300 text-rose-800 text-xs font-semibold rounded-none flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="p-1 hover:bg-rose-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border-2 border-emerald-300 text-emerald-800 text-xs font-semibold rounded-none flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess('')} className="p-1 hover:bg-emerald-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SQUARED SECTION CONTAINER */}
      <div className="border-2 border-slate-300 rounded-none bg-white p-6 shadow-none space-y-6">
        {/* Section Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-slate-900 text-white rounded-none">
                <FileText className="w-5 h-5" />
              </span>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Company Custom Reports & Export Hub
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Filter by Manager, Month & Year, Report Type, and Employee selection. View interactive data and export to Excel or PDF.
            </p>
          </div>

          {/* Quick Action Download Buttons (Enabled when data is applied) */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={!hasApplied || exporting || loading}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-none flex items-center gap-2 shadow-none transition-colors"
              title="Download Report in Microsoft Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{exporting ? 'Exporting...' : 'Download Excel (.xlsx)'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={!hasApplied || exporting || loading}
              className="px-4 py-2 bg-rose-700 hover:bg-rose-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-none flex items-center gap-2 shadow-none transition-colors"
              title="Download / Print Report as PDF"
            >
              <FileText className="w-4 h-4" />
              <span>{exporting ? 'Generating...' : 'Download PDF'}</span>
            </button>
          </div>
        </div>

        {/* PRE-HEADING FILTER BOX (SQUARED) */}
        <div className="p-5 bg-slate-50 border border-slate-200 rounded-none space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-slate-600" />
            <span>Report Configuration & Filters</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* 1. SELECT MANAGER */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-700">Select Manager</label>
              <select
                value={selectedManager}
                onChange={(e) => {
                  setSelectedManager(e.target.value);
                  setSelectedEmployeeIds([]);
                }}
                className="w-full bg-white border border-slate-300 rounded-none px-3 py-2 text-slate-800 font-medium focus:outline-none focus:border-slate-900"
              >
                <option value="all">All Managers</option>
                {managers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.employee_id || 'Manager'})
                  </option>
                ))}
              </select>
            </div>

            {/* 2. MONTH & YEAR CHOOSE */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-700">Month & Year</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                  className="w-full bg-white border border-slate-300 rounded-none px-2 py-2 text-slate-800 font-medium focus:outline-none focus:border-slate-900"
                >
                  {MONTH_NAMES.map((mName, idx) => (
                    <option key={idx + 1} value={idx + 1}>{mName}</option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                  className="w-full bg-white border border-slate-300 rounded-none px-2 py-2 text-slate-800 font-medium focus:outline-none focus:border-slate-900"
                >
                  {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 3. SELECT REPORT TYPE */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-700">Report Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-none px-3 py-2 text-slate-800 font-bold focus:outline-none focus:border-slate-900"
              >
                <option value="daily_logs">Daily Logs (Full Month Detailed Logs)</option>
                <option value="monthly_sheet">Monthly Attendance Report (Grid Sheet)</option>
              </select>
            </div>

            {/* 4. SELECT EMPLOYEE */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-700">Select Employee</label>
              <div className="flex gap-2">
                <select
                  value={empMode}
                  onChange={(e) => {
                    const mode = e.target.value;
                    setEmpMode(mode);
                    if (mode === 'custom') {
                      setShowEmpPickerModal(true);
                    } else {
                      setSelectedEmployeeIds([]);
                    }
                  }}
                  className="w-full bg-white border border-slate-300 rounded-none px-3 py-2 text-slate-800 font-medium focus:outline-none focus:border-slate-900"
                >
                  <option value="all">All Employees ({availableEmployees.length})</option>
                  <option value="custom">
                    Custom Choose {selectedEmployeeIds.length > 0 ? `(${selectedEmployeeIds.length} Selected)` : ''}
                  </option>
                </select>

                {empMode === 'custom' && (
                  <button
                    type="button"
                    onClick={() => setShowEmpPickerModal(true)}
                    className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-none whitespace-nowrap"
                    title="Select Specific Employees"
                  >
                    Edit ({selectedEmployeeIds.length})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* FILTER ACTIONS & APPLY BUTTON */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <div className="text-[11px] text-slate-500 font-medium">
              <span>Selected Scope: </span>
              <strong className="text-slate-800">
                {selectedManager === 'all' ? 'All Managers' : managers.find(m => m.id === parseInt(selectedManager, 10))?.full_name || 'Selected Manager'}
              </strong>
              <span> &bull; </span>
              <strong className="text-slate-800">{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</strong>
              <span> &bull; </span>
              <strong className="text-slate-800">{reportType === 'daily_logs' ? 'Daily Logs' : 'Monthly Grid Sheet'}</strong>
              <span> &bull; </span>
              <strong className="text-slate-800">
                {empMode === 'all' ? `All Employees (${availableEmployees.length})` : `${selectedEmployeeIds.length} Selected`}
              </strong>
            </div>

            <button
              type="button"
              onClick={handleApplyFilters}
              disabled={loading}
              className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-none flex items-center gap-2 shadow-none transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Applying & Fetching...' : 'Apply Filters'}</span>
            </button>
          </div>
        </div>

        {/* EMPTY STATE BEFORE APPLY (Strict Requirement: "after filter apply can view all data other waise show empty") */}
        {!hasApplied && (
          <div className="border-2 border-dashed border-slate-300 rounded-none p-12 text-center bg-slate-50/50 space-y-3">
            <div className="w-12 h-12 mx-auto bg-slate-200 text-slate-600 rounded-none flex items-center justify-center">
              <Filter className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">No Report Data Loaded</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Please select your desired filters above (Manager, Month & Year, Report Type, and Employee selection) and click <strong>"Apply Filters"</strong> to load attendance data. Otherwise data remains empty.
            </p>
          </div>
        )}

        {/* REPORT CONTENT AREA (Visible only when hasApplied === true) */}
        {hasApplied && (
          <div className="space-y-4">
            {/* Subheader Bar with Rows Dropdown & Totals */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-slate-100 border border-slate-200 rounded-none text-xs">
              <div className="flex items-center gap-3">
                <span className="font-bold text-slate-800">
                  {reportType === 'daily_logs'
                    ? `Daily Attendance Logs: ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`
                    : `Monthly Attendance Sheet: ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`}
                </span>
                <span className="bg-slate-200 text-slate-700 px-2 py-0.5 font-bold">
                  {totalRecordsCount} {reportType === 'daily_logs' ? 'Total Log Records' : 'Staff Members'}
                </span>
              </div>

              {/* Rows Per Page Controls: "10 (default), 50, custom enter" */}
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">Rows per page:</span>
                <select
                  value={pageSizeOption}
                  onChange={(e) => handlePageSizeOptionChange(e.target.value)}
                  className="bg-white border border-slate-300 rounded-none px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  <option value="10">10 (Default)</option>
                  <option value="50">50</option>
                  <option value="custom">Custom Enter</option>
                </select>

                {pageSizeOption === 'custom' && (
                  <form onSubmit={handleCustomPageSizeSubmit} className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={customPageSizeInput}
                      onChange={(e) => setCustomPageSizeInput(e.target.value)}
                      placeholder="Rows"
                      className="w-16 bg-white border border-slate-300 rounded-none px-2 py-1 text-xs font-mono font-bold"
                    />
                    <button
                      type="submit"
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-none"
                    >
                      Set
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* TABULAR DISPLAY */}
            {loading ? (
              <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-slate-700" />
                <span>Fetching and rendering report records...</span>
              </div>
            ) : reportType === 'daily_logs' ? (
              /* ======================================================== */
              /* CASE A: DAILY ATTENDANCE LOGS TABLE                     */
              /* ======================================================== */
              <div className="border border-slate-200 rounded-none overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3 whitespace-nowrap">Date</th>
                      <th className="p-3 whitespace-nowrap">Employee ID</th>
                      <th className="p-3 whitespace-nowrap">Employee Name</th>
                      <th className="p-3 whitespace-nowrap">Punch In Time</th>
                      <th className="p-3 whitespace-nowrap">Punch In Lat/Long</th>
                      <th className="p-3 whitespace-nowrap">Punch In Address</th>
                      <th className="p-3 whitespace-nowrap">Punch Out Time</th>
                      <th className="p-3 whitespace-nowrap">Punch Out Lat/Long</th>
                      <th className="p-3 whitespace-nowrap">Punch Out Address</th>
                      <th className="p-3 whitespace-nowrap">Status</th>
                      <th className="p-3 whitespace-nowrap">Working Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dailyRecords.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/75 transition-colors">
                        <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                          {r['Date'] || r.date}
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                          {r['Employee ID'] || r.employee_id}
                        </td>
                        <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                          {r['Employee Name'] || r.full_name}
                        </td>
                        <td className="p-3 font-mono text-slate-800 whitespace-nowrap">
                          {r['Punch In Time'] || r['Punch In'] || '--:--:--'}
                        </td>
                        <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                          {r['Punch In Lat/Long'] || (r['Latitude'] ? `${r['Latitude']}, ${r['Longitude']}` : '--')}
                        </td>
                        <td className="p-3 text-slate-700 max-w-xs truncate" title={r['Punch In Address'] || r['Location Name']}>
                          {r['Punch In Address'] || r['Location Name'] || 'Office Location'}
                        </td>
                        <td className="p-3 font-mono text-slate-800 whitespace-nowrap">
                          {r['Punch Out Time'] || r['Punch Out'] || '--:--:--'}
                        </td>
                        <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                          {r['Punch Out Lat/Long'] || '--'}
                        </td>
                        <td className="p-3 text-slate-700 max-w-xs truncate" title={r['Punch Out Address'] || r['Location Name']}>
                          {r['Punch Out Address'] || r['Location Name'] || 'Office Location'}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {renderStatusBadge(r['Status'] || r['Attendance Status'])}
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                          {typeof r['Working Hours'] === 'number'
                            ? `${Math.floor(r['Working Hours'])}h ${Math.round((r['Working Hours'] % 1) * 60)}m`
                            : r['Working Hours'] || r['Total Working Hours'] || '0.00'}
                        </td>
                      </tr>
                    ))}
                    {dailyRecords.length === 0 && (
                      <tr>
                        <td colSpan="11" className="p-10 text-center text-slate-400 text-xs">
                          No daily logs found matching the selected filters for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* ======================================================== */
              /* CASE B: MONTHLY ATTENDANCE REPORT MATRIX TABLE          */
              /* ======================================================== */
              <div className="border border-slate-200 rounded-none overflow-x-auto">
                <table className="w-full text-xs text-center border-collapse">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5 text-left sticky left-0 bg-slate-100 z-10 border-r border-slate-200 min-w-[170px]">
                        Employee Name
                      </th>
                      {Array.from({ length: monthlySheetData.daysInMonth || 30 }, (_, i) => i + 1).map(day => (
                        <th key={day} className="p-1.5 border-r border-slate-200 min-w-[28px] text-[10px] font-mono">
                          {day}
                        </th>
                      ))}
                      <th className="p-2 border-r border-slate-200 bg-emerald-50 text-emerald-800 font-bold whitespace-nowrap">
                        P
                      </th>
                      <th className="p-2 border-r border-slate-200 bg-rose-50 text-rose-800 font-bold whitespace-nowrap">
                        A
                      </th>
                      <th className="p-2 border-r border-slate-200 bg-sky-50 text-sky-800 font-bold whitespace-nowrap">
                        L
                      </th>
                      <th className="p-2 border-r border-slate-200 bg-purple-50 text-purple-800 font-bold whitespace-nowrap">
                        HO
                      </th>
                      <th className="p-2 border-r border-slate-200 bg-slate-200 text-slate-800 font-bold whitespace-nowrap">
                        WO
                      </th>
                      <th className="p-2 bg-indigo-50 text-indigo-900 font-bold whitespace-nowrap">
                        Total Working Days
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {monthlySheetData.employees.map((emp) => (
                      <tr key={emp.employee_id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="p-2.5 text-left font-bold text-slate-900 sticky left-0 bg-white z-10 border-r border-slate-200 whitespace-nowrap">
                          {emp.employee_name}
                        </td>
                        {Array.from({ length: monthlySheetData.daysInMonth || 30 }, (_, i) => i + 1).map(day => {
                          const status = emp.attendance_by_day?.[day] || 'A';
                          let badgeClass = 'bg-rose-50 text-rose-700 font-bold';
                          if (status === 'P') badgeClass = 'bg-emerald-100 text-emerald-800 font-bold';
                          else if (status === 'HD') badgeClass = 'bg-amber-100 text-amber-800 font-bold';
                          else if (status === 'L') badgeClass = 'bg-sky-100 text-sky-800 font-bold';
                          else if (status === 'HO') badgeClass = 'bg-purple-100 text-purple-800 font-bold';
                          else if (status === 'WO') badgeClass = 'bg-slate-100 text-slate-600 font-semibold';

                          return (
                            <td key={day} className="p-1 border-r border-slate-200 text-[10px]">
                              <span className={`inline-block px-1 py-0.5 rounded-none text-[9px] ${badgeClass}`}>
                                {status}
                              </span>
                            </td>
                          );
                        })}
                        <td className="p-2 border-r border-slate-200 bg-emerald-50/50 font-bold text-emerald-800">
                          {emp.total_present}
                        </td>
                        <td className="p-2 border-r border-slate-200 bg-rose-50/50 font-bold text-rose-800">
                          {emp.total_absent}
                        </td>
                        <td className="p-2 border-r border-slate-200 bg-sky-50/50 font-bold text-sky-800">
                          {emp.total_leave}
                        </td>
                        <td className="p-2 border-r border-slate-200 bg-purple-50/50 font-bold text-purple-800">
                          {emp.total_holiday}
                        </td>
                        <td className="p-2 border-r border-slate-200 bg-slate-100 font-bold text-slate-800">
                          {emp.total_wo}
                        </td>
                        <td className="p-2 bg-indigo-50/60 font-black text-indigo-900">
                          {emp.total_working_days}
                        </td>
                      </tr>
                    ))}
                    {monthlySheetData.employees.length === 0 && (
                      <tr>
                        <td
                          colSpan={(monthlySheetData.daysInMonth || 30) + 7}
                          className="p-10 text-center text-slate-400 text-xs"
                        >
                          No monthly attendance sheet data found for the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* PAGINATION CONTROLS */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
              <div className="text-slate-500">
                Showing <strong className="text-slate-800">{startIndex}</strong> to{' '}
                <strong className="text-slate-800">{endIndex}</strong> of{' '}
                <strong className="text-slate-800">{totalRecordsCount}</strong> records
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || loading}
                  className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-none font-bold flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                {Array.from({ length: totalPagesCount }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPagesCount || Math.abs(p - currentPage) <= 2)
                  .map((p, idx, arr) => (
                    <React.Fragment key={p}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="px-1 text-slate-400">...</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handlePageChange(p)}
                        className={`px-3 py-1.5 rounded-none font-bold transition-colors ${
                          currentPage === p
                            ? 'bg-slate-900 text-white'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  ))}

                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPagesCount || loading}
                  className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-none font-bold flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: CUSTOM EMPLOYEE PICKER (WITH CHECKBOXES & SEARCH) */}
      {showEmpPickerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-none max-w-lg w-full p-6 shadow-2xl border-2 border-slate-400 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-700" />
                  Select Custom Employees
                </h3>
                <p className="text-[11px] text-slate-500">
                  Select one or more employees to filter attendance reports
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEmpPickerModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                placeholder="Search staff by name or employee code..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-none text-xs text-slate-800 focus:outline-none focus:border-slate-900"
              />
            </div>

            {/* Select All / Clear All Quick Buttons */}
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-500 font-semibold">
                {selectedEmployeeIds.length} of {availableEmployees.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllEmployees}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-none"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={clearAllEmployees}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-none"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Scrollable Employee Checkbox List */}
            <div className="flex-1 overflow-y-auto border border-slate-200 divide-y divide-slate-100 rounded-none max-h-72">
              {filteredEmployeesForPicker.map((emp) => {
                const isSelected = selectedEmployeeIds.includes(emp.id);
                return (
                  <label
                    key={emp.id}
                    className="flex items-center gap-3 p-2.5 hover:bg-slate-50 cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleEmployee(emp.id)}
                      className="rounded-none text-slate-900 focus:ring-slate-900 w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-slate-900">{emp.full_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {emp.employee_id} &bull; {emp.department || 'Operations'} &bull; {emp.designation || 'Staff'}
                      </div>
                    </div>
                  </label>
                );
              })}
              {filteredEmployeesForPicker.length === 0 && (
                <div className="p-6 text-center text-slate-400 text-xs">
                  No matching employees found.
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  if (selectedEmployeeIds.length === 0) setEmpMode('all');
                  setShowEmpPickerModal(false);
                }}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-none"
              >
                Done ({selectedEmployeeIds.length} Selected)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
