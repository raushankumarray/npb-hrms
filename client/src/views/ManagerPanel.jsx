import React, { useState, useEffect } from 'react';
import {
  Users, Clock, Calendar, MapPin, CheckCircle, AlertTriangle,
  RefreshCw, Check, X, FileText, Navigation, Ticket, MessageSquare,
  Edit3, Trash2, Key, Ban, Filter, ChevronLeft, ChevronRight, SlidersHorizontal,
  UserPlus, FileSpreadsheet, Compass, ShieldCheck, CheckCircle2, GitMerge, Search,
  Archive, Inbox
} from 'lucide-react';
import { apiRequest } from '../api';
import LiveTrackingMap from '../components/LiveTrackingMap';
import CustomExportModal from '../components/CustomExportModal';
import UnifiedCalendar from '../components/UnifiedCalendar';
import TicketChatModal from '../components/TicketChatModal';
import ExcelImportModal from '../components/ExcelImportModal';
import EmployeeChangePasswordModal from '../components/EmployeeChangePasswordModal';
import ManagerAttendanceReportsView from '../components/ManagerAttendanceReportsView';
import AttendanceCorrectionReviewView from '../components/AttendanceCorrectionReviewView';
import ManagerMonthlyAttendanceSheetView from '../components/ManagerMonthlyAttendanceSheetView';

