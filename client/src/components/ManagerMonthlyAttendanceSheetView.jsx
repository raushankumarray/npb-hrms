import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Users, FileSpreadsheet, FileText, Download,
  RefreshCw, Search, Check, CheckSquare, Square, ChevronLeft,
  ChevronRight, Filter, ChevronDown, Building2, UserCheck, X, AlertCircle
} from 'lucide-react';
import { apiRequest } from '../api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function ManagerMonthlyAttendanceSheetView({ user, company = {} }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Filter States (Pre-heading filters)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [empMode, setEmpMode] = useState('all'); // 'all' | 'individual' | 'multiple'
  const [selectedIndividualEmp, setSelectedIndividualEmp] = useState('');
  const [selectedMultipleEmps, setSelectedMultipleEmps] = useState([]);
  const [multiDropdownOpen, setMultiDropdownOpen] = useState(false);
  const [multiSearch, setMultiSearch] = useState('');

  // Rows pagination filter
  const [pageSizeOption, setPageSizeOption] = useState('10'); // '10' | '25' | '50' | 'custom'
  const [pageSize, setPageSize] = useState(10);
  const [customPageSize, setCustomPageSize] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Data States
  const [teamEmployees, setTeamEmployees] = useState([]);
  const [sheetData, setSheetData] = useState({
    month: currentMonth,
    year: currentYear,
    daysInMonth: new Date(currentYear, currentMonth, 0).getDate(),
    total: 0,
    totalPages: 1,
    employees: [],
    company: company
  });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  // Fetch Team Employee Directory for filter dropdown
  const fetchTeamList = async () => {
    try {
      const res = await apiRequest('/employees?limit=250');
      setTeamEmployees(res.employees || []);
    } catch (err) {
      console.error('Failed to load team list for monthly sheet:', err);
    }
  };

  useEffect(() => {
    fetchTeamList();
  }, []);

  // Fetch Monthly Sheet Data
  const fetchMonthlySheet = async (pageToFetch = currentPage, overridePageSize = pageSize) => {
    setLoading(true);
    setError('');
    try {
      const effectivePageSize = overridePageSize || 10;
      const offset = (pageToFetch - 1) * effectivePageSize;

      const params = new URLSearchParams();
      params.append('month', selectedMonth);
      params.append('year', selectedYear);
      params.append('limit', effectivePageSize);
      params.append('offset', offset);

      if (empMode === 'individual' && selectedIndividualEmp) {
        params.append('employee_id', selectedIndividualEmp);
      } else if (empMode === 'multiple' && selectedMultipleEmps.length > 0) {
        params.append('employee_ids', selectedMultipleEmps.join(','));
      }

      const res = await apiRequest(`/attendance/monthly-sheet?${params.toString()}`);
      setSheetData({
        month: res.month,
        year: res.year,
        daysInMonth: res.daysInMonth || 30,
        total: res.total || 0,
        totalPages: Math.ceil((res.total || 0) / effectivePageSize) || 1,
        employees: res.employees || [],
        company: res.company || company
      });
      setCurrentPage(pageToFetch);
    } catch (err) {
      setError(err.message || 'Failed to fetch monthly attendance sheet.');
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchMonthlySheet(1, pageSize);
  }, []);

  // Handle Apply / Refresh Button
  const handleApplyFilters = () => {
    let targetSize = 10;
    if (pageSizeOption === 'custom') {
      const parsed = parseInt(customPageSize, 10);
      targetSize = (parsed && parsed > 0) ? parsed : 10;
      setPageSize(targetSize);
    } else {
      targetSize = parseInt(pageSizeOption, 10) || 10;
      setPageSize(targetSize);
    }
    setCurrentPage(1);
    fetchMonthlySheet(1, targetSize);
  };

  // Handle Page Change
  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > sheetData.totalPages || newPage === currentPage) return;
    setCurrentPage(newPage);
    fetchMonthlySheet(newPage, pageSize);
  };

  // Handle Multiple Employee Toggle
  const toggleEmpSelection = (id) => {
    setSelectedMultipleEmps(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllMultiple = () => {
    setSelectedMultipleEmps(teamEmployees.map(e => e.id));
  };

  const clearAllMultiple = () => {
    setSelectedMultipleEmps([]);
  };

  // Filtered multiple employee list
  const filteredTeamEmployees = useMemo(() => {
    if (!multiSearch.trim()) return teamEmployees;
    const q = multiSearch.toLowerCase();
    return teamEmployees.filter(e =>
      (e.full_name || '').toLowerCase().includes(q) ||
      (e.employee_id || '').toLowerCase().includes(q)
    );
  }, [teamEmployees, multiSearch]);

  // Export to Excel
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const managerName = user.fullName || user.username || 'Manager';
      const payload = {
        format: 'xlsx',
        month: selectedMonth,
        year: selectedYear,
        manager_name: managerName
      };

      if (empMode === 'individual' && selectedIndividualEmp) {
        payload.employee_id = selectedIndividualEmp;
      } else if (empMode === 'multiple' && selectedMultipleEmps.length > 0) {
        payload.employee_ids = selectedMultipleEmps;
      }

      const response = await fetch('/api/attendance/monthly-sheet-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Failed to export Excel.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Monthly_Attendance_${selectedYear}_${selectedMonth}_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Failed to download Excel report.');
    } finally {
      setExporting(false);
    }
  };

  // Export to PDF / Print Report
  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const managerName = user.fullName || user.username || 'Manager';
      const payload = {
        format: 'pdf',
        month: selectedMonth,
        year: selectedYear,
        manager_name: managerName
      };

      if (empMode === 'individual' && selectedIndividualEmp) {
        payload.employee_id = selectedIndividualEmp;
      } else if (empMode === 'multiple' && selectedMultipleEmps.length > 0) {
        payload.employee_ids = selectedMultipleEmps;
      }

      const response = await fetch('/api/attendance/monthly-sheet-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Failed to export PDF.');
      }

      const html = await response.text();
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
      } else {
        alert('Pop-up blocked. Please allow pop-ups to view/print the attendance sheet.');
      }
    } catch (err) {
      alert(err.message || 'Failed to download PDF report.');
    } finally {
      setExporting(false);
    }
  };

  // Day status badge renderer
  const renderDayBadge = (code) => {
    switch (code) {
      case 'P':
        return (
          <span className="inline-block w-6 h-6 leading-6 text-center text-[10px] font-black rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
            P
          </span>
        );
      case 'HD':
        return (
          <span className="inline-block w-6 h-6 leading-6 text-center text-[9px] font-black rounded bg-amber-100 text-amber-800 border border-amber-300">
            HD
          </span>
        );
      case 'A':
        return (
          <span className="inline-block w-6 h-6 leading-6 text-center text-[10px] font-black rounded bg-rose-100 text-rose-800 border border-rose-300">
            A
          </span>
        );
      case 'L':
        return (
          <span className="inline-block w-6 h-6 leading-6 text-center text-[10px] font-black rounded bg-purple-100 text-purple-800 border border-purple-300">
            L
          </span>
        );
      case 'HO':
        return (
          <span className="inline-block w-6 h-6 leading-6 text-center text-[9px] font-black rounded bg-orange-100 text-orange-800 border border-orange-300">
            HO
          </span>
        );
      case 'WO':
        return (
          <span className="inline-block w-6 h-6 leading-6 text-center text-[9px] font-black rounded bg-slate-100 text-slate-700 border border-slate-300">
            WO
          </span>
        );
      default:
        return (
          <span className="inline-block w-6 h-6 leading-6 text-center text-[10px] font-medium text-slate-300">
            --
          </span>
        );
    }
  };

  // Days array for current month
  const daysList = useMemo(() => {
    const arr = [];
    for (let d = 1; d <= sheetData.daysInMonth; d++) {
      arr.push(d);
    }
    return arr;
  }, [sheetData.daysInMonth]);

  const displayCompanyName = sheetData.company?.name || company?.name || 'NPB HRMS Attendance Management';
  const displayCompanyLogo = sheetData.company?.logo || company?.logo;
  const displayMonthYear = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;
  const displayManagerName = user.fullName || user.username || 'Authorized Manager';

  return (
    <div className="border-2 border-slate-300 bg-white rounded-none shadow-none p-5 space-y-5">
      {/* ========================================================================= */}
      {/* 1. FILTER SECTION (PLACED BEFORE HEADING PER USER SPECIFICATION)           */}
      {/* ========================================================================= */}
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-none space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5 text-sky-600" />
          <span>Report Configuration &amp; Filter Options</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          {/* Filter 1: Select Month & Year */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 block">
              Select Month &amp; Year
            </label>
            <div className="flex gap-1.5">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 text-xs font-semibold text-slate-800 rounded-none focus:ring-1 focus:ring-sky-500 focus:outline-none"
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="w-24 px-2 py-1.5 bg-white border border-slate-300 text-xs font-semibold text-slate-800 rounded-none focus:ring-1 focus:ring-sky-500 focus:outline-none"
              >
                {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filter 2: Select Employee (All, Individual, Multiple) */}
          <div className="space-y-1 relative">
            <label className="text-[11px] font-bold text-slate-600 block">
              Select Employee
            </label>
            <div className="flex gap-1">
              <select
                value={empMode}
                onChange={(e) => {
                  setEmpMode(e.target.value);
                  if (e.target.value !== 'multiple') setMultiDropdownOpen(false);
                }}
                className="w-28 px-2 py-1.5 bg-white border border-slate-300 text-xs font-semibold text-slate-800 rounded-none focus:ring-1 focus:ring-sky-500 focus:outline-none"
              >
                <option value="all">All Employees</option>
                <option value="individual">Individual</option>
                <option value="multiple">Multiple (Tick)</option>
              </select>

              {empMode === 'individual' && (
                <select
                  value={selectedIndividualEmp}
                  onChange={(e) => setSelectedIndividualEmp(e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-white border border-slate-300 text-xs font-medium text-slate-800 rounded-none focus:ring-1 focus:ring-sky-500 focus:outline-none"
                >
                  <option value="">-- Choose Employee --</option>
                  {teamEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.employee_id || `EMP${emp.id}`})
                    </option>
                  ))}
                </select>
              )}

              {empMode === 'multiple' && (
                <button
                  type="button"
                  onClick={() => setMultiDropdownOpen(prev => !prev)}
                  className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 text-xs font-semibold text-slate-800 rounded-none flex items-center justify-between gap-1 hover:bg-slate-50"
                >
                  <span className="truncate">
                    {selectedMultipleEmps.length === 0
                      ? 'Select Personnel...'
                      : `${selectedMultipleEmps.length} Selected`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              )}
            </div>

            {/* Multiple Employee Checklist Dropdown */}
            {empMode === 'multiple' && multiDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-300 shadow-lg z-50 p-2 space-y-2 rounded-none">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                  <input
                    type="text"
                    value={multiSearch}
                    onChange={(e) => setMultiSearch(e.target.value)}
                    placeholder="Search employee..."
                    className="w-full pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-none focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-bold border-b border-slate-100 pb-1">
                  <button
                    type="button"
                    onClick={selectAllMultiple}
                    className="text-sky-600 hover:underline"
                  >
                    Select All ({teamEmployees.length})
                  </button>
                  <button
                    type="button"
                    onClick={clearAllMultiple}
                    className="text-rose-600 hover:underline"
                  >
                    Clear All
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {filteredTeamEmployees.map(emp => {
                    const isChecked = selectedMultipleEmps.includes(emp.id);
                    return (
                      <label
                        key={emp.id}
                        className="flex items-center gap-2 p-1.5 hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleEmpSelection(emp.id)}
                          className="rounded-none text-sky-600 focus:ring-0"
                        />
                        <span className="font-medium text-slate-800">
                          {emp.full_name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({emp.employee_id || `EMP${emp.id}`})
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="pt-1 border-t border-slate-100 text-right">
                  <button
                    type="button"
                    onClick={() => setMultiDropdownOpen(false)}
                    className="px-2.5 py-1 bg-sky-600 text-white text-xs font-bold rounded-none"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Filter 3: Rows Dropmenu (10 defaults, 25, 50, custom enter) */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 block">
              Rows Per Page
            </label>
            <div className="flex gap-1.5">
              <select
                value={pageSizeOption}
                onChange={(e) => setPageSizeOption(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 text-xs font-semibold text-slate-800 rounded-none focus:ring-1 focus:ring-sky-500 focus:outline-none"
              >
                <option value="10">10 (Default)</option>
                <option value="25">25 Rows</option>
                <option value="50">50 Rows</option>
                <option value="custom">Custom Enter</option>
              </select>

              {pageSizeOption === 'custom' && (
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={customPageSize}
                  onChange={(e) => setCustomPageSize(e.target.value)}
                  placeholder="e.g. 15"
                  className="w-24 px-2 py-1.5 bg-white border border-slate-300 text-xs font-semibold text-slate-800 rounded-none focus:ring-1 focus:ring-sky-500 focus:outline-none"
                />
              )}
            </div>
          </div>

          {/* Filter 4: Apply / Refresh Button */}
          <div>
            <button
              type="button"
              onClick={handleApplyFilters}
              disabled={loading}
              className="w-full px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-none flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Apply / Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-none text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. HEADER SECTION (COMPANY WITH LOGO, MONTH/YEAR, DOWNLOADED BY MANAGER) */}
      {/* ========================================================================= */}
      <div className="border-b-2 border-slate-200 pb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Left: Company Name & Logo */}
        <div className="flex items-center gap-3">
          {displayCompanyLogo ? (
            <img
              src={displayCompanyLogo}
              alt={displayCompanyName}
              className="h-12 max-w-[150px] object-contain border border-slate-200 p-1 bg-white"
            />
          ) : (
            <div className="h-12 w-12 bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 font-black text-xl">
              {displayCompanyName.charAt(0) || 'C'}
            </div>
          )}
          <div>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
              {displayCompanyName}
            </h2>
            <div className="flex items-center gap-2 text-xs font-bold text-sky-700 mt-0.5">
              <span>Attendance Reports Monthly</span>
              <span>&bull;</span>
              <span className="text-slate-700">{displayMonthYear}</span>
            </div>
          </div>
        </div>

        {/* Right: Downloaded by Manager Info & Export Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 self-stretch md:self-auto">
          <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 text-right text-xs">
            <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-wider">
              Downloaded by
            </span>
            <span className="font-bold text-slate-900">
              {displayManagerName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Download Excel */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting || loading || sheetData.employees.length === 0}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-none flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Download full monthly attendance matrix in Excel (.xlsx) format"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Download Excel</span>
            </button>

            {/* Download PDF */}
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exporting || loading || sheetData.employees.length === 0}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-none flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Open and print / save as PDF with company logo & manager header"
            >
              <FileText className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. ATTENDANCE SHEET TABLE (MATRIX 1..DAYS, SUMMARY, TOTAL WORKING DAYS)    */}
      {/* ========================================================================= */}
      <div className="overflow-x-auto border border-slate-300">
        <table className="w-full text-xs text-left border-collapse min-w-[1100px]">
          {/* Header Row */}
          <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
            <tr>
              <th className="p-2.5 border-r border-slate-300 min-w-[150px] sticky left-0 bg-slate-100 z-10">
                Employee Name
              </th>
              <th className="p-2.5 border-r border-slate-300 text-center min-w-[90px]">
                Emp ID
              </th>

              {/* Day Columns 1..daysInMonth */}
              {daysList.map(d => (
                <th
                  key={d}
                  className="p-1 border-r border-slate-200 text-center min-w-[28px] text-[11px]"
                >
                  {d}
                </th>
              ))}

              {/* Summary Columns */}
              <th className="p-2 border-r border-slate-300 text-center min-w-[65px] bg-emerald-50 text-emerald-900 font-black">
                Total Present Day
              </th>
              <th className="p-2 border-r border-slate-300 text-center min-w-[65px] bg-rose-50 text-rose-900 font-black">
                Absent Day
              </th>
              <th className="p-2 border-r border-slate-300 text-center min-w-[55px] bg-purple-50 text-purple-900 font-black">
                Leave
              </th>
              <th className="p-2 border-r border-slate-300 text-center min-w-[45px] bg-orange-50 text-orange-900 font-black">
                HO
              </th>
              <th className="p-2 border-r border-slate-300 text-center min-w-[45px] bg-slate-200 text-slate-900 font-black">
                WO
              </th>
              <th className="p-2 text-center min-w-[85px] bg-emerald-100 text-emerald-950 font-black border-l-2 border-emerald-400">
                Total Working Days
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 bg-white">
            {loading ? (
              <tr>
                <td
                  colSpan={daysList.length + 8}
                  className="p-8 text-center text-slate-500 font-medium"
                >
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-sky-600 mb-2" />
                  Loading monthly attendance records...
                </td>
              </tr>
            ) : sheetData.employees.length === 0 ? (
              <tr>
                <td
                  colSpan={daysList.length + 8}
                  className="p-8 text-center text-slate-400 font-medium"
                >
                  No team employee attendance logs found for {displayMonthYear}.
                </td>
              </tr>
            ) : (
              sheetData.employees.map((emp, idx) => (
                <tr
                  key={emp.id}
                  className={idx % 2 === 0 ? 'bg-white hover:bg-sky-50/40' : 'bg-slate-50/50 hover:bg-sky-50/40'}
                >
                  {/* Employee Name */}
                  <td className="p-2.5 font-bold text-slate-900 border-r border-slate-300 sticky left-0 bg-inherit z-10 whitespace-nowrap">
                    <div>{emp.full_name}</div>
                    <div className="text-[10px] text-slate-400 font-normal">{emp.department}</div>
                  </td>

                  {/* Emp ID */}
                  <td className="p-2 font-mono text-center text-slate-700 border-r border-slate-300">
                    {emp.employee_id}
                  </td>

                  {/* Daily Badges 1..daysInMonth */}
                  {daysList.map(d => (
                    <td
                      key={d}
                      className="p-1 border-r border-slate-200 text-center"
                    >
                      {renderDayBadge(emp.dailyStatus[d])}
                    </td>
                  ))}

                  {/* Total Present Day */}
                  <td className="p-2 font-black text-center text-emerald-700 bg-emerald-50/60 border-r border-slate-300">
                    {emp.summary.present}
                  </td>

                  {/* Absent Day */}
                  <td className="p-2 font-black text-center text-rose-700 bg-rose-50/60 border-r border-slate-300">
                    {emp.summary.absent}
                  </td>

                  {/* Leave */}
                  <td className="p-2 font-black text-center text-purple-700 bg-purple-50/60 border-r border-slate-300">
                    {emp.summary.leave}
                  </td>

                  {/* HO */}
                  <td className="p-2 font-black text-center text-orange-700 bg-orange-50/60 border-r border-slate-300">
                    {emp.summary.ho}
                  </td>

                  {/* WO */}
                  <td className="p-2 font-black text-center text-slate-700 bg-slate-100 border-r border-slate-300">
                    {emp.summary.wo}
                  </td>

                  {/* Total Working Days: P + L + ho + wo + half day (2 half days = 1 day count) */}
                  <td className="p-2 font-black text-center text-emerald-900 bg-emerald-100/80 border-l-2 border-emerald-400 text-sm">
                    {emp.summary.total_working_days}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ========================================================================= */}
      {/* 4. FOOTER / LEGEND & DYNAMIC PAGINATION (PAGE 1, 2... WHEN > 10 ROWS)     */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-2">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-700">
          <span className="text-slate-400 font-bold uppercase text-[10px]">Legend:</span>
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 leading-5 text-center text-[9px] font-black rounded bg-emerald-100 text-emerald-800 border border-emerald-300">P</span>
            <span>Present</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 leading-5 text-center text-[8px] font-black rounded bg-amber-100 text-amber-800 border border-amber-300">HD</span>
            <span>Half Day (0.5)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 leading-5 text-center text-[9px] font-black rounded bg-rose-100 text-rose-800 border border-rose-300">A</span>
            <span>Absent</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 leading-5 text-center text-[9px] font-black rounded bg-purple-100 text-purple-800 border border-purple-300">L</span>
            <span>Leave</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 leading-5 text-center text-[8px] font-black rounded bg-orange-100 text-orange-800 border border-orange-300">HO</span>
            <span>Holiday</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 leading-5 text-center text-[8px] font-black rounded bg-slate-100 text-slate-700 border border-slate-300">WO</span>
            <span>Weekly Off</span>
          </span>
          <span className="text-[10px] text-slate-500 italic ml-2">
            Formula: Total Working Days = P + L + HO + WO + (HD &times; 0.5) [2 Half Days = 1 Day]
          </span>
        </div>

        {/* Dynamic Pagination */}
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="text-slate-500">
            Showing {sheetData.employees.length} of {sheetData.total} Staff
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              className="px-2 py-1 border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-none"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {Array.from({ length: sheetData.totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => handlePageChange(p)}
                disabled={loading}
                className={`px-2.5 py-1 text-xs font-bold rounded-none border ${
                  currentPage === p
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {p}
              </button>
            ))}

            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= sheetData.totalPages || loading}
              className="px-2 py-1 border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-none"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
