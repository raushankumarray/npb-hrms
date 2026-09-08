import React, { useState, useEffect } from 'react';
import {
  Users, UserPlus, FileSpreadsheet, Clock, Calendar, Download,
  Upload, Search, Edit3, Trash2, CheckCircle, AlertTriangle, RefreshCw,
  Eye, Check, X, FileText, MapPin, Ticket, Sparkles, LifeBuoy, MessageSquare,
  Key, Ban, Filter, ChevronLeft, ChevronRight, SlidersHorizontal, ShieldCheck, CheckCircle2, GitMerge, Shield, Compass
} from 'lucide-react';
import { apiRequest } from '../api';
import ExcelImportModal from '../components/ExcelImportModal';
import CustomExportModal from '../components/CustomExportModal';
import UnifiedCalendar from '../components/UnifiedCalendar';
import LiveTrackingMap from '../components/LiveTrackingMap';
import TicketChatModal from '../components/TicketChatModal';
import EmployeeChangePasswordModal from '../components/EmployeeChangePasswordModal';
import EmployeeMappingView from '../components/EmployeeMappingView';
import AttendanceManagementView from '../components/AttendanceManagementView';
import AttendanceCorrectionReviewView from '../components/AttendanceCorrectionReviewView';
import ShiftManagementView from '../components/ShiftManagementView';
import HolidaysWeeklyOffView from '../components/HolidaysWeeklyOffView';