export default function ManagerPanel({ user, company, activeTab }) {
  // Employees state
  const [employees, setEmployees] = useState([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [shifts, setShifts] = useState([]);
  const [geofences, setGeofences] = useState([]);

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

  // Modals state
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [excelModalMode, setExcelModalMode] = useState('import');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedEmployeeForPassword, setSelectedEmployeeForPassword] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState(null);

  // Other tabs state
  const [attendance, setAttendance] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketResolutionNotes, setTicketResolutionNotes] = useState('');
  const [showSolveTicketModal, setShowSolveTicketModal] = useState(false);
  const [chatTicketId, setChatTicketId] = useState(null);
  const [showChatModal, setShowChatModal] = useState(false);
  // Helpdesk complaint creation states for manager
  const [showRaiseComplaintModal, setShowRaiseComplaintModal] = useState(false);
  const [complaintCategory, setComplaintCategory] = useState('other');
  const [complaintTitle, setComplaintTitle] = useState('');
  const [complaintDescription, setComplaintDescription] = useState('');
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  const [complaintFilter, setComplaintFilter] = useState('all');
  const [ticketSection, setTicketSection] = useState('pending'); // 'pending' | 'closed'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [dashboardStats, setDashboardStats] = useState({
    assigned_members: 0,
    pending_leaves: 0,
    pending_corrections: 0,
    today_attendance: {
      date: '',
      present: 0,
      absent: 0,
      leave: 0
    }
  });

  // Form states
  const [newEmp, setNewEmp] = useState({
    employee_id: '',
    full_name: '',
    username: '',
    password: 'User@12345',
    email: '',
    mobile: '',
    department: 'Operations',
    designation: 'Associate',
    city: '',
    shift_id: '',
    geofence_id: '',
    role: 'employee',
    reports_to_manager: true,
    reports_to_admin: false
  });

  const [editEmpForm, setEditEmpForm] = useState({
    employee_id: '',
    full_name: '',
    email: '',
    mobile: '',
    department: '',
    designation: '',
    city: '',
    role: 'employee',
    reports_to_manager: true,
    manager_id: '',
    reports_to_admin: false,
    shift_id: '',
    geofence_id: '',
    status: 'active',
    password: ''
  });

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'dashboard') {
        const statsRes = await apiRequest('/employees/manager-dashboard-stats');
        setDashboardStats(statsRes);
      }
      if (activeTab === 'my-employees') {
        const queryParams = new URLSearchParams();
        queryParams.append('limit', pageSize);
        queryParams.append('offset', (page - 1) * pageSize);
        if (roleFilter !== 'all') queryParams.append('role', roleFilter);
        if (statusFilter !== 'all') queryParams.append('status', statusFilter);
        if (cityFilter !== 'all') queryParams.append('city', cityFilter);
        if (searchQuery.trim()) queryParams.append('search', searchQuery.trim());

        const empRes = await apiRequest(`/employees?${queryParams.toString()}`);
        setEmployees(empRes.employees || []);
        setTotalEmployees(empRes.total !== undefined ? empRes.total : (empRes.employees || []).length);
        if (empRes.cities) setAvailableCities(empRes.cities);
      }
      if (activeTab === 'attendance') {
        const attRes = await apiRequest('/attendance/list');
        setAttendance(attRes.records || []);
      }
      if (activeTab === 'approvals') {
        const leaveRes = await apiRequest('/leave/requests');
        setLeaveRequests(leaveRes.requests || []);
      }
      if (activeTab === 'tickets') {
        const tickRes = await apiRequest('/tickets/service-requests?view=all');
        setTickets(tickRes.requests || []);
      }
      const sRes = await apiRequest('/shifts');
      setShifts(sRes.shifts || []);
      const gRes = await apiRequest('/geofences');
      setGeofences(gRes.geofences || []);
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
        manager_id: user?.employee_id || user?.id,
        hr_id: null,
        reports_to_admin: newEmp.reports_to_admin ? 1 : 0,
        geofence_mode: newEmp.role === 'manager'
          ? (newEmp.geofence_id ? 'custom' : 'none')
          : (newEmp.geofence_id ? 'custom' : 'company')
      };

      const res = await apiRequest('/employees', {
        method: 'POST',
        body: payload
      });
      setSuccess(`Team employee "${newEmp.full_name}" added successfully${res.employeeCode ? ` (Code: ${res.employeeCode})` : ' (No ID assigned - can update later)'}.`);
      setShowAddModal(false);
      setNewEmp({
        employee_id: '', full_name: '', username: '', password: 'User@12345',
        email: '', mobile: '', department: 'Operations', designation: 'Associate',
        city: '', shift_id: '', geofence_id: '', role: 'employee',
        reports_to_manager: true, reports_to_admin: false
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
      designation: emp.designation || 'Associate',
      city: emp.city || '',
      role: role === 'hr' ? 'employee' : role,
      manager_id: emp.manager_id ? String(emp.manager_id) : String(user?.employee_id || user?.id),
      reports_to_manager: true,
      reports_to_admin: !!emp.reports_to_admin,
      shift_id: emp.shift_id ? String(emp.shift_id) : '',
      geofence_id: emp.geofence_id ? String(emp.geofence_id) : '',
      status: emp.status || 'active',
      password: ''
    });
    setShowEditModal(true);
  };

  const handleSaveEditEmployee = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...editEmpForm,
        manager_id: user?.employee_id || user?.id,
        hr_id: null,
        reports_to_admin: editEmpForm.reports_to_admin ? 1 : 0,
        geofence_mode: editEmpForm.role === 'manager'
          ? (editEmpForm.geofence_id ? 'custom' : 'none')
          : (editEmpForm.geofence_id ? 'custom' : 'company')
      };

      await apiRequest(`/employees/${editingEmpId}`, {
        method: 'PUT',
        body: payload
      });
      setSuccess(`Team employee "${editEmpForm.full_name}" updated successfully.`);
      setShowEditModal(false);
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

  const handleDeleteEmployee = async (empId, name) => {
    if (!window.confirm(`Are you sure you want to delete employee "${name}"? This will deactivate the account.`)) return;
    try {
      await apiRequest(`/employees/${empId}`, {
        method: 'DELETE'
      });
      setSuccess(`Employee "${name}" deleted.`);
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


  const handleCreateComplaint = async (e) => {
    e.preventDefault();
    if (!complaintTitle.trim()) {
      setError('Please provide a title for your complaint.');
      return;
    }
    setSubmittingComplaint(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiRequest('/tickets/service-request', {
        method: 'POST',
        body: {
          request_type: complaintCategory,
          title: complaintTitle.trim(),
          description: complaintDescription.trim()
        }
      });
      setShowRaiseComplaintModal(false);
      setComplaintTitle('');
      setComplaintDescription('');
      setSuccess(`Complaint #${res.requestId} submitted successfully! Auto-assigned to Technical Support Team.`);
      // Refresh tickets
      const tickRes = await apiRequest('/tickets/service-requests?view=all');
      setTickets(tickRes.requests || []);
    } catch (err) {
      setError(err.message || 'Failed to submit complaint.');
    } finally {
      setSubmittingComplaint(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {activeTab === 'dashboard'
              ? `Welcome, ${user.fullName || user.username} (Manager)`
              : activeTab === 'corrections'
              ? 'Attendance Approval'
              : activeTab === 'reports'
              ? 'Team Reports'
              : activeTab === 'live-map'
              ? 'Live Route & Map'
              : activeTab === 'tickets'
              ? 'Helpdesk & Tickets'
              : 'Manager Team Portal'}
          </h2>
          <p className="text-xs text-slate-500">{company?.name} • Assigned team oversight, attendance metrics, and approvals</p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'my-employees' && (
            <>
              <button
                onClick={() => { setExcelModalMode('import'); setShowExcelModal(true); }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                title="Batch add new employees using Excel template"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Add Staff via Excel</span>
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Team Member</span>
              </button>
            </>
          )}

          {activeTab === 'reports' && (
            <button
              onClick={() => setShowExportModal(true)}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <FileText className="w-4 h-4" />
              Export Team Data
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

      {/* DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* 3 Core Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 1. Assigned Team Members */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned Team Members</span>
                <p className="text-3xl font-black text-slate-900 mt-1">{dashboardStats.assigned_members}</p>
                <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Total Active Direct Reports
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <Users className="w-6 h-6" />
              </div>
            </div>

            {/* 2. Pending Leave Approvals */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Leave Approvals</span>
                <p className="text-3xl font-black text-slate-900 mt-1">{dashboardStats.pending_leaves}</p>
                <span className="text-[11px] text-amber-600 font-semibold flex items-center gap-1 mt-1">
                  <Clock className="w-3.5 h-3.5" /> Awaiting Manager Review
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Calendar className="w-6 h-6" />
              </div>
            </div>

            {/* 3. Pending Attendance Corrections */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Attendance Corrections</span>
                <p className="text-3xl font-black text-slate-900 mt-1">{dashboardStats.pending_corrections}</p>
                <span className="text-[11px] text-purple-600 font-semibold flex items-center gap-1 mt-1">
                  <Edit3 className="w-3.5 h-3.5" /> Missing Punch Appeals
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Edit3 className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* 4. Attendance Recorded (Daily Basis - Today) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-sky-600" />
                  <span>Attendance Recorded (Daily Basis - Today)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Live daily attendance breakdown for assigned team members ({dashboardStats.today_attendance?.date || new Date().toISOString().split('T')[0]})
                </p>
              </div>
              <div className="text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-1 rounded-xl border border-slate-200">
                Team Size: <span className="font-bold text-slate-800">{dashboardStats.assigned_members}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              {/* Present */}
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200/70 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Present</span>
                  <p className="text-3xl font-black text-emerald-700 mt-1">{dashboardStats.today_attendance?.present || 0}</p>
                  <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Punched In / On Duty</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5" />
                </div>
              </div>

              {/* Absent */}
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200/70 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">Absent</span>
                  <p className="text-3xl font-black text-rose-700 mt-1">{dashboardStats.today_attendance?.absent || 0}</p>
                  <p className="text-[11px] text-rose-600 font-medium mt-0.5">No Punch Recorded</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <X className="w-5 h-5" />
                </div>
              </div>

              {/* Leave */}
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/70 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">On Leave</span>
                  <p className="text-3xl font-black text-amber-700 mt-1">{dashboardStats.today_attendance?.leave || 0}</p>
                  <p className="text-[11px] text-amber-600 font-medium mt-0.5">Approved Leave Today</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MY EMPLOYEES */}
      {activeTab === 'my-employees' && (
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

              {/* Page Size Selector (10, 25, 50, Custom) */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium whitespace-nowrap flex items-center gap-1">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" /> Limit:
                </span>
                <select
                  value={isCustomPageSize ? 'custom' : pageSize}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'custom') {
                      setIsCustomPageSize(true);
                    } else {
                      setIsCustomPageSize(false);
                      setPageSize(Number(val));
                      setPage(1);
                    }
                  }}
                  className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-semibold focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="10">10 / page</option>
                  <option value="25">25 / page</option>
                  <option value="50">50 / page</option>
                  <option value="custom">Custom</option>
                </select>

                {isCustomPageSize && (
                  <input
                    type="number"
                    min="1"
                    max="500"
                    placeholder="Size"
                    value={customPageSize}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomPageSize(val);
                      const num = parseInt(val, 10);
                      if (num > 0) {
                        setPageSize(num);
                        setPage(1);
                      }
                    }}
                    className="w-16 py-1 px-2 border border-sky-400 rounded-xl text-slate-800 text-xs font-mono font-bold bg-sky-50/50"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Direct Reports (My Team)</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">
                    {totalEmployees} Members
                  </span>
                </h3>
                <span className="text-xs text-slate-400">Strictly isolated to your assigned team members</span>
              </div>

              {/* Filter controls inside Direct Reports Section */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase px-2 flex items-center gap-1">
                    <Filter className="w-3 h-3 text-slate-400" /> Filter:
                  </span>
                  <button
                    type="button"
                    onClick={() => { setStatusFilter('all'); setPage(1); }}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                      statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStatusFilter('active'); setPage(1); }}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                      statusFilter === 'active' ? 'bg-emerald-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStatusFilter('suspended'); setPage(1); }}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                      statusFilter === 'suspended' ? 'bg-rose-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Suspended
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Position</th>
                    <th className="p-3">Department & Designation</th>
                    <th className="p-3">City</th>
                    <th className="p-3">Geofencing</th>
                    <th className="p-3">Shift</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">
                        <div>{e.full_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{e.employee_id} • {e.email || 'No email'}</div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          e.role_name === 'manager' ? 'bg-purple-100 text-purple-700' :
                          'bg-sky-100 text-sky-700'
                        }`}>
                          {e.role_name === 'manager' ? 'Manager' : 'Employee'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-slate-800">{e.department || 'Operations'}</div>
                        <div className="text-[10px] text-slate-400">{e.designation || 'Staff'}</div>
                      </td>
                      <td className="p-3 font-medium text-slate-700">
                        {e.city ? (
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-semibold text-slate-700">
                            {e.city}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">--</span>
                        )}
                      </td>
                      <td className="p-3">
                        {e.role_name === 'manager' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
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
                            onClick={() => handleDeleteEmployee(e.id, e.full_name)}
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
                      <td colSpan="8" className="p-8 text-center text-slate-400">
                        No team employees found matching the selected filters.
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

      {/* LIVE MAP */}
      {activeTab === 'live-map' && (
        <LiveTrackingMap companyId={company?.id} />
      )}

      {/* DAILY ATTENDANCE REPORTS & APPROVALS */}
      {activeTab === 'attendance' && (
        <ManagerAttendanceReportsView user={user} company={company} onStatsUpdate={fetchData} />
      )}

      {/* APPROVALS */}
      {activeTab === 'approvals' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Leave Approval Requests</h3>
            <span className="text-xs text-slate-400">Review team absence applications</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Leave Type</th>
                  <th className="p-3">Dates</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaveRequests.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-semibold text-slate-900">{l.employee_name} ({l.employee_code})</td>
                    <td className="p-3 font-bold text-sky-700">{l.leave_type_name}</td>
                    <td className="p-3 text-slate-700">{l.start_date} to {l.end_date} ({l.total_days} days)</td>
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

          {/* Team Attendance Correction Applications */}
          <div className="p-4 border-t border-slate-100">
            <AttendanceCorrectionReviewView role="manager" title="Team Attendance Correction Applications" />
          </div>
        </div>
      )}

      {/* TAB: ATTENDANCE APPROVAL */}
      {activeTab === 'corrections' && (
        <AttendanceCorrectionReviewView role="manager" title="Attendance Approval" />
      )}

      {/* TAB: CALENDAR */}
      {activeTab === 'calendar' && (
        <UnifiedCalendar companyId={company?.id} role="manager" holidayAndWoOnly={true} />
      )}

      {/* TAB: HELPDESK & SERVICE TICKETS */}
      {activeTab === 'tickets' && (() => {
        const isMyTicket = (t) => (
          (user.employee_id && t.employee_id === user.employee_id) ||
          t.employee_name === (user.fullName || user.username) ||
          t.created_by_username === user.username
        );

        const pendingTickets = tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed');
        const archivedTickets = tickets.filter(t => t.status === 'resolved' || t.status === 'closed');

        const activePool = ticketSection === 'pending' ? pendingTickets : archivedTickets;
        const myCount = activePool.filter(isMyTicket).length;
        const teamCount = activePool.filter(t => !isMyTicket(t)).length;

        const displayTickets = activePool.filter(t => {
          if (complaintFilter === 'mine') return isMyTicket(t);
          if (complaintFilter === 'team') return !isMyTicket(t);
          return true;
        });

        return (
          <div className="space-y-4">
            {/* Top Bar with Raise Complaint Button */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div>
                <h3 className="text-base font-bold text-slate-900">Helpdesk & Service Tickets</h3>
                <p className="text-xs text-slate-500">
                  Track team inquiries or raise issues directly to the Technical Support Team
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setComplaintCategory('other');
                  setComplaintTitle('');
                  setComplaintDescription('');
                  setShowRaiseComplaintModal(true);
                }}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Ticket className="w-4 h-4" />
                <span>+ Raise Complaint / Issue</span>
              </button>
            </div>

            {/* Section Switcher: Pending vs Closed Archive */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTicketSection('pending');
                    setComplaintFilter('all');
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                    ticketSection === 'pending'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pending & Active Tickets</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    ticketSection === 'pending' ? 'bg-slate-800 text-amber-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {pendingTickets.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTicketSection('closed');
                    setComplaintFilter('all');
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                    ticketSection === 'closed'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Closed & Resolved Archive</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    ticketSection === 'closed' ? 'bg-slate-800 text-emerald-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {archivedTickets.length}
                  </span>
                </button>
              </div>

              {/* Scope Sub-filters */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setComplaintFilter('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    complaintFilter === 'all'
                      ? 'bg-sky-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  All ({activePool.length})
                </button>
                <button
                  type="button"
                  onClick={() => setComplaintFilter('mine')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    complaintFilter === 'mine'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  My Complaints ({myCount})
                </button>
                <button
                  type="button"
                  onClick={() => setComplaintFilter('team')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    complaintFilter === 'team'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Team Tickets ({teamCount})
                </button>
              </div>
            </div>

            {/* Tickets Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                    <tr>
                      <th className="p-3">Ticket ID</th>
                      <th className="p-3">Requester</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Title & Request</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Assigned To</th>
                      <th className="p-3">Status</th>
                      {ticketSection === 'closed' && (
                        <th className="p-3">Resolution Notes</th>
                      )}
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayTickets.map(t => {
                      const mine = isMyTicket(t);
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-mono font-bold text-sky-600">#{t.id}</td>
                          <td className="p-3 font-semibold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <span>{t.employee_name}</span>
                              {mine ? (
                                <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 font-bold text-[10px]">
                                  My Complaint
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">({t.employee_code || t.employee_id})</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 font-medium text-slate-700 capitalize">{t.category || t.request_type}</td>
                          <td className="p-3">
                            <p className="font-semibold text-slate-800">{t.title}</p>
                            {t.description && <p className="text-[11px] text-slate-500 truncate max-w-xs">{t.description}</p>}
                          </td>
                          <td className="p-3 text-slate-600">{new Date(t.created_at).toLocaleDateString()}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              t.assigned_role === 'support' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                              t.assigned_role === 'admin' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                              'bg-sky-100 text-sky-800 border border-sky-200'
                            }`}>
                              {t.assigned_role === 'support' ? 'Support Panel' : t.assigned_role === 'admin' ? 'Admin' : 'Manager'}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              t.status === 'resolved' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                              t.status === 'closed' ? 'bg-slate-100 text-slate-700 border border-slate-200' :
                              t.status === 'in_progress' ? 'bg-sky-100 text-sky-700 border border-sky-200' :
                              'bg-amber-100 text-amber-700 border border-amber-200'
                            }`}>
                              {t.status}
                            </span>
                          </td>
                          {ticketSection === 'closed' && (
                            <td className="p-3 text-slate-600 max-w-xs truncate" title={t.resolution_notes || 'Resolved'}>
                              {t.resolution_notes || 'Resolved & closed by support/manager.'}
                            </td>
                          )}
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
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

                              {!mine && ticketSection === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTicket(t);
                                    setTicketResolutionNotes(t.resolution_notes || '');
                                    setShowSolveTicketModal(true);
                                  }}
                                  className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold"
                                >
                                  Resolve
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {displayTickets.length === 0 && (
                      <tr>
                        <td colSpan={ticketSection === 'closed' ? 9 : 8} className="p-8 text-center text-slate-400">
                          {ticketSection === 'pending'
                            ? (complaintFilter === 'mine'
                                ? 'You have no pending complaints.'
                                : complaintFilter === 'team'
                                ? 'No team pending tickets found.'
                                : 'No active or pending tickets found.')
                            : (complaintFilter === 'mine'
                                ? 'You have no archived complaints.'
                                : complaintFilter === 'team'
                                ? 'No team archived tickets found.'
                                : 'No closed or resolved tickets archived yet.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* TAB: TEAM REPORTS - MONTHLY ATTENDANCE SHEET */}
      {activeTab === 'reports' && (
        <ManagerMonthlyAttendanceSheetView user={user} company={company} />
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
                Manager Resolution & Audit Notes *
              </label>
              <textarea
                rows="3"
                value={ticketResolutionNotes}
                onChange={(e) => setTicketResolutionNotes(e.target.value)}
                placeholder="Enter resolution notes, attendance verification, or actions taken..."
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

      {/* MODAL: RAISE COMPLAINT TO SUPPORT */}
      {showRaiseComplaintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-indigo-600" />
                  Raise Complaint / Support Issue
                </h3>
                <p className="text-xs text-slate-500">
                  Submit an issue directly to the Technical Support Team
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRaiseComplaintModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Auto-assignment notice */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-indigo-900">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Auto-Assigned to Support Team Only</p>
                <p className="text-indigo-700">
                  This issue will be routed directly to the Central Technical Support Team for prompt resolution.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateComplaint} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Issue Category *</label>
                <select
                  value={complaintCategory}
                  onChange={(e) => setComplaintCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="other">System / Software Glitch or Other</option>
                  <option value="attendance_correction">Attendance / Punch Issue</option>
                  <option value="device_change">Device Registration / Binding Problem</option>
                  <option value="password_reset">Password / Authentication Issue</option>
                  <option value="account_problem">Account / Permissions Inquiry</option>
                  <option value="missing_punch">Missing Punch Appeal</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Complaint Title / Subject *</label>
                <input
                  type="text"
                  required
                  value={complaintTitle}
                  onChange={(e) => setComplaintTitle(e.target.value)}
                  placeholder="e.g. Map tracking delay or attendance punch error..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Detailed Explanation of Issue *</label>
                <textarea
                  required
                  rows={4}
                  value={complaintDescription}
                  onChange={(e) => setComplaintDescription(e.target.value)}
                  placeholder="Describe the exact issue faced, steps to reproduce, or error messages encountered..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-400">
                  Target: <strong className="text-indigo-600">Technical Support</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRaiseComplaintModal(false)}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingComplaint}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {submittingComplaint ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Complaint'
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD TEAM EMPLOYEE */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-sky-600" />
                  Add Team Personnel / Staff
                </h3>
                <p className="text-xs text-slate-500">Configure role position, hierarchy, shift & geofencing</p>
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
              {/* Position / Role Locked to Employee */}
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span className="font-semibold text-slate-700 block">Position / Role</span>
                  <span className="text-[11px] text-slate-500">Only Employee accounts can be registered by Managers</span>
                </div>
                <span className="px-3 py-1 bg-sky-100 text-sky-800 text-xs font-bold rounded-lg border border-sky-200">
                  Employee
                </span>
              </div>

              {/* Dynamic Multi-Level Reporting Hierarchy */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <GitMerge className="w-4 h-4 text-sky-600" />
                    Reporting Line
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {newEmp.role === 'employee' ? 'Auto-assigned to your team' : 'Direct Admin Report'}
                  </span>
                </div>

                <div className="space-y-2 pt-1 text-slate-700">
                  <label className="flex items-center gap-2 text-slate-700 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-sky-600" />
                    <span>Reports to You (Manager Oversight: {user?.username})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={newEmp.reports_to_admin}
                      onChange={(e) => setNewEmp({ ...newEmp, reports_to_admin: e.target.checked })}
                      className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                    />
                    <span className="flex items-center gap-1.5">
                      <span>Also Report Directly to Company Admin</span>
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Admin Level</span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Assigned Geofencing & Shift */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-sky-600" />
                    Geofencing & Shift Assignment
                  </span>
                  {newEmp.role === 'manager' ? (
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
                        : 'Managers are exempt; can punch from anywhere unless customized.'}
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
                  Save Team Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT TEAM EMPLOYEE */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Edit Team Employee
                </h3>
                <p className="text-xs text-slate-500">Update account profile, department, geofencing & assignments</p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditEmployee} className="space-y-3.5 text-xs">
              {/* Position / Role Locked to Employee */}
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span className="font-semibold text-slate-700 block">Position / Role</span>
                  <span className="text-[11px] text-slate-500">Employee role is managed under team supervision</span>
                </div>
                <span className="px-3 py-1 bg-sky-100 text-sky-800 text-xs font-bold rounded-lg border border-sky-200">
                  Employee
                </span>
              </div>

              {/* Multi-Level Reporting Hierarchy */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <GitMerge className="w-4 h-4 text-sky-600" />
                  Reporting Line
                </span>
                <div className="space-y-2 pt-1 text-slate-700">
                  <label className="flex items-center gap-2 text-slate-700 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-sky-600" />
                    <span>Reports to You (Manager: {user?.username})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={editEmpForm.reports_to_admin}
                      onChange={(e) => setEditEmpForm({ ...editEmpForm, reports_to_admin: e.target.checked })}
                      className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                    />
                    <span className="flex items-center gap-1.5">
                      <span>Also Report Directly to Company Admin</span>
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Admin Level</span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Assigned Geofencing & Shift */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-sky-600" />
                    Geofencing & Shift Assignment
                  </span>
                  {editEmpForm.role === 'manager' ? (
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
                        : 'Managers are exempt; can punch anywhere unless customized.'}
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
                  onClick={() => setShowEditModal(false)}
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

      {/* EXCEL IMPORT (ADD ONLY) MODAL */}
      <ExcelImportModal
        isOpen={showExcelModal}
        onClose={() => setShowExcelModal(false)}
        onSuccess={() => { setSuccess('New staff added via Excel successfully.'); fetchData(); }}
        mode="import"
        allowDiff={false}
      />

      {/* CUSTOM EXPORT MODAL */}
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