export default function HRPanel({ user, company, activeTab }) {
  const [employees, setEmployees] = useState([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [attendance, setAttendance] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Ticket Chat State
  const [chatTicketId, setChatTicketId] = useState(null);
  const [showChatModal, setShowChatModal] = useState(false);

  // Pagination & Filtering state
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [customPageSize, setCustomPageSize] = useState('');
  const [isCustomPageSize, setIsCustomPageSize] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [availableCities, setAvailableCities] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedEmployeeForPassword, setSelectedEmployeeForPassword] = useState(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [excelModalMode, setExcelModalMode] = useState('import');
  const [showExportModal, setShowExportModal] = useState(false);
  const [editAttendanceModal, setEditAttendanceModal] = useState(false);
  const [selectedAtt, setSelectedAtt] = useState(null);
  const [attEditForm, setAttEditForm] = useState({
    punch_in_time: '',
    punch_out_time: '',
    status: 'Present',
    reason: ''
  });

  // Edit Employee State
  const [showEditEmpModal, setShowEditEmpModal] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState(null);
  const [editEmpForm, setEditEmpForm] = useState({
    employee_id: '',
    full_name: '',
    email: '',
    mobile: '',
    department: '',
    designation: '',
    city: '',
    role: 'employee',
    manager_id: '',
    hr_id: '',
    reports_to_manager: false,
    reports_to_hr: false,
    reports_to_admin: false,
    shift_id: '',
    geofence_id: '',
    status: 'active',
    password: ''
  });

  // Helpdesk & Tickets State
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketResolutionNotes, setTicketResolutionNotes] = useState('');
  const [showSolveTicketModal, setShowSolveTicketModal] = useState(false);
  const [ticketStatusFilter, setTicketStatusFilter] = useState('all');

  // Leave Accrual & Manual Credit State
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveAccruals, setLeaveAccruals] = useState([]);
  const [showManualLeaveModal, setShowManualLeaveModal] = useState(false);
  const [manualLeaveForm, setManualLeaveForm] = useState({
    employee_id: '',
    leave_type_id: '',
    days: 1.25,
    reason: 'Monthly Earned Leave credit',
    apply_to_all: true
  });

  // New Employee Form
  const [newEmp, setNewEmp] = useState({
    employee_id: '',
    full_name: '',
    username: '',
    password: 'User@12345',
    email: '',
    mobile: '',
    department: 'Operations',
    designation: 'Staff',
    city: '',
    shift_id: '',
    geofence_id: '',
    manager_id: '',
    hr_id: '',
    reports_to_manager: false,
    reports_to_hr: false,
    reports_to_admin: false,
    role: 'employee'
  });

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'employees' || activeTab === 'dashboard') {
        const queryParams = new URLSearchParams();
        queryParams.append('limit', pageSize);
        queryParams.append('offset', (page - 1) * pageSize);
        if (roleFilter !== 'all') queryParams.append('role', roleFilter);
        if (statusFilter !== 'all') queryParams.append('status', statusFilter);
        if (cityFilter !== 'all') queryParams.append('city', cityFilter);
        if (searchQuery.trim()) queryParams.append('search', searchQuery.trim());

        const res = await apiRequest(`/employees?${queryParams.toString()}`);
        setEmployees(res.employees || []);
        setTotalEmployees(res.total !== undefined ? res.total : (res.employees || []).length);
        if (res.cities) setAvailableCities(res.cities);
      }
      if (activeTab === 'attendance' || activeTab === 'dashboard') {
        const attRes = await apiRequest(`/attendance/list?limit=50&search=${encodeURIComponent(searchQuery)}`);
        setAttendance(attRes.records || []);
      }
      if (activeTab === 'leave' || activeTab === 'dashboard') {
        const leaveRes = await apiRequest('/leave/requests');
        setLeaveRequests(leaveRes.requests || []);
        const ltRes = await apiRequest('/leave/types');
        setLeaveTypes(ltRes.leaveTypes || []);
        const histRes = await apiRequest('/leave/accrual/history');
        setLeaveAccruals(histRes.logs || []);
      }
      if (activeTab === 'tickets') {
        const tickRes = await apiRequest('/tickets/service-requests?view=all');
        setTickets(tickRes.requests || []);
      }
      const shiftRes = await apiRequest('/shifts');
      setShifts(shiftRes.shifts || []);
      const gfRes = await apiRequest('/geofences');
      setGeofences(gfRes.geofences || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handleMasterRefresh = () => {
      fetchData();
    };
    window.addEventListener('master-refresh', handleMasterRefresh);
    return () => window.removeEventListener('master-refresh', handleMasterRefresh);
  }, [activeTab, page, pageSize, roleFilter, statusFilter, cityFilter, searchQuery]);

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newEmp,
        manager_id: newEmp.reports_to_manager ? newEmp.manager_id : null,
        hr_id: newEmp.reports_to_hr ? newEmp.hr_id : null,
        reports_to_admin: newEmp.role === 'hr' ? 1 : (newEmp.reports_to_admin ? 1 : 0),
        geofence_mode: (newEmp.role === 'manager' || newEmp.role === 'hr')
          ? (newEmp.geofence_id ? 'custom' : 'none')
          : (newEmp.geofence_id ? 'custom' : 'company')
      };

      const res = await apiRequest('/employees', {
        method: 'POST',
        body: payload
      });
      setSuccess(`Employee "${newEmp.full_name}" added successfully${res.employeeCode ? ` (Code: ${res.employeeCode})` : ' (No ID assigned - can update later)'}.`);
      setShowAddModal(false);
      setNewEmp({
        employee_id: '', full_name: '', username: '', password: 'User@12345',
        email: '', mobile: '', department: 'Operations', designation: 'Staff',
        city: '', shift_id: '', geofence_id: '', manager_id: '', hr_id: '',
        reports_to_manager: false, reports_to_hr: false, reports_to_admin: false,
        role: 'employee'
      });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openEditEmployee = (emp) => {
    setEditingEmpId(emp.id);
    const role = emp.role_name || 'employee';
    setEditEmpForm({
      employee_id: emp.employee_id || '',
      full_name: emp.full_name || '',
      email: emp.email || '',
      mobile: emp.mobile || '',
      department: emp.department || 'Operations',
      designation: emp.designation || 'Staff',
      city: emp.city || '',
      role: role,
      manager_id: emp.manager_id ? String(emp.manager_id) : '',
      hr_id: emp.hr_id ? String(emp.hr_id) : '',
      reports_to_manager: !!emp.manager_id,
      reports_to_hr: !!emp.hr_id,
      reports_to_admin: role === 'hr' ? true : !!emp.reports_to_admin,
      shift_id: emp.shift_id ? String(emp.shift_id) : '',
      geofence_id: emp.geofence_id ? String(emp.geofence_id) : '',
      status: emp.status || 'active',
      password: ''
    });
    setShowEditEmpModal(true);
  };

  const handleSaveEditEmployee = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...editEmpForm,
        manager_id: editEmpForm.reports_to_manager ? editEmpForm.manager_id : null,
        hr_id: editEmpForm.reports_to_hr ? editEmpForm.hr_id : null,
        reports_to_admin: editEmpForm.role === 'hr' ? 1 : (editEmpForm.reports_to_admin ? 1 : 0),
        geofence_mode: (editEmpForm.role === 'manager' || editEmpForm.role === 'hr')
          ? (editEmpForm.geofence_id ? 'custom' : 'none')
          : (editEmpForm.geofence_id ? 'custom' : 'company')
      };

      await apiRequest(`/employees/${editingEmpId}`, {
        method: 'PUT',
        body: payload
      });
      setSuccess(`Employee "${editEmpForm.full_name}" updated successfully.`);
      setShowEditEmpModal(false);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (emp) => {
    try {
      const nextStatus = emp.status === 'active' ? 'suspended' : 'active';
      const res = await apiRequest(`/employees/${emp.id}/toggle-status`, {
        method: 'POST',
        body: { status: nextStatus }
      });
      setSuccess(res.message);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResolveTicket = async (status = 'resolved') => {
    if (!selectedTicket) return;
    try {
      await apiRequest(`/tickets/service-requests/${selectedTicket.id}/resolve`, {
        method: 'PUT',
        body: {
          status,
          resolution_notes: ticketResolutionNotes.trim()
        }
      });
      setSuccess(`Ticket #${selectedTicket.id} marked as ${status}.`);
      setShowSolveTicketModal(false);
      setTicketResolutionNotes('');
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRunMonthlyAccrual = async () => {
    setError('');
    try {
      const res = await apiRequest('/leave/accrual/monthly', {
        method: 'POST',
        body: { force: true }
      });
      setSuccess(res.message);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleManualLeaveCredit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiRequest('/leave/manual-credit', {
        method: 'POST',
        body: manualLeaveForm
      });
      setSuccess(res.message);
      setShowManualLeaveModal(false);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLeaveDecision = async (id, status) => {
    try {
      await apiRequest(`/leave/requests/${id}`, {
        method: 'PUT',
        body: { status }
      });
      setSuccess(`Leave request marked as ${status}.`);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveAttendanceCorrection = async (e) => {
    e.preventDefault();
    if (!attEditForm.reason.trim()) {
      setError('Audit reason is required.');
      return;
    }

    try {
      await apiRequest(`/attendance/correct/${selectedAtt.id}`, {
        method: 'PUT',
        body: attEditForm
      });
      setSuccess('Attendance corrected with audit trail.');
      setEditAttendanceModal(false);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteEmployee = async (id, name) => {
    if (!window.confirm(`Soft delete employee "${name}"? Historical attendance will be retained.`)) return;
    try {
      await apiRequest(`/employees/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {activeTab === 'dashboard'
              ? `Welcome, ${user.fullName || user.username} (HR)`
              : 'HR Management Desk'}
          </h2>
          <p className="text-xs text-slate-500">{company?.name} • Master employee records, attendance sheets, and leaves</p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'employees' && (
            <>
              <button
                onClick={() => { setExcelModalMode('import'); setShowExcelModal(true); }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel Import / Update
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add Employee
              </button>
            </>
          )}

          {(activeTab === 'attendance' || activeTab === 'reports') && (
            <button
              onClick={() => setShowExportModal(true)}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Custom Column Export (Excel/PDF)
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      {/* SEARCH FOR ATTENDANCE TAB */}
      {activeTab === 'attendance' && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search attendance by employee name, code..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>
      )}

      {/* TAB: EMPLOYEES MASTER */}
      {(activeTab === 'employees' || activeTab === 'dashboard') && (
        <div className="space-y-4">
          {/* Advanced Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Role Position Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500 uppercase mr-1 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400" /> Position:
                </span>
                <button
                  type="button"
                  onClick={() => { setRoleFilter('all'); setPage(1); }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    roleFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({totalEmployees})
                </button>
                <button
                  type="button"
                  onClick={() => { setRoleFilter('employee'); setPage(1); }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    roleFilter === 'employee' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Employees
                </button>
                <button
                  type="button"
                  onClick={() => { setRoleFilter('manager'); setPage(1); }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    roleFilter === 'manager' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Managers
                </button>
                <button
                  type="button"
                  onClick={() => { setRoleFilter('hr'); setPage(1); }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    roleFilter === 'hr' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  HR Leads
                </button>
              </div>

              <div className="text-xs text-slate-400">
                Total matching: <span className="font-bold text-slate-700">{totalEmployees}</span> records
              </div>
            </div>

            {/* Dropdown Filters & Search */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  placeholder="Search name, ID, mobile..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 text-slate-800"
                />
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Accounts</option>
                  <option value="suspended">Suspended Accounts</option>
                </select>
              </div>

              {/* City Filter */}
              <div>
                <select
                  value={cityFilter}
                  onChange={(e) => { setCityFilter(e.target.value); setPage(1); }}
                  className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">All Cities</option>
                  {availableCities.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Page Size Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 whitespace-nowrap">Show:</span>
                {[10, 25, 50].map(sz => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => { setPageSize(sz); setIsCustomPageSize(false); setPage(1); }}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                      pageSize === sz && !isCustomPageSize
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
                {!isCustomPageSize ? (
                  <button
                    type="button"
                    onClick={() => setIsCustomPageSize(true)}
                    className="px-2 py-1 rounded-lg text-slate-600 hover:bg-slate-100 border border-slate-200 text-[11px] font-semibold"
                  >
                    Custom
                  </button>
                ) : (
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={customPageSize}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setCustomPageSize(e.target.value);
                      if (val > 0) { setPageSize(val); setPage(1); }
                    }}
                    placeholder="Qty"
                    className="w-14 py-1 px-2 text-center bg-white border border-sky-400 rounded-lg text-xs font-bold text-sky-700 focus:outline-none"
                    autoFocus
                  />
                )}
              </div>
            </div>
          </div>

          {/* Personnel Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Staff Member</th>
                    <th className="p-3">ID / Code</th>
                    <th className="p-3">Assigned Role</th>
                    <th className="p-3">Department & Title</th>
                    <th className="p-3">City</th>
                    <th className="p-3">Reporting Hierarchy</th>
                    <th className="p-3">Assigned Geofence</th>
                    <th className="p-3">Shift</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Row Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50/50">
                      <td className="p-3">
                        <p className="font-bold text-slate-900">{e.full_name}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{e.username} • {e.mobile || 'No mobile'}</p>
                      </td>
                      <td className="p-3 font-mono font-bold text-sky-600">{e.employee_id}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          e.role_name === 'hr' ? 'bg-emerald-100 text-emerald-800' :
                          e.role_name === 'manager' ? 'bg-purple-100 text-purple-800' :
                          'bg-sky-100 text-sky-800'
                        }`}>
                          {e.role_name || 'Employee'}
                        </span>
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-slate-800">{e.department}</p>
                        <p className="text-[11px] text-slate-500">{e.designation}</p>
                      </td>
                      <td className="p-3">
                        <span className="text-slate-700 font-medium">
                          {e.city || <span className="text-slate-400 italic">Not set</span>}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-1 max-w-xs">
                          {e.manager_name && (
                            <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-semibold flex items-center gap-1 shadow-xs" title={`Reports to Manager: ${e.manager_name} (${e.manager_code || ''})`}>
                              <Users className="w-2.5 h-2.5 shrink-0 text-purple-600" />
                              <span className="truncate max-w-[100px]">Mgr: {e.manager_name}</span>
                            </span>
                          )}
                          {e.hr_name && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold flex items-center gap-1 shadow-xs" title={`Reports to HR: ${e.hr_name} (${e.hr_code || ''})`}>
                              <Shield className="w-2.5 h-2.5 shrink-0 text-emerald-600" />
                              <span className="truncate max-w-[100px]">HR: {e.hr_name}</span>
                            </span>
                          )}
                          {(e.reports_to_admin || e.role_name === 'hr') && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold flex items-center gap-1 shadow-xs" title="Reports directly to Company Administrator">
                              <Shield className="w-2.5 h-2.5 shrink-0 text-amber-600" />
                              <span>Direct Admin</span>
                            </span>
                          )}
                          {!e.manager_name && !e.hr_name && !e.reports_to_admin && e.role_name !== 'hr' && (
                            <span className="text-slate-400 italic text-[11px]">Direct Report</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {(e.role_name === 'manager' || e.role_name === 'hr') && !e.geofence_id ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Exempt (Not Required)
                          </span>
                        ) : (
                          <div className="flex items-center gap-1 text-slate-700 font-medium">
                            <Compass className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                            <span className="truncate max-w-[120px]" title={e.geofence_name || 'Company Default'}>
                              {e.geofence_name || 'Company Default'}
                            </span>
                            {e.geofence_radius && (
                              <span className="text-[10px] text-slate-400 font-mono">({e.geofence_radius}m)</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-slate-700 font-medium">
                          <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="truncate max-w-[110px]" title={e.shift_name || 'General'}>
                            {e.shift_name || 'General'}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          e.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 1. Edit Button */}
                          <button
                            type="button"
                            onClick={() => openEditEmployee(e)}
                            className="px-2 py-1 text-slate-700 hover:text-sky-600 bg-white hover:bg-sky-50 border border-slate-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs transition-colors"
                            title="Edit Employee Details"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-sky-600" />
                            <span>Edit</span>
                          </button>

                          {/* 2. Active / Suspend Toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(e)}
                            className={`px-2 py-1 border rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs transition-colors ${
                              e.status === 'active'
                                ? 'text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200'
                                : 'text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                            }`}
                            title={e.status === 'active' ? 'Suspend Account' : 'Activate Account'}
                          >
                            {e.status === 'active' ? (
                              <>
                                <Ban className="w-3.5 h-3.5 text-amber-600" />
                                <span>Suspend</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Activate</span>
                              </>
                            )}
                          </button>

                          {/* 3. Change Password Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedEmployeeForPassword(e);
                              setShowPasswordModal(true);
                            }}
                            className="px-2 py-1 text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs transition-colors"
                            title="Change Account Password"
                          >
                            <Key className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Password</span>
                          </button>

                          {/* 4. Delete Button */}
                          <button
                            type="button"
                            onClick={() => deleteEmployee(e.id, e.full_name)}
                            className="px-2 py-1 text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs transition-colors"
                            title="Delete Account"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {employees.length === 0 && (
                    <tr>
                      <td colSpan="10" className="p-8 text-center text-slate-400">
                        No employees found matching the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-slate-500">
                Showing{' '}
                <span className="font-semibold text-slate-800">
                  {totalEmployees === 0 ? 0 : (page - 1) * pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-slate-800">
                  {Math.min(page * pageSize, totalEmployees)}
                </span>{' '}
                of <span className="font-semibold text-slate-800">{totalEmployees}</span> employees
              </div>

              {/* Page Number Buttons */}
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

                {Array.from({ length: Math.max(1, Math.ceil(totalEmployees / pageSize)) }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === Math.ceil(totalEmployees / pageSize) || Math.abs(p - page) <= 2)
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
                  onClick={() => setPage(p => Math.min(Math.ceil(totalEmployees / pageSize), p + 1))}
                  disabled={page >= Math.ceil(totalEmployees / pageSize) || totalEmployees === 0}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: EMPLOYEE MAPPING */}
      {activeTab === 'mapping' && (
        <EmployeeMappingView role="hr" />
      )}

      {/* TAB: ATTENDANCE SHEETS & MANAGEMENT */}
      {activeTab === 'attendance' && (
        <AttendanceManagementView role="hr" company={company} />
      )}

      {/* TAB: LEAVE APPROVALS & EARNED LEAVE ACCRUAL */}
      {activeTab === 'leave' && (
        <div className="space-y-6">
          {/* Monthly Accrual & Manual Quota Adjustment Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-sky-50 text-sky-600 rounded-lg">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">Earned Leave (EL) Monthly Accrual & Quota Credit</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Accrues 1.25 Earned Leave days per month (15 days/year) for active staff. (Zero-Payroll Compliant: Balances only).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunMonthlyAccrual}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Auto-Run Monthly Accrual
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualLeaveModal(true)}
                  className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Manual Quota Credit
                </button>
              </div>
            </div>

            {/* Accrual Logs summary */}
            {leaveAccruals.length > 0 && (
              <div className="pt-3 border-t border-slate-100 flex items-center gap-3 overflow-x-auto text-xs text-slate-600">
                <span className="font-semibold text-slate-700 whitespace-nowrap">Recent Accrual History:</span>
                {leaveAccruals.slice(0, 3).map(log => (
                  <span key={log.id} className="bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 font-mono text-[11px] whitespace-nowrap">
                    {log.leave_type_name || 'EL'}: +{log.accrued_days} days ({log.month}/{log.year}) • {log.employees_affected} staff
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Leave Requests Workflow</h3>
              <span className="text-xs text-amber-600 font-semibold">Attendance Record Sync (Zero Payroll Connection)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Leave Type</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaveRequests.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">{l.employee_name} ({l.employee_code})</td>
                      <td className="p-3 font-bold text-sky-700">{l.leave_type_name}</td>
                      <td className="p-3 text-slate-700">
                        {l.start_date} to {l.end_date} ({l.total_days} days)
                      </td>
                      <td className="p-3 text-slate-600">{l.reason}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          l.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                          l.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {l.status === 'pending' && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleLeaveDecision(l.id, 'approved')}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Approve
                            </button>
                            <button
                              onClick={() => handleLeaveDecision(l.id, 'rejected')}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold flex items-center gap-1"
                            >
                              <X className="w-3.5 h-3.5" />
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Attendance Correction Applications Section */}
          <AttendanceCorrectionReviewView role="hr" title="Attendance Correction Applications" />
        </div>
      )}

      {/* TAB: ATTENDANCE CORRECTIONS */}
      {activeTab === 'corrections' && (
        <AttendanceCorrectionReviewView role="hr" />
      )}

      {/* TAB: CALENDAR */}
      {activeTab === 'calendar' && (
        <UnifiedCalendar companyId={company?.id} role="hr" />
      )}

      {/* TAB: LIVE MAP */}
      {activeTab === 'live-map' && (
        <LiveTrackingMap companyId={company?.id} />
      )}

      {/* TAB: SHIFTS & ROTATIONAL */}
      {activeTab === 'shifts' && (
        <ShiftManagementView company={company} role="hr" />
      )}

      {/* TAB: HOLIDAYS & WEEKLY OFF */}
      {activeTab === 'holidays' && (
        <HolidaysWeeklyOffView company={company} role="hr" />
      )}

      {/* TAB: HELPDESK & SERVICE TICKETS */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Helpdesk & Ticket Resolution</h3>
              <p className="text-xs text-slate-500">Solve missing punch requests, location queries, and employee issues</p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Filter Status:</span>
              <select
                value={ticketStatusFilter}
                onChange={(e) => setTicketStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 font-medium text-slate-700"
              >
                <option value="all">All Tickets</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Ticket ID</th>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Title & Summary</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets
                    .filter(t => ticketStatusFilter === 'all' || t.status === ticketStatusFilter)
                    .map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono font-bold text-sky-600">#{t.id}</td>
                        <td className="p-3 font-semibold text-slate-900">{t.employee_name} ({t.employee_id})</td>
                        <td className="p-3 font-medium text-slate-700 capitalize">{t.category || t.request_type}</td>
                        <td className="p-3">
                          <p className="font-semibold text-slate-800">{t.title}</p>
                          {t.description && <p className="text-[11px] text-slate-500 truncate max-w-xs">{t.description}</p>}
                        </td>
                        <td className="p-3 text-slate-600">{new Date(t.created_at).toLocaleDateString()}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            t.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                            t.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                            t.status === 'closed' ? 'bg-slate-100 text-slate-600' :
                            'bg-rose-100 text-rose-700'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setChatTicketId(t.id);
                                setShowChatModal(true);
                              }}
                              className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                              title="Open Ticket Conversation"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Chat
                            </button>
                            <button
                              onClick={() => {
                                setSelectedTicket(t);
                                setTicketResolutionNotes(t.resolution_notes || '');
                                setShowSolveTicketModal(true);
                              }}
                              className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold"
                            >
                              Resolve
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  {tickets.length === 0 && (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-slate-400">
                        No service tickets found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD EMPLOYEE */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Add New Employee Master
            </h3>

            <form onSubmit={handleAddEmployee} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Employee Code (Optional)</label>
                  <input
                    type="text"
                    value={newEmp.employee_id}
                    onChange={(e) => setNewEmp({ ...newEmp, employee_id: e.target.value.toUpperCase() })}
                    placeholder="Leave blank to assign in future"
                    className="w-full p-2 border rounded-lg font-mono uppercase"
                  />
                  <span className="text-[10px] text-slate-400">Optional: If left blank, it will not be auto-generated and can be assigned later.</span>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newEmp.full_name}
                    onChange={(e) => setNewEmp({ ...newEmp, full_name: e.target.value })}
                    placeholder="e.g. Rajesh Kumar"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={newEmp.username}
                    onChange={(e) => setNewEmp({ ...newEmp, username: e.target.value })}
                    placeholder="e.g. rajesh_kumar"
                    className="w-full p-2 border rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Temporary Password *</label>
                  <input
                    type="password"
                    required
                    value={newEmp.password}
                    onChange={(e) => setNewEmp({ ...newEmp, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Department</label>
                  <input
                    type="text"
                    value={newEmp.department}
                    onChange={(e) => setNewEmp({ ...newEmp, department: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Designation</label>
                  <input
                    type="text"
                    value={newEmp.designation}
                    onChange={(e) => setNewEmp({ ...newEmp, designation: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Mobile Phone</label>
                  <input
                    type="text"
                    value={newEmp.mobile}
                    onChange={(e) => setNewEmp({ ...newEmp, mobile: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email</label>
                  <input
                    type="email"
                    value={newEmp.email}
                    onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })}
                    placeholder="name@company.com"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Assigned Geofence</label>
                  <select
                    value={newEmp.geofence_id}
                    onChange={(e) => setNewEmp({ ...newEmp, geofence_id: e.target.value })}
                    className="w-full p-2 border rounded-lg bg-white"
                  >
                    <option value="">Default Company Geofence</option>
                    {geofences.map(g => (
                      <option key={g.id} value={g.id}>{g.location_name} ({g.radius}m)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Work Shift</label>
                  <select
                    value={newEmp.shift_id}
                    onChange={(e) => setNewEmp({ ...newEmp, shift_id: e.target.value })}
                    className="w-full p-2 border rounded-lg bg-white"
                  >
                    <option value="">Default General Shift</option>
                    {shifts.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.start_time}-{s.end_time})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Reporting Manager</label>
                <select
                  value={newEmp.manager_id}
                  onChange={(e) => setNewEmp({ ...newEmp, manager_id: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-white"
                >
                  <option value="">No Manager Assigned</option>
                  {employees.filter(e => e.role_name === 'manager').map(m => (
                    <option key={m.id} value={m.id}>{m.full_name} ({m.employee_id})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm"
                >
                  Save Employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ATTENDANCE CORRECTION MODAL */}
      {editAttendanceModal && selectedAtt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Correct Attendance Record
            </h3>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-0.5">
              <p className="font-bold text-slate-900">{selectedAtt.employee_name} ({selectedAtt.employee_code})</p>
              <p className="text-slate-500">Date: {selectedAtt.date}</p>
            </div>

            <form onSubmit={handleSaveAttendanceCorrection} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Punch In Time</label>
                  <input
                    type="time"
                    step="1"
                    value={attEditForm.punch_in_time}
                    onChange={(e) => setAttEditForm({ ...attEditForm, punch_in_time: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Punch Out Time</label>
                  <input
                    type="time"
                    step="1"
                    value={attEditForm.punch_out_time}
                    onChange={(e) => setAttEditForm({ ...attEditForm, punch_out_time: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Attendance Status</label>
                <select
                  value={attEditForm.status}
                  onChange={(e) => setAttEditForm({ ...attEditForm, status: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-white"
                >
                  <option value="Present">Present</option>
                  <option value="Half Day">Half Day</option>
                  <option value="Absent">Absent</option>
                  <option value="Leave">Leave</option>
                  <option value="Holiday">Holiday</option>
                  <option value="Weekly Off">Weekly Off</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Mandatory Audit Reason *</label>
                <textarea
                  rows={2}
                  required
                  value={attEditForm.reason}
                  onChange={(e) => setAttEditForm({ ...attEditForm, reason: e.target.value })}
                  placeholder="e.g. Employee punch in network failure, verified by manager"
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditAttendanceModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm"
                >
                  Apply Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT EMPLOYEE */}
      {showEditEmpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Edit Employee Record
                </h3>
                <p className="text-xs text-slate-500">Update account profile, department, geofencing & manager</p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditEmpModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditEmployee} className="space-y-3.5 text-xs">
              {/* Position / Role Selector Pill Toggle */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Select Position / Role *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditEmpForm({
                      ...editEmpForm,
                      role: 'employee',
                      reports_to_admin: false
                    })}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      editEmpForm.role === 'employee' ? 'bg-sky-50 border-sky-500 text-sky-700 ring-1 ring-sky-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Employee
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditEmpForm({
                      ...editEmpForm,
                      role: 'manager',
                      reports_to_manager: false,
                      manager_id: '',
                      reports_to_admin: false
                    })}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      editEmpForm.role === 'manager' ? 'bg-purple-50 border-purple-500 text-purple-700 ring-1 ring-purple-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Manager
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditEmpForm({
                      ...editEmpForm,
                      role: 'hr',
                      reports_to_manager: false,
                      manager_id: '',
                      reports_to_hr: false,
                      hr_id: '',
                      reports_to_admin: true
                    })}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      editEmpForm.role === 'hr' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    HR Lead
                  </button>
                </div>
              </div>

              {/* Dynamic Multi-Level Reporting Hierarchy */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <GitMerge className="w-4 h-4 text-sky-600" />
                    Multi-Level Reporting Hierarchy
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {editEmpForm.role === 'employee' ? 'Tick one or more' : editEmpForm.role === 'manager' ? 'Tick HR, Admin, or both' : 'Direct Admin Report'}
                  </span>
                </div>

                {editEmpForm.role === 'employee' && (
                  <div className="space-y-2.5 pt-1">
                    {/* Checkbox 1: Manager */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={editEmpForm.reports_to_manager}
                          onChange={(e) => setEditEmpForm({
                            ...editEmpForm,
                            reports_to_manager: e.target.checked,
                            manager_id: e.target.checked ? editEmpForm.manager_id : ''
                          })}
                          className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                        />
                        <span>Report to Manager</span>
                      </label>
                      {editEmpForm.reports_to_manager && (
                        <div className="ml-6 mt-1.5">
                          <select
                            value={editEmpForm.manager_id}
                            onChange={(e) => setEditEmpForm({ ...editEmpForm, manager_id: e.target.value })}
                            className="w-full p-2 border rounded-lg bg-white text-xs"
                            required={editEmpForm.reports_to_manager}
                          >
                            <option value="">-- Select Reporting Manager * --</option>
                            {employees.filter(e => e.role_name === 'manager' && e.id !== editingEmpId).map(m => (
                              <option key={m.id} value={m.id}>{m.full_name} ({m.employee_id}) - {m.designation || 'Manager'}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Checkbox 2: HR Lead */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={editEmpForm.reports_to_hr}
                          onChange={(e) => setEditEmpForm({
                            ...editEmpForm,
                            reports_to_hr: e.target.checked,
                            hr_id: e.target.checked ? editEmpForm.hr_id : ''
                          })}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        />
                        <span>Report to HR Lead</span>
                      </label>
                      {editEmpForm.reports_to_hr && (
                        <div className="ml-6 mt-1.5">
                          <select
                            value={editEmpForm.hr_id}
                            onChange={(e) => setEditEmpForm({ ...editEmpForm, hr_id: e.target.value })}
                            className="w-full p-2 border rounded-lg bg-white text-xs"
                            required={editEmpForm.reports_to_hr}
                          >
                            <option value="">-- Select Reporting HR Lead * --</option>
                            {employees.filter(e => e.role_name === 'hr' && e.id !== editingEmpId).map(h => (
                              <option key={h.id} value={h.id}>{h.full_name} ({h.employee_id}) - {h.designation || 'HR Lead'}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Checkbox 3: Direct Admin */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={editEmpForm.reports_to_admin}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, reports_to_admin: e.target.checked })}
                          className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                        />
                        <span className="flex items-center gap-1.5">
                          <span>Report Directly to Company Admin</span>
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Admin Level</span>
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {editEmpForm.role === 'manager' && (
                  <div className="space-y-2.5 pt-1">
                    {/* Checkbox 1: HR Lead */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={editEmpForm.reports_to_hr}
                          onChange={(e) => setEditEmpForm({
                            ...editEmpForm,
                            reports_to_hr: e.target.checked,
                            hr_id: e.target.checked ? editEmpForm.hr_id : ''
                          })}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        />
                        <span>Report to HR Lead</span>
                      </label>
                      {editEmpForm.reports_to_hr && (
                        <div className="ml-6 mt-1.5">
                          <select
                            value={editEmpForm.hr_id}
                            onChange={(e) => setEditEmpForm({ ...editEmpForm, hr_id: e.target.value })}
                            className="w-full p-2 border rounded-lg bg-white text-xs"
                            required={editEmpForm.reports_to_hr}
                          >
                            <option value="">-- Select Reporting HR Lead * --</option>
                            {employees.filter(e => e.role_name === 'hr' && e.id !== editingEmpId).map(h => (
                              <option key={h.id} value={h.id}>{h.full_name} ({h.employee_id}) - {h.designation || 'HR Lead'}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Checkbox 2: Direct Admin */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={editEmpForm.reports_to_admin}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, reports_to_admin: e.target.checked })}
                          className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                        />
                        <span className="flex items-center gap-1.5">
                          <span>Report Directly to Company Admin</span>
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Admin Level</span>
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {editEmpForm.role === 'hr' && (
                  <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-[11px] font-medium">
                      Direct Report: Company Admin (All HR personnel report directly to the Company Administrator).
                    </span>
                  </div>
                )}
              </div>

              {/* Assigned Geofencing & Shift */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-sky-600" />
                    Geofencing & Shift Assignment
                  </span>
                  {editEmpForm.role === 'manager' || editEmpForm.role === 'hr' ? (
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Geofencing Optional (Exempt)
                    </span>
                  ) : (
                    <span className="text-[10px] text-rose-600 font-bold bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Mandatory Punching Geofence
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-medium text-slate-700 block mb-1">
                      Assigned Geofence {editEmpForm.role === 'employee' ? '*' : '(Optional)'}
                    </label>
                    <select
                      value={editEmpForm.geofence_id}
                      onChange={(e) => setEditEmpForm({ ...editEmpForm, geofence_id: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    >
                      <option value="">
                        {editEmpForm.role === 'employee' ? 'Default Company Geofence' : 'No Geofence (Allowed Anywhere)'}
                      </option>
                      {geofences.map(g => (
                        <option key={g.id} value={g.id}>{g.location_name} ({g.radius}m radius)</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      {editEmpForm.role === 'employee'
                        ? 'Attendance punches are strictly blocked outside this perimeter.'
                        : 'Managers and HR are exempt; can punch anywhere unless customized.'}
                    </p>
                  </div>
                  <div>
                    <label className="font-medium text-slate-700 block mb-1">Assigned Shift *</label>
                    <select
                      value={editEmpForm.shift_id}
                      onChange={(e) => setEditEmpForm({ ...editEmpForm, shift_id: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    >
                      <option value="">Default General Shift</option>
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">Governs working hours and attendance window.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Employee Code</label>
                  <input
                    type="text"
                    value={editEmpForm.employee_id}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, employee_id: e.target.value })}
                    className="w-full p-2 border rounded-lg font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editEmpForm.full_name}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, full_name: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={editEmpForm.email}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, email: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Mobile Phone</label>
                  <input
                    type="text"
                    value={editEmpForm.mobile}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, mobile: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Department</label>
                  <input
                    type="text"
                    value={editEmpForm.department}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, department: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Designation</label>
                  <input
                    type="text"
                    value={editEmpForm.designation}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, designation: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">City / Location</label>
                  <input
                    type="text"
                    value={editEmpForm.city}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, city: e.target.value })}
                    placeholder="e.g. Mumbai"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Account Status</label>
                  <select
                    value={editEmpForm.status}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, status: e.target.value })}
                    className="w-full p-2 border rounded-lg bg-white font-medium"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Reset Password</label>
                  <input
                    type="password"
                    value={editEmpForm.password}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, password: e.target.value })}
                    placeholder="Leave blank to keep current"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditEmpModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD EMPLOYEE */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-sky-600" />
                  Add Personnel / Staff
                </h3>
                <p className="text-xs text-slate-500">Configure role position, multi-level reporting hierarchy & geofencing</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddEmployee} className="space-y-3.5 text-xs">
              {/* Position / Role Selector Pill Toggle */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Select Position / Role *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewEmp({
                      ...newEmp,
                      role: 'employee',
                      department: 'Operations',
                      designation: 'Associate',
                      reports_to_manager: false,
                      manager_id: '',
                      reports_to_hr: false,
                      hr_id: '',
                      reports_to_admin: false
                    })}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      newEmp.role === 'employee' ? 'bg-sky-50 border-sky-500 text-sky-700 ring-1 ring-sky-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Employee
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewEmp({
                      ...newEmp,
                      role: 'manager',
                      department: 'Management',
                      designation: 'Team Manager',
                      reports_to_manager: false,
                      manager_id: '',
                      reports_to_hr: false,
                      hr_id: '',
                      reports_to_admin: false
                    })}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      newEmp.role === 'manager' ? 'bg-purple-50 border-purple-500 text-purple-700 ring-1 ring-purple-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Manager
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewEmp({
                      ...newEmp,
                      role: 'hr',
                      department: 'Human Resources',
                      designation: 'HR Lead',
                      reports_to_manager: false,
                      manager_id: '',
                      reports_to_hr: false,
                      hr_id: '',
                      reports_to_admin: true
                    })}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      newEmp.role === 'hr' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    HR Lead
                  </button>
                </div>
              </div>

              {/* Dynamic Multi-Level Reporting Hierarchy */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <GitMerge className="w-4 h-4 text-sky-600" />
                    Multi-Level Reporting Hierarchy
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {newEmp.role === 'employee' ? 'Tick one or more' : newEmp.role === 'manager' ? 'Tick HR, Admin, or both' : 'Direct Admin Report'}
                  </span>
                </div>

                {newEmp.role === 'employee' && (
                  <div className="space-y-2.5 pt-1">
                    {/* Checkbox 1: Manager */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={newEmp.reports_to_manager}
                          onChange={(e) => setNewEmp({
                            ...newEmp,
                            reports_to_manager: e.target.checked,
                            manager_id: e.target.checked ? newEmp.manager_id : ''
                          })}
                          className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                        />
                        <span>Report to Manager</span>
                      </label>
                      {newEmp.reports_to_manager && (
                        <div className="ml-6 mt-1.5">
                          <select
                            value={newEmp.manager_id}
                            onChange={(e) => setNewEmp({ ...newEmp, manager_id: e.target.value })}
                            className="w-full p-2 border rounded-lg bg-white text-xs"
                            required={newEmp.reports_to_manager}
                          >
                            <option value="">-- Select Reporting Manager * --</option>
                            {employees.filter(e => e.role_name === 'manager').map(m => (
                              <option key={m.id} value={m.id}>{m.full_name} ({m.employee_id}) - {m.designation || 'Manager'}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Checkbox 2: HR Lead */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={newEmp.reports_to_hr}
                          onChange={(e) => setNewEmp({
                            ...newEmp,
                            reports_to_hr: e.target.checked,
                            hr_id: e.target.checked ? newEmp.hr_id : ''
                          })}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        />
                        <span>Report to HR Lead</span>
                      </label>
                      {newEmp.reports_to_hr && (
                        <div className="ml-6 mt-1.5">
                          <select
                            value={newEmp.hr_id}
                            onChange={(e) => setNewEmp({ ...newEmp, hr_id: e.target.value })}
                            className="w-full p-2 border rounded-lg bg-white text-xs"
                            required={newEmp.reports_to_hr}
                          >
                            <option value="">-- Select Reporting HR Lead * --</option>
                            {employees.filter(e => e.role_name === 'hr').map(h => (
                              <option key={h.id} value={h.id}>{h.full_name} ({h.employee_id}) - {h.designation || 'HR Lead'}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Checkbox 3: Direct Admin */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={newEmp.reports_to_admin}
                          onChange={(e) => setNewEmp({ ...newEmp, reports_to_admin: e.target.checked })}
                          className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                        />
                        <span className="flex items-center gap-1.5">
                          <span>Report Directly to Company Admin</span>
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Admin Level</span>
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {newEmp.role === 'manager' && (
                  <div className="space-y-2.5 pt-1">
                    {/* Checkbox 1: HR Lead */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={newEmp.reports_to_hr}
                          onChange={(e) => setNewEmp({
                            ...newEmp,
                            reports_to_hr: e.target.checked,
                            hr_id: e.target.checked ? newEmp.hr_id : ''
                          })}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        />
                        <span>Report to HR Lead</span>
                      </label>
                      {newEmp.reports_to_hr && (
                        <div className="ml-6 mt-1.5">
                          <select
                            value={newEmp.hr_id}
                            onChange={(e) => setNewEmp({ ...newEmp, hr_id: e.target.value })}
                            className="w-full p-2 border rounded-lg bg-white text-xs"
                            required={newEmp.reports_to_hr}
                          >
                            <option value="">-- Select Reporting HR Lead * --</option>
                            {employees.filter(e => e.role_name === 'hr').map(h => (
                              <option key={h.id} value={h.id}>{h.full_name} ({h.employee_id}) - {h.designation || 'HR Lead'}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Checkbox 2: Direct Admin */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={newEmp.reports_to_admin}
                          onChange={(e) => setNewEmp({ ...newEmp, reports_to_admin: e.target.checked })}
                          className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                        />
                        <span className="flex items-center gap-1.5">
                          <span>Report Directly to Company Admin</span>
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Admin Level</span>
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {newEmp.role === 'hr' && (
                  <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-[11px] font-medium">
                      Direct Report: Company Admin (All HR personnel report directly to the Company Administrator).
                    </span>
                  </div>
                )}
              </div>

              {/* Assigned Geofencing & Shift */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-sky-600" />
                    Geofencing & Shift Assignment
                  </span>
                  {newEmp.role === 'manager' || newEmp.role === 'hr' ? (
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Geofencing Optional (Exempt)
                    </span>
                  ) : (
                    <span className="text-[10px] text-rose-600 font-bold bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Mandatory Punching Geofence
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-medium text-slate-700 block mb-1">
                      Assigned Geofence {newEmp.role === 'employee' ? '*' : '(Optional)'}
                    </label>
                    <select
                      value={newEmp.geofence_id}
                      onChange={(e) => setNewEmp({ ...newEmp, geofence_id: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    >
                      <option value="">
                        {newEmp.role === 'employee' ? 'Default Company Geofence' : 'No Geofencing (Allowed Anywhere)'}
                      </option>
                      {geofences.map(g => (
                        <option key={g.id} value={g.id}>{g.location_name} ({g.radius}m radius)</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      {newEmp.role === 'employee'
                        ? 'Attendance punches are strictly blocked outside this perimeter.'
                        : 'Managers and HR are exempt; can punch from anywhere unless customized.'}
                    </p>
                  </div>
                  <div>
                    <label className="font-medium text-slate-700 block mb-1">Assigned Shift *</label>
                    <select
                      value={newEmp.shift_id}
                      onChange={(e) => setNewEmp({ ...newEmp, shift_id: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    >
                      <option value="">Default General Shift</option>
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">Governs working hours and attendance window.</p>
                  </div>
                </div>
              </div>

              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Employee ID / Code (Optional)</label>
                  <input
                    type="text"
                    value={newEmp.employee_id}
                    onChange={(e) => setNewEmp({ ...newEmp, employee_id: e.target.value.toUpperCase() })}
                    placeholder="Leave blank to assign in future"
                    className="w-full p-2 border rounded-lg uppercase font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Optional: If left blank, it will not be auto-generated and can be assigned later.</span>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newEmp.full_name}
                    onChange={(e) => setNewEmp({ ...newEmp, full_name: e.target.value })}
                    placeholder="e.g. Ramesh Chandra"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={newEmp.username}
                    onChange={(e) => setNewEmp({ ...newEmp, username: e.target.value })}
                    placeholder="e.g. ramesh_chandra"
                    className="w-full p-2 border rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Temporary Password *</label>
                  <input
                    type="password"
                    required
                    value={newEmp.password}
                    onChange={(e) => setNewEmp({ ...newEmp, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Department</label>
                  <input
                    type="text"
                    value={newEmp.department}
                    onChange={(e) => setNewEmp({ ...newEmp, department: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Designation</label>
                  <input
                    type="text"
                    value={newEmp.designation}
                    onChange={(e) => setNewEmp({ ...newEmp, designation: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">City / Location</label>
                  <input
                    type="text"
                    value={newEmp.city}
                    onChange={(e) => setNewEmp({ ...newEmp, city: e.target.value })}
                    placeholder="e.g. Mumbai"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Mobile Phone</label>
                  <input
                    type="text"
                    value={newEmp.mobile}
                    onChange={(e) => setNewEmp({ ...newEmp, mobile: e.target.value })}
                    placeholder="+91 9876543210"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email</label>
                  <input
                    type="email"
                    value={newEmp.email}
                    onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })}
                    placeholder="name@company.com"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm"
                >
                  Save Personnel Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SOLVE TICKET */}
      {showSolveTicketModal && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">
                    Ticket #{selectedTicket.id}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    selectedTicket.status === 'resolved' ? 'bg-emerald-50 text-emerald-700' :
                    selectedTicket.status === 'in_progress' ? 'bg-amber-50 text-amber-700' :
                    'bg-rose-50 text-rose-700'
                  }`}>
                    {selectedTicket.status}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1">{selectedTicket.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSolveTicketModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div><span className="font-semibold text-slate-800">Submitted By:</span> {selectedTicket.employee_name || 'Staff'} ({selectedTicket.employee_id || 'N/A'})</div>
                <div><span className="font-semibold text-slate-800">Category:</span> {selectedTicket.category || selectedTicket.request_type}</div>
                <div><span className="font-semibold text-slate-800">Priority:</span> <span className="capitalize font-medium">{selectedTicket.priority || 'Normal'}</span></div>
                <div><span className="font-semibold text-slate-800">Date:</span> {new Date(selectedTicket.created_at).toLocaleDateString()}</div>
              </div>
              {selectedTicket.description && (
                <div className="pt-2 border-t border-slate-200/60">
                  <span className="font-semibold text-slate-800 block mb-1">Issue Description:</span>
                  <p className="text-slate-700 bg-white p-2 rounded border border-slate-200">{selectedTicket.description}</p>
                </div>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-semibold text-slate-700 block">
                Resolution & Helpdesk Notes *
              </label>
              <textarea
                rows="3"
                value={ticketResolutionNotes}
                onChange={(e) => setTicketResolutionNotes(e.target.value)}
                placeholder="Enter resolution notes, root cause, or actions taken to resolve this ticket..."
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSolveTicketModal(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-medium"
              >
                Cancel
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleResolveTicket('in_progress')}
                  className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-semibold"
                >
                  Mark In Progress
                </button>
                <button
                  type="button"
                  onClick={() => handleResolveTicket('resolved')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm"
                >
                  Resolve & Close Ticket
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL LEAVE CREDIT */}
      {showManualLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Manual Leave Credit (Quota Adjustment)
                </h3>
                <p className="text-xs text-slate-500">Credit earned leave or adjustment to staff quotas</p>
              </div>
              <button
                type="button"
                onClick={() => setShowManualLeaveModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualLeaveCredit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Leave Type *</label>
                <select
                  required
                  value={manualLeaveForm.leave_type_id}
                  onChange={(e) => setManualLeaveForm({ ...manualLeaveForm, leave_type_id: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-white font-medium"
                >
                  <option value="">Select Leave Type...</option>
                  {leaveTypes.map(lt => (
                    <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Target Beneficiaries</label>
                <div className="flex gap-4 p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="hr_apply_target"
                      checked={manualLeaveForm.apply_to_all}
                      onChange={() => setManualLeaveForm({ ...manualLeaveForm, apply_to_all: true, employee_id: '' })}
                      className="text-sky-600"
                    />
                    <span className="font-medium text-slate-800">All Company Staff ({employees.length})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="hr_apply_target"
                      checked={!manualLeaveForm.apply_to_all}
                      onChange={() => setManualLeaveForm({ ...manualLeaveForm, apply_to_all: false })}
                      className="text-sky-600"
                    />
                    <span className="font-medium text-slate-800">Specific Employee</span>
                  </label>
                </div>
              </div>

              {!manualLeaveForm.apply_to_all && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Select Employee *</label>
                  <select
                    required={!manualLeaveForm.apply_to_all}
                    value={manualLeaveForm.employee_id}
                    onChange={(e) => setManualLeaveForm({ ...manualLeaveForm, employee_id: e.target.value })}
                    className="w-full p-2 border rounded-lg bg-white"
                  >
                    <option value="">Select an employee...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_id}) - {emp.department}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Days to Credit *</label>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="30"
                  required
                  value={manualLeaveForm.days}
                  onChange={(e) => setManualLeaveForm({ ...manualLeaveForm, days: parseFloat(e.target.value) })}
                  className="w-full p-2 border rounded-lg font-mono font-bold text-sky-700"
                />
                <span className="text-[10px] text-slate-400">e.g. 1.25 for standard monthly Earned Leave</span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Reason / Reference Note</label>
                <input
                  type="text"
                  required
                  value={manualLeaveForm.reason}
                  onChange={(e) => setManualLeaveForm({ ...manualLeaveForm, reason: e.target.value })}
                  placeholder="e.g. Monthly Earned Leave Accrual"
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowManualLeaveModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm"
                >
                  Confirm Credit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ExcelImportModal
        isOpen={showExcelModal}
        onClose={() => setShowExcelModal(false)}
        onSuccess={() => { setSuccess('Excel master data synced successfully.'); fetchData(); }}
        mode={excelModalMode}
      />

      {/* CUSTOM EXPORT BUILDER MODAL */}
      <CustomExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />

      {/* TICKET CONVERSATION / CHAT MODAL */}
      <TicketChatModal
        ticketId={chatTicketId}
        isOpen={showChatModal}
        onClose={() => {
          setShowChatModal(false);
          setChatTicketId(null);
        }}
        currentUser={user}
        onStatusUpdated={fetchData}
      />

      {/* EMPLOYEE PASSWORD RESET MODAL */}
      <EmployeeChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setSelectedEmployeeForPassword(null);
        }}
        employee={selectedEmployeeForPassword}
        onSuccess={(msg) => {
          setSuccess(msg);
          fetchData();
        }}
      />
    </div>
  );
}
