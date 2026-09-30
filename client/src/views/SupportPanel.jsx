import React, { useState, useEffect, useRef } from 'react';
import {
  Shield, Laptop, Ticket, Clock, CheckCircle, AlertTriangle,
  RefreshCw, Unlock, Edit3, Search, MessageSquare, CheckCheck, X, Building2, Copy, Lock,
  Radio, Globe, Phone, Mail, User, Key, Send, Eye, MapPin, Check, Plus, AlertCircle, Play, ExternalLink, Power, UserX, UserCheck,
  Trash2, Archive, Calendar, Filter, FileSpreadsheet, Layers, ChevronLeft, ChevronRight,
  Users, FileText, ArrowRight, UserPlus, CheckSquare, XCircle, Sliders, Briefcase, Award
} from 'lucide-react';
import { apiRequest } from '../api';
import UnifiedCalendar from '../components/UnifiedCalendar';
import TicketChatModal from '../components/TicketChatModal';

function PaginationBar({ currentPage, totalItems, pageSize, onPageChange, onPageSizeChange }) {
  if (totalItems <= 0) return null;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const pages = [];
  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="p-3 bg-slate-50/80 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-3">
        <span className="text-slate-500 font-medium">
          Showing <span className="font-bold text-slate-800">{startItem}</span> to{' '}
          <span className="font-bold text-slate-800">{endItem}</span> of{' '}
          <span className="font-bold text-slate-800">{totalItems}</span> entries
        </span>
        <div className="flex items-center gap-1.5 text-slate-500">
          <span>Rows per page:</span>
          <select
            value={[10, 25, 50, 100].includes(pageSize) ? pageSize : 'custom'}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                const val = prompt('Enter custom rows per page:', String(pageSize));
                const num = parseInt(val, 10);
                if (!isNaN(num) && num > 0) {
                  onPageSizeChange(num);
                  onPageChange(1);
                }
              } else {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }
            }}
            className="bg-white border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            {![10, 25, 50, 100].includes(pageSize) && (
              <option value="custom">Custom ({pageSize})</option>
            )}
            {[10, 25, 50, 100].includes(pageSize) && (
              <option value="custom">Custom...</option>
            )}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 font-medium transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {startPage > 1 && (
          <>
            <button
              type="button"
              onClick={() => onPageChange(1)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-medium"
            >
              1
            </button>
            {startPage > 2 && <span className="px-1 text-slate-400">...</span>}
          </>
        )}

        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
              p === currentPage
                ? 'bg-purple-600 text-white shadow-xs'
                : 'border border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
            }`}
          >
            {p}
          </button>
        ))}

        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="px-1 text-slate-400">...</span>}
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-medium"
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 font-medium transition-colors"
          title="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function SupportPanel({ user, activeTab, onSelectTab }) {
  const [devices, setDevices] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Ticket Filter: 'pending' or 'archived'
  const [ticketSection, setTicketSection] = useState('pending');

  // Account Enable State for Suspended Accounts
  const [suspendedAccounts, setSuspendedAccounts] = useState([]);
  const [suspendedSearch, setSuspendedSearch] = useState('');
  const [suspendedLoading, setSuspendedLoading] = useState(false);
  const [enablingId, setEnablingId] = useState(null);

  // Multi-Company Support Access
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('all');

  // Ticket Chat State
  const [chatTicketId, setChatTicketId] = useState(null);
  const [showChatModal, setShowChatModal] = useState(false);

  // L4 Audit Reports & System Logs State
  const [auditView, setAuditView] = useState('today'); // 'today' | 'archived' | 'all'
  const [auditDayFilter, setAuditDayFilter] = useState('');
  const [auditMonthFilter, setAuditMonthFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditCounts, setAuditCounts] = useState({ total: 0, today: 0, archived: 0, filtered: 0 });
  const [auditLoading, setAuditLoading] = useState(false);
  const [showDeleteAuditModal, setShowDeleteAuditModal] = useState(false);
  const [deleteAuditConfig, setDeleteAuditConfig] = useState({ mode: 'day', date: '', month: '', count: 0, title: '' });
  const [deletingAudit, setDeletingAudit] = useState(false);

  // Modals & Forms
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [unbindReason, setUnbindReason] = useState('');
  const [showUnbindModal, setShowUnbindModal] = useState(false);

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [showTicketModal, setShowTicketModal] = useState(false);

  const [editAttendanceModal, setEditAttendanceModal] = useState(false);
  const [selectedAtt, setSelectedAtt] = useState(null);
  const [attEditForm, setAttEditForm] = useState({
    correction_type: 'both', // 'both' | 'in' | 'out'
    punch_in_time: '',
    punch_out_time: '',
    status: 'Present',
    reason: '',
    remarks: ''
  });

  // Attendance Support & Correction Extended State
  const [attSectionTab, setAttSectionTab] = useState('records'); // 'records' | 'requests'
  const [attCorrectionRequests, setAttCorrectionRequests] = useState([]);
  const [attDateFilter, setAttDateFilter] = useState('');
  const [attSearch, setAttSearch] = useState('');
  const [showManualPunchModal, setShowManualPunchModal] = useState(false);
  const [employeesList, setEmployeesList] = useState([]);
  const [manualPunchForm, setManualPunchForm] = useState({
    employee_id: '',
    date: new Date().toISOString().slice(0, 10),
    correction_type: 'both',
    punch_in_time: '09:00:00',
    punch_out_time: '18:00:00',
    status: 'Present',
    reason: '',
    remarks: ''
  });

  // On-Demand Attendance Filter States (no auto load on mount)
  const [attHasFiltered, setAttHasFiltered] = useState(false);
  const [attFilterLoading, setAttFilterLoading] = useState(false);
  const [attFilterDate, setAttFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [attFilterCompany, setAttFilterCompany] = useState('all');
  const [attFilterScope, setAttFilterScope] = useState('all'); // 'all' | 'single' | 'multiple'
  const [attFilterEmpId, setAttFilterEmpId] = useState('');
  const [attFilterEmpIds, setAttFilterEmpIds] = useState([]);
  const [attFilterStatus, setAttFilterStatus] = useState('all');
  const [attEmpSearchQuery, setAttEmpSearchQuery] = useState('');

  // Universal Section Pagination States (Default 10 rows per page)
  const [attPage, setAttPage] = useState(1);
  const [attPageSize, setAttPageSize] = useState(10);

  const [crPage, setCrPage] = useState(1);
  const [crPageSize, setCrPageSize] = useState(10);

  const [susPage, setSusPage] = useState(1);
  const [susPageSize, setSusPageSize] = useState(10);

  const [devPage, setDevPage] = useState(1);
  const [devPageSize, setDevPageSize] = useState(10);

  const [tktPage, setTktPage] = useState(1);
  const [tktPageSize, setTktPageSize] = useState(10);

  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);

  // --- UNIVERSAL SEARCH ON ALL PAGES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const searchContainerRef = useRef(null);

  // User Diagnostics & Resolution Hub Modal
  const [selectedUserDiag, setSelectedUserDiag] = useState(null);
  const [userDiagTab, setUserDiagTab] = useState('requirements'); // 'requirements', 'device', 'tickets', 'attendance'
  const [updateProfileForm, setUpdateProfileForm] = useState({
    email: '',
    mobile: '',
    status: 'active',
    password: '',
    reason: ''
  });
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // Quick Ticket Creation from Support Hub
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [newTicketForm, setNewTicketForm] = useState({
    request_type: 'account_problem',
    title: '',
    description: ''
  });

  // --- LEVEL 4 REMOTE ACCESS CONSOLE ---
  const [remoteTargets, setRemoteTargets] = useState([]);
  const [remoteTargetUsers, setRemoteTargetUsers] = useState([]);
  const [remoteSelectedUser, setRemoteSelectedUser] = useState(null);
  const [remoteDiagnostics, setRemoteDiagnostics] = useState(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteSearch, setRemoteSearch] = useState('');
  const [remoteSessionPin, setRemoteSessionPin] = useState(null);
  const [remoteSessionActive, setRemoteSessionActive] = useState(false);
  const [remoteActionExecuting, setRemoteActionExecuting] = useState(false);
  const [remoteShowAlertModal, setRemoteShowAlertModal] = useState(false);
  const [remoteAlertData, setRemoteAlertData] = useState({ title: '', message: '' });
  const [remoteSimulatePortal, setRemoteSimulatePortal] = useState(false);

  // --- REMOTE MANAGED CONSOLE (COMPANY / MANAGER / EMPLOYEE) ---
  const [remotePerspective, setRemotePerspective] = useState('employee'); // Default to employee perspective
  // Sub-Page Navigation Tabs for each Perspective
  const [remoteEmpTab, setRemoteEmpTab] = useState('dashboard'); // 'dashboard' | 'calendar' | 'attendance-logs' | 'corrections' | 'leaves' | 'tickets' | 'profile'
  const [remoteMgrTab, setRemoteMgrTab] = useState('dashboard'); // 'dashboard' | 'team' | 'attendance-logs' | 'corrections' | 'leaves' | 'my-attendance' | 'tickets' | 'profile'
  const [remoteCompTab, setRemoteCompTab] = useState('dashboard'); // 'dashboard' | 'directory' | 'attendance' | 'corrections' | 'leaves' | 'shifts-geofences' | 'tickets' | 'settings'

  // Ticket Modal & Password Reset States
  const [remoteShowTicketModal, setRemoteShowTicketModal] = useState(false);
  const [remoteTicketForm, setRemoteTicketForm] = useState({
    employee_id: '',
    request_type: 'general_support',
    title: '',
    description: ''
  });
  const [remoteNewPassword, setRemoteNewPassword] = useState('');
  const [remoteCompSearch, setRemoteCompSearch] = useState('');
  const [remoteAttDateFilter, setRemoteAttDateFilter] = useState('');

  // Attendance Correction Modal State
  const [remoteShowCorrectionModal, setRemoteShowCorrectionModal] = useState(false);
  const [remoteCorrectionForm, setRemoteCorrectionForm] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    correction_type: 'both',
    punch_in_time: '09:30:00',
    punch_out_time: '18:30:00',
    requested_status: 'Present',
    reason: '',
    flow: 'route_to_mapping' // 'route_to_mapping' | 'auto_approve'
  }); // 'company' | 'manager' | 'employee'
  const [remoteCompanyData, setRemoteCompanyData] = useState(null);
  const [remoteCompanyLoading, setRemoteCompanyLoading] = useState(false);
  const [remoteSelectedEmpId, setRemoteSelectedEmpId] = useState(null);
  const [remoteEmployeeData, setRemoteEmployeeData] = useState(null);
  const [remoteEmployeeLoading, setRemoteEmployeeLoading] = useState(false);
  const [remoteSelectedMgrId, setRemoteSelectedMgrId] = useState(null);

  // Modals for Remote Actions
  const [remoteShowLeaveModal, setRemoteShowLeaveModal] = useState(false);
  const [remoteLeaveForm, setRemoteLeaveForm] = useState({
    employee_id: '',
    leave_type_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    total_days: 1,
    reason: '',
    auto_approve: true
  });

  const [remoteShowBalanceModal, setRemoteShowBalanceModal] = useState(false);
  const [remoteBalanceForm, setRemoteBalanceForm] = useState({
    employee_id: '',
    leave_type_id: '',
    action_type: 'credit',
    days: 1,
    reason: ''
  });

  const [remoteShowPunchModal, setRemoteShowPunchModal] = useState(false);
  const [remotePunchForm, setRemotePunchForm] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    punch_in_time: '09:30:00',
    punch_out_time: '18:30:00',
    status: 'Present',
    total_hours: 9,
    reason: ''
  });

  const [remoteShowEditProfileModal, setRemoteShowEditProfileModal] = useState(false);
  const [remoteProfileForm, setRemoteProfileForm] = useState({
    id: null,
    full_name: '',
    mobile: '',
    email: '',
    department: '',
    designation: '',
    shift_id: '',
    geofence_id: '',
    status: 'active'
  });

  const [remoteShowDeleteModal, setRemoteShowDeleteModal] = useState(false);
  const [remoteDeleteTarget, setRemoteDeleteTarget] = useState(null); // { type: 'leave'|'attendance'|'employee', id, title, subtitle }
  const [remoteDeleting, setRemoteDeleting] = useState(false);

  const rawLvl = user?.permission_level ?? user?.permissionLevel ?? user?.supportLevel ?? user?.support_level ?? 1;
  const pLevel = user?.role === 'super_admin' ? 4 : (typeof rawLvl === 'number' ? rawLvl : parseInt(String(rawLvl).replace(/\D/g, '') || '1', 10));
  const canAccessAuditLogs = user?.role === 'super_admin' || (user?.enable_audit_logs !== false && user?.enable_audit_logs !== 0);

  const fetchAuditReports = async () => {
    if (!canAccessAuditLogs) return;
    setAuditLoading(true);
    try {
      const q = [];
      if (auditView) q.push(`view=${auditView}`);
      if (auditDayFilter) q.push(`date=${auditDayFilter}`);
      if (auditMonthFilter) q.push(`month=${auditMonthFilter}`);
      if (auditActionFilter) q.push(`action=${encodeURIComponent(auditActionFilter)}`);
      if (selectedCompanyId && selectedCompanyId !== 'all') q.push(`company_id=${selectedCompanyId}`);
      if (auditSearch.trim()) q.push(`search=${encodeURIComponent(auditSearch.trim())}`);
      q.push('limit=200');

      const res = await apiRequest(`/support/audit-reports?${q.join('&')}`);
      setAuditLogs(res.logs || []);
      if (res.counts) {
        setAuditCounts(res.counts);
      }
    } catch (err) {
      console.error('Failed to fetch audit reports:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if ((activeTab === 'audit-reports' || activeTab === 'audit-logs') && canAccessAuditLogs) {
      fetchAuditReports();
    }
  }, [activeTab, auditView, auditDayFilter, auditMonthFilter, auditActionFilter, selectedCompanyId, canAccessAuditLogs]);

  const handleApplyAttendanceFilter = async () => {
    if (!attFilterDate) {
      setError('Target date is mandatory for attendance query.');
      return;
    }
    setAttFilterLoading(true);
    setError('');
    try {
      const q = [`date=${attFilterDate}`];
      if (attFilterCompany && attFilterCompany !== 'all') {
        q.push(`company_id=${attFilterCompany}`);
      } else if (selectedCompanyId && selectedCompanyId !== 'all') {
        q.push(`company_id=${selectedCompanyId}`);
      }
      if (attFilterScope === 'single' && attFilterEmpId) {
        q.push(`employee_id=${attFilterEmpId}`);
      } else if (attFilterScope === 'multiple' && attFilterEmpIds.length > 0) {
        q.push(`employee_ids=${attFilterEmpIds.join(',')}`);
      }
      if (attFilterStatus && attFilterStatus !== 'all') {
        q.push(`status=${attFilterStatus}`);
      }
      if (attSearch.trim()) {
        q.push(`search=${encodeURIComponent(attSearch.trim())}`);
      }
      q.push('limit=500');

      const res = await apiRequest(`/attendance/list?${q.join('&')}`);
      setAttendanceRecords(res.records || []);
      setAttHasFiltered(true);
      setAttPage(1);
    } catch (err) {
      setError(err.message || 'Failed to fetch attendance records.');
    } finally {
      setAttFilterLoading(false);
    }
  };

  const triggerDeleteAudit = (mode, date = '', month = '', title = '', count = 0) => {
    setDeleteAuditConfig({ mode, date, month, title, count });
    setShowDeleteAuditModal(true);
  };

  const confirmDeleteAudit = async () => {
    setDeletingAudit(true);
    try {
      const res = await apiRequest('/support/audit-logs', {
        method: 'DELETE',
        body: {
          mode: deleteAuditConfig.mode,
          date: deleteAuditConfig.date || undefined,
          month: deleteAuditConfig.month || undefined,
          id: deleteAuditConfig.id || undefined,
          view: auditView,
          action: auditActionFilter || undefined,
          company_id: selectedCompanyId !== 'all' ? selectedCompanyId : undefined,
          search: auditSearch.trim() || undefined
        }
      });
      setSuccess(res.message || 'Audit logs deleted successfully.');
      setShowDeleteAuditModal(false);
      fetchAuditReports();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to delete audit logs.');
    } finally {
      setDeletingAudit(false);
    }
  };

  const handleDeleteSingleLog = async (logId) => {
    if (!window.confirm(`Permanently delete audit log entry #${logId}?`)) return;
    try {
      const res = await apiRequest('/support/audit-logs', {
        method: 'DELETE',
        body: { mode: 'single', id: logId }
      });
      setSuccess(res.message || 'Log entry deleted.');
      fetchAuditReports();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to delete log entry.');
    }
  };

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // Load companies list for multi-tenant company switcher
      try {
        const compRes = await apiRequest('/companies');
        const compList = compRes.companies || [];
        setCompanies(compList);
        if (compList.length === 1 && selectedCompanyId === 'all') {
          setSelectedCompanyId(String(compList[0].id));
        }
      } catch (e) {}

      const compParam = selectedCompanyId && selectedCompanyId !== 'all' ? `company_id=${selectedCompanyId}` : '';
      const buildUrl = (base, extra = '') => {
        const queryParts = [];
        if (compParam) queryParts.push(compParam);
        if (extra) queryParts.push(extra);
        return queryParts.length > 0 ? `${base}?${queryParts.join('&')}` : base;
      };

      if (activeTab === 'device-support' || activeTab === 'dashboard') {
        const res = await apiRequest(buildUrl('/support/devices'));
        setDevices(res.devices || []);
      }
      if (activeTab === 'dashboard') {
        const res = await apiRequest(buildUrl('/tickets/service-requests', 'view=active'));
        // Strictly exclude closed/resolved and archived tickets from Support Dashboard
        setTickets((res.requests || []).filter(t => t.status !== 'closed' && t.status !== 'resolved' && !t.is_archived));
      } else if (activeTab === 'tickets') {
        const res = await apiRequest(buildUrl('/tickets/service-requests', 'view=all'));
        setTickets(res.requests || []);
      }
      if (activeTab === 'account-enable') {
        fetchSuspendedAccounts();
      }
      if (activeTab === 'attendance-support') {
        try {
          const crRes = await apiRequest('/attendance/correction-requests');
          setAttCorrectionRequests(crRes.requests || []);
        } catch (e) {}
        try {
          const empRes = await apiRequest(buildUrl('/employees', 'limit=500'));
          setEmployeesList(empRes.employees || []);
        } catch (e) {}
        if (attHasFiltered) {
          handleApplyAttendanceFilter();
        }
      }
      if ((activeTab === 'audit-reports' || activeTab === 'audit-logs' || activeTab === 'dashboard') && canAccessAuditLogs) {
        fetchAuditReports();
      }
      if (activeTab === 'remote-access') {
        const targetCompId = (selectedCompanyId && selectedCompanyId !== 'all') ? selectedCompanyId : undefined;
        fetchRemoteCompanyData(targetCompId);
        if (pLevel >= 4) {
          fetchRemoteTargets();
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePermanentDeleteTicket = async (ticketId) => {
    if (!window.confirm(`Are you sure you want to permanently delete Ticket #${ticketId}? This will permanently delete all ticket history from the database and remove it from all user accounts (Employee, Manager, Company Admin). This cannot be undone.`)) {
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest(`/tickets/service-requests/${ticketId}`, { method: 'DELETE' });
      setTickets(prev => prev.filter(t => t.id !== ticketId));
      setSuccess(res.message || `Ticket #${ticketId} permanently deleted.`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to delete ticket.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuspendedAccounts = async (queryText = suspendedSearch) => {
    setSuspendedLoading(true);
    try {
      const compParam = selectedCompanyId && selectedCompanyId !== 'all' ? `company_id=${selectedCompanyId}&` : '';
      const sParam = queryText ? `search=${encodeURIComponent(queryText)}` : '';
      const res = await apiRequest(`/support/suspended-accounts?${compParam}${sParam}`);
      setSuspendedAccounts(res.accounts || []);
    } catch (err) {
      setError(err.message || 'Failed to load suspended accounts.');
    } finally {
      setSuspendedLoading(false);
    }
  };

  const handleEnableAccount = async (account) => {
    const targetId = account.employee_id || account.user_id;
    if (!targetId) return;
    setEnablingId(targetId);
    try {
      const res = await apiRequest(`/support/enable-account/${targetId}`, { method: 'POST' });
      setSuccess(res.message || `Account for "${account.full_name || account.username}" has been enabled successfully.`);
      setTimeout(() => setSuccess(''), 4000);
      await fetchSuspendedAccounts(suspendedSearch);
      window.dispatchEvent(new CustomEvent('master-refresh'));
    } catch (err) {
      setError(err.message || 'Failed to enable account.');
    } finally {
      setEnablingId(null);
    }
  };

  useEffect(() => {
    fetchData();

    const handleMasterRefresh = () => {
      fetchData();
    };
    window.addEventListener('master-refresh', handleMasterRefresh);
    return () => window.removeEventListener('master-refresh', handleMasterRefresh);
  }, [activeTab, selectedCompanyId, attDateFilter]);

  // --- UNIVERSAL INSTANT SEARCH LOGIC ---
  const handlePerformSearch = async (term) => {
    const q = term !== undefined ? term : searchQuery;
    if (!q || !q.trim()) {
      setSearchResults([]);
      setSearchDropdownOpen(false);
      return;
    }
    setIsSearching(true);
    try {
      const compParam = selectedCompanyId && selectedCompanyId !== 'all' ? `&company_id=${selectedCompanyId}` : '';
      const res = await apiRequest(`/support/search-user?q=${encodeURIComponent(q.trim())}${compParam}`);
      setSearchResults(res.results || []);
      setSearchDropdownOpen(true);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced live typing search
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      handlePerformSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCompanyId]);

  const handleOpenUserDiagnostics = (targetUser) => {
    setSelectedUserDiag(targetUser);
    setUserDiagTab('requirements');
    setUpdateProfileForm({
      email: targetUser.email || targetUser.user_email || '',
      mobile: targetUser.mobile || targetUser.user_mobile || '',
      status: targetUser.status || targetUser.user_status || 'active',
      password: '',
      reason: ''
    });
    setSearchDropdownOpen(false);
  };

  const handleSaveUserRequirements = async (e) => {
    e.preventDefault();
    if (!selectedUserDiag) return;
    if (!updateProfileForm.reason.trim()) {
      setError('Please provide a mandatory audit reason for updating user account requirements.');
      return;
    }

    setUpdatingProfile(true);
    setError('');
    try {
      const res = await apiRequest(`/support/update-user-profile/${selectedUserDiag.user_id}`, {
        method: 'PUT',
        body: updateProfileForm
      });
      setSuccess(res.message || 'User requirements updated successfully.');

      // Refresh diagnostic profile
      const updatedDiag = {
        ...selectedUserDiag,
        email: updateProfileForm.email,
        mobile: updateProfileForm.mobile,
        status: updateProfileForm.status
      };
      setSelectedUserDiag(updatedDiag);
      setUpdateProfileForm(prev => ({ ...prev, password: '', reason: '' }));
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to update user requirements.');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleCreateSupportTicket = async (e) => {
    e.preventDefault();
    if (!selectedUserDiag || !newTicketForm.title.trim()) return;
    try {
      await apiRequest('/tickets/service-request', {
        method: 'POST',
        body: {
          company_id: selectedUserDiag.company_id,
          employee_id: selectedUserDiag.employee_id,
          request_type: newTicketForm.request_type,
          title: newTicketForm.title.trim(),
          description: newTicketForm.description.trim() || 'Ticket raised by Support Desk on behalf of user.'
        }
      });
      setSuccess(`Support ticket created successfully for ${selectedUserDiag.full_name || selectedUserDiag.username}.`);
      setShowNewTicketModal(false);
      setNewTicketForm({ request_type: 'account_problem', title: '', description: '' });
      // Re-fetch search user to refresh tickets
      handlePerformSearch(selectedUserDiag.username);
    } catch (err) {
      setError(err.message || 'Failed to create ticket.');
    }
  };

  // --- LEVEL 4 REMOTE ACCESS LOGIC ---
  const fetchRemoteTargets = async () => {
    if (pLevel < 4) return;
    setRemoteLoading(true);
    try {
      const compParam = selectedCompanyId && selectedCompanyId !== 'all' ? `&company_id=${selectedCompanyId}` : '';
      const sParam = remoteSearch ? `&search=${encodeURIComponent(remoteSearch.trim())}` : '';
      const res = await apiRequest(`/support/remote/targets?${compParam}${sParam}`);
      setRemoteTargets(res.companies || []);
      setRemoteTargetUsers(res.targetUsers || []);
      if (!remoteSelectedUser && res.targetUsers?.length > 0) {
        handleSelectRemoteTarget(res.targetUsers[0]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoteLoading(false);
    }
  };

  const handleSelectRemoteTarget = async (target) => {
    setRemoteSelectedUser(target);
    setRemoteLoading(true);
    try {
      const res = await apiRequest(`/support/remote/diagnostics/${target.user_id}`);
      setRemoteDiagnostics(res);
      setRemoteSessionPin(null);
      setRemoteSessionActive(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoteLoading(false);
    }
  };

  const handleStartRemoteSession = async () => {
    if (!remoteSelectedUser) return;
    setRemoteActionExecuting(true);
    try {
      const res = await apiRequest('/support/remote/session', {
        method: 'POST',
        body: {
          user_id: remoteSelectedUser.user_id,
          reason: 'Level 4 Support Remote Online Diagnostic & Troubleshooting'
        }
      });
      setRemoteSessionPin(res.sessionPin);
      setRemoteSessionActive(true);
      setSuccess(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  const handleRemoteQuickAction = async (action, payload = {}) => {
    if (!remoteSelectedUser) return;
    setRemoteActionExecuting(true);
    try {
      const res = await apiRequest('/support/remote/quick-action', {
        method: 'POST',
        body: {
          user_id: remoteSelectedUser.user_id,
          action,
          payload,
          reason: `Support Level 4 Remote Action: ${action}`
        }
      });
      setSuccess(res.message);
      // Re-fetch diagnostics
      handleSelectRemoteTarget(remoteSelectedUser);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  const handleSendRemoteAlert = async (e) => {
    e.preventDefault();
    if (!remoteAlertData.title.trim() || !remoteAlertData.message.trim()) return;
    await handleRemoteQuickAction('send_alert', remoteAlertData);
    setRemoteShowAlertModal(false);
    setRemoteAlertData({ title: '', message: '' });
  };

  // --- REMOTE MULTI-PERSPECTIVE HANDLERS ---
  const fetchRemoteCompanyData = async (compId) => {
    let targetId = compId;
    if (!targetId || targetId === 'all') {
      try {
        let currentComps = companies;
        if (!currentComps || currentComps.length === 0) {
          const cRes = await apiRequest('/companies');
          currentComps = cRes.companies || [];
          setCompanies(currentComps);
        }
        if (currentComps.length > 0) {
          targetId = currentComps[0].id;
        }
      } catch (e) {}
    }
    if (!targetId || targetId === 'all') return;
    setRemoteCompanyLoading(true);
    try {
      const res = await apiRequest(`/support/remote/company/${targetId}/full-data`);
      setRemoteCompanyData(res);
      if (res.employees && res.employees.length > 0) {
        const found = res.employees.find(e => String(e.id) === String(remoteSelectedEmpId));
        if (!found) {
          setRemoteSelectedEmpId(res.employees[0].id);
          fetchRemoteEmployeeData(res.employees[0].id);
        }
      } else {
        setRemoteSelectedEmpId(null);
        setRemoteEmployeeData(null);
      }
      if (res.managers && res.managers.length > 0) {
        const foundMgr = res.managers.find(m => String(m.id) === String(remoteSelectedMgrId));
        if (!foundMgr) {
          setRemoteSelectedMgrId(res.managers[0].id);
        }
      } else {
        setRemoteSelectedMgrId(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch company remote data');
    } finally {
      setRemoteCompanyLoading(false);
    }
  };

  const fetchRemoteEmployeeData = async (empId) => {
    if (!empId) return;
    setRemoteEmployeeLoading(true);
    try {
      const res = await apiRequest(`/support/remote/employee/${empId}/full-data`);
      setRemoteEmployeeData(res);
    } catch (err) {
      setError(err.message || 'Failed to fetch employee remote data');
    } finally {
      setRemoteEmployeeLoading(false);
    }
  };

  // Attendance Correction Handlers
  const openRemoteCorrectionModal = (empId) => {
    const targetEmpId = empId || remoteSelectedEmpId || remoteCompanyData?.employees?.[0]?.id;
    setRemoteCorrectionForm({
      employee_id: targetEmpId || '',
      date: new Date().toISOString().split('T')[0],
      correction_type: 'both',
      punch_in_time: '09:30:00',
      punch_out_time: '18:30:00',
      requested_status: 'Present',
      reason: 'Biometric punch sync error, correction requested via Support',
      flow: 'route_to_mapping'
    });
    setRemoteShowCorrectionModal(true);
  };

  const handleRemoteSubmitCorrection = async (e) => {
    e.preventDefault();
    if (!remoteCorrectionForm.employee_id || !remoteCorrectionForm.date || !remoteCorrectionForm.reason.trim()) {
      setError('Employee, Date, and Reason are required.');
      return;
    }
    setRemoteActionExecuting(true);
    try {
      const res = await apiRequest('/support/remote/attendance-correction/submit', {
        method: 'POST',
        body: {
          ...remoteCorrectionForm,
          auto_approve: remoteCorrectionForm.flow === 'auto_approve'
        }
      });
      setSuccess(res.message || 'Attendance correction submitted successfully.');
      setRemoteShowCorrectionModal(false);
      if (remoteSelectedEmpId) fetchRemoteEmployeeData(remoteSelectedEmpId);
      if (remoteCompanyData?.company?.id) fetchRemoteCompanyData(remoteCompanyData.company.id);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to submit attendance correction.');
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  const handleRemoteReviewCorrection = async (crId, status, review_notes = '') => {
    setRemoteActionExecuting(true);
    try {
      const res = await apiRequest(`/support/remote/attendance-correction/${crId}/review`, {
        method: 'PUT',
        body: { status, review_notes }
      });
      setSuccess(res.message || `Correction request #${crId} ${status} successfully.`);
      if (remoteSelectedEmpId) fetchRemoteEmployeeData(remoteSelectedEmpId);
      if (remoteCompanyData?.company?.id) fetchRemoteCompanyData(remoteCompanyData.company.id);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to review correction request.');
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  const handleRemoteDeleteCorrection = async (crId) => {
    if (!window.confirm(`Permanently delete attendance correction request #${crId}? This cannot be undone.`)) {
      return;
    }
    setRemoteActionExecuting(true);
    try {
      const res = await apiRequest(`/support/remote/attendance-correction/${crId}`, {
        method: 'DELETE'
      });
      setSuccess(res.message || 'Correction request permanently deleted.');
      if (remoteSelectedEmpId) fetchRemoteEmployeeData(remoteSelectedEmpId);
      if (remoteCompanyData?.company?.id) fetchRemoteCompanyData(remoteCompanyData.company.id);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to delete correction request.');
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  const handleRemoteDeleteTicket = async (ticketId) => {
    if (!window.confirm(`Permanently delete ticket #${ticketId}? All message history will be destroyed.`)) {
      return;
    }
    setRemoteActionExecuting(true);
    try {
      const res = await apiRequest(`/tickets/service-requests/${ticketId}`, { method: 'DELETE' });
      setSuccess(res.message || `Ticket #${ticketId} permanently deleted.`);
      if (remoteSelectedEmpId) fetchRemoteEmployeeData(remoteSelectedEmpId);
      if (remoteCompanyData?.company?.id) fetchRemoteCompanyData(remoteCompanyData.company.id);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to delete ticket.');
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  // Ticket creation on behalf
  const openRemoteTicketModal = (empId) => {
    const targetEmpId = empId || remoteSelectedEmpId || remoteCompanyData?.employees?.[0]?.id;
    setRemoteTicketForm({
      employee_id: targetEmpId || '',
      request_type: 'general_support',
      title: '',
      description: 'Support ticket logged on user request via Remote Access Console'
    });
    setRemoteShowTicketModal(true);
  };

  const handleRemoteSubmitTicket = async (e) => {
    e.preventDefault();
    if (!remoteTicketForm.employee_id || !remoteTicketForm.title.trim()) {
      setError('Employee and Ticket Title are required.');
      return;
    }
    const targetEmp = (remoteCompanyData?.employees || []).find(emp => String(emp.id) === String(remoteTicketForm.employee_id)) || remoteEmployeeData?.employee;
    const cid = targetEmp?.company_id || remoteCompanyData?.company?.id;
    setRemoteActionExecuting(true);
    try {
      await apiRequest('/tickets/service-request', {
        method: 'POST',
        body: {
          company_id: cid,
          employee_id: remoteTicketForm.employee_id,
          request_type: remoteTicketForm.request_type,
          title: remoteTicketForm.title.trim(),
          description: remoteTicketForm.description.trim() || 'Logged via Support Remote Console'
        }
      });
      setSuccess('Service request ticket created successfully.');
      setRemoteShowTicketModal(false);
      if (remoteSelectedEmpId) fetchRemoteEmployeeData(remoteSelectedEmpId);
      if (remoteCompanyData?.company?.id) fetchRemoteCompanyData(remoteCompanyData.company.id);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to create service ticket.');
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  const handleRemoteResetPassword = async (userId, userName) => {
    if (!remoteNewPassword.trim()) {
      setError('Please specify a new password.');
      return;
    }
    if (!window.confirm(`Reset login password for "${userName}"?`)) return;
    setRemoteActionExecuting(true);
    try {
      await apiRequest(`/support/update-user-profile/${userId}`, {
        method: 'PUT',
        body: {
          password: remoteNewPassword.trim(),
          reason: 'Password reset by Support Authority via Remote Access Console'
        }
      });
      setSuccess(`Password for ${userName} reset successfully.`);
      setRemoteNewPassword('');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  const handleRemoteSelectEmployee = (empId) => {
    setRemoteSelectedEmpId(empId);
    fetchRemoteEmployeeData(empId);
  };

  // Leave Actions
  const openRemoteApplyLeaveModal = (empId) => {
    const targetEmpId = empId || remoteSelectedEmpId || remoteCompanyData?.employees?.[0]?.id;
    const defaultTypeId = remoteCompanyData?.leaveTypes?.[0]?.id || '';
    setRemoteLeaveForm({
      employee_id: targetEmpId || '',
      leave_type_id: defaultTypeId,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0],
      total_days: 1,
      reason: 'Applied via Support Authority on user request',
      flow: 'route_to_mapping',
      auto_approve: false
    });
    setRemoteShowLeaveModal(true);
  };

  const handleRemoteSubmitLeave = async (e) => {
    e.preventDefault();
    if (!remoteLeaveForm.employee_id || !remoteLeaveForm.leave_type_id) {
      setError('Employee and Leave Type are required.');
      return;
    }
    setRemoteActionExecuting(true);
    try {
      const res = await apiRequest('/support/remote/leave/apply', {
        method: 'POST',
        body: {
          ...remoteLeaveForm,
          auto_approve: remoteLeaveForm.flow === 'auto_approve' || remoteLeaveForm.auto_approve === true
        }
      });
      setSuccess(res.message || 'Leave applied successfully by Support.');
      setRemoteShowLeaveModal(false);
      if (remoteLeaveForm.employee_id === remoteSelectedEmpId) {
        fetchRemoteEmployeeData(remoteSelectedEmpId);
      }
      if (remoteCompanyData?.company?.id) {
        fetchRemoteCompanyData(remoteCompanyData.company.id);
      }
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to apply leave.');
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  const handleRemoteUpdateLeaveStatus = async (leaveId, status, notes = 'Processed by Support') => {
    setRemoteActionExecuting(true);
    try {
      const res = await apiRequest(`/support/remote/leave/${leaveId}/status`, {
        method: 'PUT',
        body: { status, notes }
      });
      setSuccess(res.message || `Leave ${status} successfully.`);
      if (remoteSelectedEmpId) fetchRemoteEmployeeData(remoteSelectedEmpId);
      if (remoteCompanyData?.company?.id) fetchRemoteCompanyData(remoteCompanyData.company.id);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to update leave status.');
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  const handleRemoteDeleteLeave = async (leaveId) => {
    if (!window.confirm('Permanently delete this leave request? If it was approved, deducted days will be refunded to employee balance.')) {
      return;
    }
    setRemoteActionExecuting(true);
    try {
      const res = await apiRequest(`/support/remote/leave/${leaveId}`, {
        method: 'DELETE'
      });
      setSuccess(res.message || 'Leave request permanently deleted and balances restored.');
      if (remoteSelectedEmpId) fetchRemoteEmployeeData(remoteSelectedEmpId);
      if (remoteCompanyData?.company?.id) fetchRemoteCompanyData(remoteCompanyData.company.id);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to delete leave request.');
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  // Balance Adjustment
  const openRemoteAdjustBalanceModal = (empId, leaveTypeId) => {
    const targetEmpId = empId || remoteSelectedEmpId;
    const defaultTypeId = leaveTypeId || remoteCompanyData?.leaveTypes?.[0]?.id || '';
    setRemoteBalanceForm({
      employee_id: targetEmpId || '',
      leave_type_id: defaultTypeId,
      action_type: 'credit',
      days: 1,
      reason: 'Balance adjustment processed by Support'
    });
    setRemoteShowBalanceModal(true);
  };

  const handleRemoteSubmitBalance = async (e) => {
    e.preventDefault();
    if (!remoteBalanceForm.employee_id || !remoteBalanceForm.leave_type_id) {
      setError('Employee and Leave Type are required.');
      return;
    }
    setRemoteActionExecuting(true);
    try {
      const res = await apiRequest('/support/remote/leave/adjust-balance', {
        method: 'POST',
        body: remoteBalanceForm
      });
      setSuccess(res.message || 'Leave balance updated successfully.');
      setRemoteShowBalanceModal(false);
      if (remoteSelectedEmpId) fetchRemoteEmployeeData(remoteSelectedEmpId);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to adjust balance.');
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  // Punch Attendance
  const openRemotePunchModal = (empId) => {
    const targetEmpId = empId || remoteSelectedEmpId;
    setRemotePunchForm({
      employee_id: targetEmpId || '',
      date: new Date().toISOString().split('T')[0],
      punch_in_time: '09:30:00',
      punch_out_time: '18:30:00',
      status: 'Present',
      total_hours: 9,
      reason: 'Punch marked/corrected by Support Remote Console'
    });
    setRemoteShowPunchModal(true);
  };

  const handleRemoteSubmitPunch = async (e) => {
    e.preventDefault();
    if (!remotePunchForm.employee_id || !remotePunchForm.date) {
      setError('Employee and Date are required.');
      return;
    }
    setRemoteActionExecuting(true);
    try {
      const res = await apiRequest('/support/remote/attendance/record', {
        method: 'POST',
        body: remotePunchForm
      });
      setSuccess(res.message || 'Attendance punch recorded successfully.');
      setRemoteShowPunchModal(false);
      if (remoteSelectedEmpId) fetchRemoteEmployeeData(remoteSelectedEmpId);
      if (remoteCompanyData?.company?.id) fetchRemoteCompanyData(remoteCompanyData.company.id);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to record attendance.');
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  const handleRemoteDeleteAttendance = async (attId) => {
    if (!window.confirm('Permanently delete this attendance record? This action will sync to cloud and cannot be undone.')) {
      return;
    }
    setRemoteActionExecuting(true);
    try {
      const res = await apiRequest(`/support/remote/attendance/${attId}`, {
        method: 'DELETE',
        body: { reason: 'Deleted by Support Remote Console' }
      });
      setSuccess(res.message || 'Attendance record permanently deleted.');
      if (remoteSelectedEmpId) fetchRemoteEmployeeData(remoteSelectedEmpId);
      if (remoteCompanyData?.company?.id) fetchRemoteCompanyData(remoteCompanyData.company.id);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to delete attendance record.');
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  // Profile Edit
  const openRemoteEditProfileModal = (emp) => {
    setRemoteProfileForm({
      id: emp.id,
      full_name: emp.full_name || emp.fullName || '',
      mobile: emp.mobile || '',
      email: emp.email || '',
      department: emp.department || '',
      designation: emp.designation || '',
      shift_id: emp.shift_id || emp.shiftId || '',
      geofence_id: emp.geofence_id || emp.geofenceId || '',
      status: emp.status || 'active'
    });
    setRemoteShowEditProfileModal(true);
  };

  const handleRemoteSubmitProfile = async (e) => {
    e.preventDefault();
    if (!remoteProfileForm.id) return;
    setRemoteActionExecuting(true);
    try {
      const res = await apiRequest(`/support/remote/employee/${remoteProfileForm.id}/profile`, {
        method: 'PUT',
        body: remoteProfileForm
      });
      setSuccess(res.message || 'Employee profile updated successfully.');
      setRemoteShowEditProfileModal(false);
      if (remoteSelectedEmpId) fetchRemoteEmployeeData(remoteSelectedEmpId);
      if (remoteCompanyData?.company?.id) fetchRemoteCompanyData(remoteCompanyData.company.id);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to update employee profile.');
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  // Permanent Delete Employee
  const handleRemoteConfirmDeleteEmployee = async (empId, empName) => {
    if (!window.confirm(`PERMANENT DELETION WARNING:\nAre you sure you want to permanently delete "${empName}" (ID: ${empId})?\nThis creates a permanent zero-recovery tombstone across SQLite, Firestore, and Realtime Database. All punch records, leaves, device bindings, and accounts will be permanently destroyed.`)) {
      return;
    }
    setRemoteActionExecuting(true);
    try {
      const res = await apiRequest(`/support/remote/employee/${empId}`, {
        method: 'DELETE',
        body: { reason: `Permanently deleted by Support Authority (Level ${pLevel}) upon request.` }
      });
      setSuccess(res.message || 'Employee account permanently deleted.');
      if (remoteSelectedEmpId === empId) {
        setRemoteSelectedEmpId(null);
        setRemoteEmployeeData(null);
      }
      if (remoteCompanyData?.company?.id) {
        fetchRemoteCompanyData(remoteCompanyData.company.id);
      }
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to permanently delete employee.');
    } finally {
      setRemoteActionExecuting(false);
    }
  };

  // --- GENERAL HANDLERS ---
  const handleUnbind = async () => {
    if (!selectedDevice || !unbindReason.trim()) {
      setError('Please specify a valid unbind reason.');
      return;
    }

    try {
      await apiRequest('/support/unbind-device', {
        method: 'POST',
        body: {
          user_id: selectedDevice.user_id,
          reason: unbindReason.trim()
        }
      });
      setSuccess(`Device unbound successfully for ${selectedDevice.full_name || selectedDevice.username}.`);
      setShowUnbindModal(false);
      setUnbindReason('');
      fetchData();
      if (selectedUserDiag && selectedUserDiag.user_id === selectedDevice.user_id) {
        setSelectedUserDiag(prev => ({ ...prev, device: null }));
      }
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
          resolution_notes: resolutionNotes.trim()
        }
      });
      setSuccess(`Ticket #${selectedTicket.id} marked as ${status}.`);
      setShowTicketModal(false);
      setResolutionNotes('');
      fetchData();
      if (selectedUserDiag) {
        handlePerformSearch(selectedUserDiag.username);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeregisterAndCloseTicket = async (ticket) => {
    if (!ticket) return;
    try {
      await apiRequest(`/tickets/service-requests/${ticket.id}/resolve`, {
        method: 'PUT',
        body: {
          status: 'resolved',
          unbind_device: true,
          resolution_notes: 'Device deregistered by Support Team. Employee can now log in and bind new device.'
        }
      });
      setSuccess(`Device deregistered and Ticket #${ticket.id} closed successfully.`);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to deregister device and close ticket.');
    }
  };

  const handleSaveAttendanceCorrection = async (e) => {
    e.preventDefault();
    if (!attEditForm.reason.trim()) {
      setError('Audit reason is mandatory for attendance correction.');
      return;
    }

    try {
      const mode = attEditForm.correction_type || 'both';
      const payload = {
        reason: attEditForm.reason.trim(),
        remarks: attEditForm.remarks || undefined,
        status: attEditForm.status
      };

      if (mode === 'in' || mode === 'both') {
        payload.punch_in_time = attEditForm.punch_in_time || null;
      }
      if (mode === 'out' || mode === 'both') {
        payload.punch_out_time = attEditForm.punch_out_time || null;
      }

      if (selectedAtt?.id) {
        await apiRequest(`/attendance/correct/${selectedAtt.id}`, {
          method: 'PUT',
          body: payload
        });
      } else if (selectedAtt?.employee_id && selectedAtt?.date) {
        await apiRequest('/attendance/manual', {
          method: 'POST',
          body: {
            ...payload,
            employee_id: selectedAtt.employee_id,
            date: selectedAtt.date,
            company_id: selectedAtt.company_id
          }
        });
      } else {
        throw new Error('No attendance record selected.');
      }

      setSuccess('Attendance record corrected and audit log recorded.');
      setEditAttendanceModal(false);
      fetchData();
      if (attHasFiltered) {
        handleApplyAttendanceFilter();
      }
      if (selectedUserDiag) {
        handlePerformSearch(selectedUserDiag.username);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveManualPunch = async (e) => {
    e.preventDefault();
    if (!manualPunchForm.employee_id) {
      setError('Please select an employee.');
      return;
    }
    if (!manualPunchForm.date) {
      setError('Attendance date is required.');
      return;
    }
    if (!manualPunchForm.reason.trim()) {
      setError('Audit reason is mandatory for manual attendance adjustment.');
      return;
    }

    try {
      const mode = manualPunchForm.correction_type || 'both';
      const payload = {
        employee_id: manualPunchForm.employee_id,
        date: manualPunchForm.date,
        status: manualPunchForm.status,
        reason: manualPunchForm.reason.trim(),
        remarks: manualPunchForm.remarks || undefined
      };

      if (mode === 'in' || mode === 'both') {
        payload.punch_in_time = manualPunchForm.punch_in_time || null;
      }
      if (mode === 'out' || mode === 'both') {
        payload.punch_out_time = manualPunchForm.punch_out_time || null;
      }

      await apiRequest('/attendance/manual', {
        method: 'POST',
        body: payload
      });

      setSuccess('Manual attendance/punch recorded successfully.');
      setShowManualPunchModal(false);
      setManualPunchForm({
        employee_id: '',
        date: new Date().toISOString().slice(0, 10),
        correction_type: 'both',
        punch_in_time: '09:00:00',
        punch_out_time: '18:00:00',
        status: 'Present',
        reason: '',
        remarks: ''
      });
      fetchData();
      if (attHasFiltered) {
        handleApplyAttendanceFilter();
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReviewCorrectionRequest = async (requestId, decision) => {
    try {
      await apiRequest(`/attendance/correction-requests/${requestId}/review`, {
        method: 'PUT',
        body: {
          status: decision,
          review_notes: `Processed by Support Authority (Level ${pLevel})`
        }
      });
      setSuccess(`Correction request #${requestId} ${decision === 'approved' ? 'approved' : 'rejected'} successfully.`);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER & COMPANY SELECTOR */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {activeTab === 'dashboard'
                ? `Welcome, ${user.fullName || user.username} (Dashboard)`
                : activeTab === 'remote-access'
                ? 'Online Remote Access & Diagnostic Console'
                : 'Support Operations Hub'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
              Authority Level {pLevel}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Multi-company operational assistance, instant identity search, device unlock, attendance corrections, and remote troubleshooting
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
            <Building2 className="w-4 h-4 text-purple-600 shrink-0" />
            <span className="text-xs font-medium text-slate-500">Company:</span>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="text-xs font-semibold text-slate-800 bg-transparent border-none focus:outline-none cursor-pointer"
            >
              {companies.length !== 1 && <option value="all">All Companies</option>}
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.legal_name || c.name || c.company_code}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* UNIVERSAL SEARCH BAR ACROSS ALL PAGES (Username, Phone No., or Email ID) */}
      {/* ========================================================================= */}
      <div className="relative z-30" ref={searchContainerRef}>
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2 transition-all focus-within:ring-2 focus-within:ring-purple-500/20 focus-within:border-purple-500">
          <div className="pl-2 text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchDropdownOpen(true);
            }}
            onFocus={() => {
              if (searchResults.length > 0) setSearchDropdownOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handlePerformSearch();
              }
            }}
            placeholder="Search by Username, Phone No. (Mobile), or Email ID for instant troubleshooting & updates..."
            className="w-full text-xs font-medium text-slate-900 placeholder:text-slate-400 bg-transparent focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setSearchDropdownOpen(false);
              }}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => handlePerformSearch()}
            disabled={isSearching}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all flex items-center gap-1.5 shrink-0"
          >
            {isSearching ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            <span>Search</span>
          </button>
        </div>

        {/* INSTANT SEARCH RESULTS DROPDOWN */}
        {searchDropdownOpen && searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 max-h-96 overflow-y-auto z-50">
            <div className="p-2.5 bg-slate-50/80 px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Matching Users & Staff ({searchResults.length})</span>
              <span className="text-[10px] text-purple-600 font-semibold">Click to View Issue Diagnostics & Update Requirements</span>
            </div>
            {searchResults.map((item) => (
              <div
                key={item.user_id}
                onClick={() => handleOpenUserDiagnostics(item)}
                className="p-3 px-4 hover:bg-purple-50/50 cursor-pointer flex items-center justify-between transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 text-purple-700 group-hover:bg-purple-600 group-hover:text-white flex items-center justify-center font-bold text-xs transition-colors shrink-0">
                    {(item.full_name || item.username)[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 group-hover:text-purple-700">
                        {item.full_name || item.username}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                        {item.role_name}
                      </span>
                      {item.company_name && (
                        <span className="text-[11px] text-purple-700 font-semibold">
                          • {item.company_name}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-0.5 font-mono">
                      <span>@{item.username}</span>
                      {item.mobile && (
                        <span className="flex items-center gap-1 text-slate-700 font-medium">
                          <Phone className="w-3 h-3 text-purple-500" /> {item.mobile}
                        </span>
                      )}
                      {item.email && (
                        <span className="flex items-center gap-1 text-slate-700 font-medium">
                          <Mail className="w-3 h-3 text-sky-500" /> {item.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    item.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {item.status}
                  </span>
                  <button
                    type="button"
                    className="px-3 py-1 bg-purple-100 text-purple-700 font-bold rounded-lg text-xs group-hover:bg-purple-600 group-hover:text-white transition-all shadow-xs"
                  >
                    Diagnose & Update
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {searchDropdownOpen && searchQuery && searchResults.length === 0 && !isSearching && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 p-6 text-center z-50">
            <AlertCircle className="w-6 h-6 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-700">No account matching "{searchQuery}"</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Try searching by exact username, 10-digit phone number, or full email address.</p>
          </div>
        )}
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

      {/* ========================================================================= */}
      {/* DASHBOARD TAB SUMMARY */}
      {/* ========================================================================= */}
      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${canAccessAuditLogs ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
            <div
              onClick={() => onSelectTab && onSelectTab('device-support')}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group"
              title="Click to view bound employee devices"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bound Devices</span>
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600 group-hover:bg-purple-100 transition-colors">
                  <Laptop className="w-5 h-5" />
                </div>
              </div>
              <p className="text-3xl font-black text-slate-900 mt-2">{devices.length}</p>
              <p className="text-[11px] text-slate-400 mt-1">Single-device locked accounts</p>
            </div>

            <div
              onClick={() => onSelectTab && onSelectTab('tickets')}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-sky-300 hover:shadow-md transition-all cursor-pointer group"
              title="Click to view pending service tickets"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Tickets</span>
                <div className="p-2 rounded-xl bg-sky-50 text-sky-600 group-hover:bg-sky-100 transition-colors">
                  <Ticket className="w-5 h-5" />
                </div>
              </div>
              <p className="text-3xl font-black text-slate-900 mt-2">
                {tickets.filter(t => t.status !== 'closed' && t.status !== 'resolved' && !t.is_archived).length}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Pending user service requests</p>
            </div>

            {canAccessAuditLogs && (
              <div
                onClick={() => onSelectTab && onSelectTab('audit-reports')}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group"
                title="Click to view audited operations"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Support Action Logs</span>
                  <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
                    <Clock className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-3xl font-black text-slate-900 mt-2">{auditLogs.length}</p>
                <p className="text-[11px] text-slate-400 mt-1">Audited operations</p>
              </div>
            )}

            <div
              onClick={() => onSelectTab && onSelectTab('remote-access')}
              className="bg-gradient-to-br from-purple-900 to-indigo-950 text-white p-5 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer group"
              title="Click to access Remote Console"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-200 uppercase tracking-wider">Remote Access</span>
                <div className="p-2 rounded-xl bg-white/10 text-purple-200 group-hover:bg-white/20 transition-colors">
                  <Radio className="w-5 h-5 text-purple-300 animate-pulse" />
                </div>
              </div>
              <p className="text-2xl font-black mt-2">{pLevel >= 4 ? 'Level 4 Unlocked' : `Level ${pLevel} Active`}</p>
              <p className="text-[11px] text-purple-200 mt-1">
                {pLevel >= 4 ? 'Online Remote Console Enabled' : 'Level 4 Clearance Required'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DEVICE SUPPORT & UNLOCK */}
      {/* ========================================================================= */}
      {activeTab === 'device-support' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Registered Employee Devices</h3>
              <p className="text-[11px] text-slate-400">1 Account = 1 Device Rule Enforcement</p>
            </div>
            <span className="text-xs text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg font-semibold">
              Single-Device Lock Active
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">Device Name & Type</th>
                  <th className="p-3">Locked MAC Address</th>
                  <th className="p-3">Device Fingerprint</th>
                  <th className="p-3">Last Login IP</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.slice((devPage - 1) * devPageSize, devPage * devPageSize).map(d => (
                  <tr key={d.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-semibold text-slate-900">{d.full_name || d.username} {d.employee_code ? `(${d.employee_code})` : ''}</td>
                    <td className="p-3 text-slate-600">{d.company_name || 'N/A'}</td>
                    <td className="p-3 text-slate-700">{d.device_name || d.device_type}</td>
                    <td className="p-3">
                      <span className="font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 font-bold select-all">
                        {d.mac_address || (d.device_id && d.device_id.startsWith('hw_') ? d.device_id.replace('hw_', '') : d.device_id)}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-500 truncate max-w-[120px]" title={d.device_id}>{d.device_id}</td>
                    <td className="p-3 text-slate-500">{d.bound_ip || '-'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        d.status === 'bound' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {d.status === 'bound' ? 'Locked' : 'Unbound'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {d.status === 'bound' && (
                        <button
                          onClick={() => {
                            setSelectedDevice(d);
                            setUnbindReason('Employee requested device change / reset to register new device.');
                            setShowUnbindModal(true);
                          }}
                          className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-semibold flex items-center gap-1 ml-auto border border-purple-200 shadow-xs hover:scale-105 active:scale-95 transition-all"
                          title="Deregister device to allow employee to register a new device"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          Deregister Device
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {devices.length === 0 && (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-slate-400 text-xs">
                      No bound devices found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar
            currentPage={devPage}
            totalItems={devices.length}
            pageSize={devPageSize}
            onPageChange={setDevPage}
            onPageSizeChange={setDevPageSize}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TICKETS & HELPDESK */}
      {/* ========================================================================= */}
      {activeTab === 'tickets' && (() => {
        const pendingTickets = tickets.filter(t => t.status !== 'closed' && t.status !== 'resolved' && !t.is_archived);
        const archivedTickets = tickets.filter(t => t.status === 'closed' || t.status === 'resolved' || t.is_archived === 1);
        const displayTickets = ticketSection === 'pending' ? pendingTickets : archivedTickets;
        const paginatedTickets = displayTickets.slice((tktPage - 1) * tktPageSize, tktPage * tktPageSize);

        return (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Service Requests & Support Tickets
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Review, chat, resolve, or permanently delete ticket history (Level 4 Support)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTicketSection('pending');
                      setTktPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      ticketSection === 'pending'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Pending & Active ({pendingTickets.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTicketSection('archived');
                      setTktPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      ticketSection === 'archived'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Archive className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Closed & Resolved Archive ({archivedTickets.length})</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                    <tr>
                      <th className="p-3">Ticket / Type</th>
                      <th className="p-3">Company</th>
                      <th className="p-3">Employee / Raised By</th>
                      <th className="p-3">Subject / Request</th>
                      <th className="p-3">Punch Details</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedTickets.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/50">
                        <td className="p-3">
                          <span className="font-bold text-slate-900">#{t.id}</span>
                          <span className="block text-[10px] text-sky-600 uppercase font-semibold">{t.request_type ? t.request_type.replace('_', ' ') : 'GENERAL'}</span>
                        </td>
                        <td className="p-3 font-semibold text-purple-700">{t.company_name || 'N/A'}</td>
                        <td className="p-3 font-medium text-slate-800">{t.employee_name || t.user_name || 'User'} ({t.employee_code || `ID:${t.user_id || t.employee_id}`})</td>
                        <td className="p-3">
                          <p className="font-semibold text-slate-900">{t.title}</p>
                          {t.request_type === 'device_change' ? (
                            <div className="mt-1 p-2 rounded-xl bg-amber-50/80 border border-amber-200 text-[11px] text-amber-900 font-mono whitespace-pre-line leading-relaxed max-w-sm">
                              {t.description}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-500 line-clamp-1">{t.description}</p>
                          )}
                        </td>
                        <td className="p-3 text-slate-600">
                          {t.punch_date ? `${t.punch_date} (${t.suggested_punch_in || '-'} to ${t.suggested_punch_out || '-'})` : '-'}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            t.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            t.status === 'in_progress' ? 'bg-purple-100 text-purple-700' :
                            t.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setChatTicketId(t.id);
                                setShowChatModal(true);
                              }}
                              className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm transition-all"
                              title="Open Ticket Chat to solve issue"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Chat & Solve
                            </button>
                            {t.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTicket(t);
                                  setShowTicketModal(true);
                                }}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                                title="Quick Process"
                              >
                                Process
                              </button>
                            )}
                            {t.request_type === 'device_change' && t.status !== 'resolved' && t.status !== 'closed' && (
                              <button
                                type="button"
                                onClick={() => handleDeregisterAndCloseTicket(t)}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs transition-all"
                                title="1-Click Deregister Device and Close Ticket"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                                Deregister & Close
                              </button>
                            )}
                            {(pLevel >= 4 || user.role === 'super_admin') && (
                              <button
                                type="button"
                                onClick={() => handlePermanentDeleteTicket(t.id)}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs transition-all"
                                title="Permanently Delete Ticket History (Level 4 Support / Super Admin)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {displayTickets.length === 0 && (
                      <tr>
                        <td colSpan="7" className="p-8 text-center text-slate-400 text-xs">
                          {ticketSection === 'pending' ? 'No pending active tickets.' : 'No archived tickets found.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                currentPage={tktPage}
                totalItems={displayTickets.length}
                pageSize={tktPageSize}
                onPageChange={setTktPage}
                onPageSizeChange={setTktPageSize}
              />
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* ACCOUNT ENABLE */}
      {/* ========================================================================= */}
      {activeTab === 'account-enable' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header & Integrated Search Bar */}
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200 shadow-xs">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  Account Enable Desk
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-50 text-rose-700 border border-rose-200">
                    {suspendedAccounts.length} Suspended
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Search and restore disabled employee accounts to enable platform access
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="relative w-64 sm:w-80">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={suspendedSearch}
                  onChange={(e) => {
                    setSuspendedSearch(e.target.value);
                    fetchSuspendedAccounts(e.target.value);
                  }}
                  placeholder="Filter by name, username, email, or phone..."
                  className="w-full pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
                {suspendedSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setSuspendedSearch('');
                      fetchSuspendedAccounts('');
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchSuspendedAccounts(suspendedSearch)}
                disabled={suspendedLoading}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 shadow-xs"
                title="Refresh Suspended Accounts List"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${suspendedLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px]">
                  <tr>
                    <th className="p-3">Employee / Name</th>
                    <th className="p-3">Username</th>
                    <th className="p-3">Contact (Email & Phone)</th>
                    <th className="p-3">Company</th>
                    <th className="p-3">Department & Role</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {suspendedAccounts.slice((susPage - 1) * susPageSize, susPage * susPageSize).map(acc => (
                    <tr key={acc.employee_id || acc.user_id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{acc.full_name || acc.username}</div>
                        <div className="text-[10px] font-mono text-slate-400">{acc.employee_code || `User #${acc.user_id}`}</div>
                      </td>
                      <td className="p-3 font-mono font-semibold text-purple-700">
                        @{acc.username}
                      </td>
                      <td className="p-3 space-y-0.5">
                        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[180px]">{acc.email || 'No email'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[11px]">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{acc.mobile || 'No phone'}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-900">{acc.company_name || 'System / Platform'}</div>
                        {acc.company_code && <span className="text-[10px] text-slate-400 font-mono">({acc.company_code})</span>}
                      </td>
                      <td className="p-3 text-slate-600">
                        <div>{acc.department || 'General'}</div>
                        <div className="text-[10px] text-slate-400">{acc.designation || 'Staff'}</div>
                      </td>
                      <td className="p-3">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                          <UserX className="w-3 h-3" />
                          {acc.employee_status || acc.user_status || 'Suspended'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleEnableAccount(acc)}
                          disabled={enablingId === (acc.employee_id || acc.user_id)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-all hover:scale-105 active:scale-95"
                          title="Restore and Enable Suspended Account"
                        >
                          {enablingId === (acc.employee_id || acc.user_id) ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5" />
                          )}
                          <span>Enable Account</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {suspendedAccounts.length === 0 && (
                    <tr>
                      <td colSpan="7" className="p-12 text-center text-slate-400">
                        {suspendedLoading ? (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
                            <p className="text-xs">Searching suspended accounts...</p>
                          </div>
                        ) : suspendedSearch ? (
                          <div>
                            <p className="font-semibold text-slate-700">No suspended accounts found matching "{suspendedSearch}".</p>
                            <p className="text-xs text-slate-400 mt-1">Check spelling or try searching by email, username, or phone number.</p>
                          </div>
                        ) : (
                          <div>
                            <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                            <p className="font-semibold text-slate-700">No suspended accounts found.</p>
                            <p className="text-xs text-slate-400 mt-1">All accounts are currently active in the selected company view.</p>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              currentPage={susPage}
              totalItems={suspendedAccounts.length}
              pageSize={susPageSize}
              onPageChange={setSusPage}
              onPageSizeChange={setSusPageSize}
            />
          </div>
        )
      }

      {/* ========================================================================= */}
      {/* ATTENDANCE SUPPORT & CORRECTION DESK */}
      {/* ========================================================================= */}
      {activeTab === 'attendance-support' && (() => {
        const availableEmployees = employeesList.filter(emp =>
          !attFilterCompany || attFilterCompany === 'all' || String(emp.company_id) === String(attFilterCompany)
        );

        const filteredAttendance = attendanceRecords.filter(a => {
          if (!attSearch.trim()) return true;
          const s = attSearch.toLowerCase();
          return (
            (a.employee_name && a.employee_name.toLowerCase().includes(s)) ||
            (a.employee_code && a.employee_code.toLowerCase().includes(s)) ||
            (a.company_name && a.company_name.toLowerCase().includes(s))
          );
        });

        const pendingRequests = attCorrectionRequests.filter(r => r.status === 'pending');
        const paginatedAttendance = filteredAttendance.slice((attPage - 1) * attPageSize, attPage * attPageSize);
        const paginatedRequests = pendingRequests.slice((crPage - 1) * crPageSize, crPage * crPageSize);

        // Compute metrics for filtered records
        const presentCount = attendanceRecords.filter(r => r.status === 'Present').length;
        const halfDayCount = attendanceRecords.filter(r => r.status === 'Half Day').length;
        const absentCount = attendanceRecords.filter(r => r.status === 'Absent').length;
        const missingCount = attendanceRecords.filter(r => (r.punch_in_time && !r.punch_out_time) || (!r.punch_in_time && r.punch_out_time) || r.status === 'Missing Punch Out').length;

        return (
          <div className="space-y-4">
            {/* Header & Quick Action */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-200 shadow-xs">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    Attendance Support & Correction Desk
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-50 text-purple-700 border border-purple-200">
                      Level {pLevel} Clearance
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    On-demand attendance inspection and supervisor punch adjustments for assigned companies
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (pLevel < 2) {
                      setError('Support Level 2 or higher required for manual punch adjustments.');
                      return;
                    }
                    setManualPunchForm({
                      employee_id: '',
                      date: attFilterDate || new Date().toISOString().slice(0, 10),
                      correction_type: 'both',
                      punch_in_time: '09:00:00',
                      punch_out_time: '18:00:00',
                      status: 'Present',
                      reason: '',
                      remarks: ''
                    });
                    setShowManualPunchModal(true);
                  }}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all hover:scale-105 active:scale-95"
                  title="Add manual punch or correction from scratch"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Manual Punch / Entry</span>
                </button>

                {attHasFiltered && (
                  <button
                    type="button"
                    onClick={() => {
                      setAttHasFiltered(false);
                      setAttendanceRecords([]);
                      setAttSearch('');
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
                    title="Clear active filter and return to search mode"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Clear Filter</span>
                  </button>
                )}
              </div>
            </div>

            {/* ON-DEMAND FILTER CONTROL CARD */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Attendance Query & Scope Filter</span>
                </div>
                <span className="text-[11px] text-slate-400">Strict single-date on-demand records</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Target Date (Strict Single Date) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Target Date <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                      type="date"
                      value={attFilterDate}
                      onChange={(e) => setAttFilterDate(e.target.value)}
                      className="bg-transparent text-xs text-slate-800 font-bold focus:outline-none w-full cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setAttFilterDate(new Date().toISOString().slice(0, 10))}
                      className="text-[10px] text-purple-600 font-bold hover:underline"
                    >
                      Today
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => {
                        const yest = new Date();
                        yest.setDate(yest.getDate() - 1);
                        setAttFilterDate(yest.toISOString().slice(0, 10));
                      }}
                      className="text-[10px] text-slate-500 hover:text-slate-800 hover:underline"
                    >
                      Yesterday
                    </button>
                  </div>
                </div>

                {/* 2. Company Selector */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Company</label>
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select
                      value={attFilterCompany}
                      onChange={(e) => {
                        setAttFilterCompany(e.target.value);
                        setAttFilterEmpId('');
                        setAttFilterEmpIds([]);
                      }}
                      className="bg-transparent text-xs text-slate-800 font-semibold focus:outline-none w-full cursor-pointer"
                    >
                      <option value="all">All Assigned Companies</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.legal_name || c.name || c.company_code}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 3. Employee Scope Selector */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Employee Scope</label>
                  <select
                    value={attFilterScope}
                    onChange={(e) => {
                      setAttFilterScope(e.target.value);
                      setAttFilterEmpId('');
                      setAttFilterEmpIds([]);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                  >
                    <option value="all">All Employees in Scope</option>
                    <option value="single">Single Employee</option>
                    <option value="multiple">Multiple Specific Employees</option>
                  </select>
                </div>

                {/* 4. Status Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Status Filter</label>
                  <select
                    value={attFilterStatus}
                    onChange={(e) => setAttFilterStatus(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="Present">Present</option>
                    <option value="Half Day">Half Day</option>
                    <option value="Absent">Absent</option>
                    <option value="Leave">Leave</option>
                    <option value="Holiday">Holiday</option>
                    <option value="Weekly Off">Weekly Off</option>
                  </select>
                </div>
              </div>

              {/* SCOPE: SINGLE EMPLOYEE PICKER */}
              {attFilterScope === 'single' && (
                <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-purple-600" />
                      Select Single Employee
                    </label>
                    <span className="text-[10px] text-purple-700 font-medium">
                      {availableEmployees.length} active employees available
                    </span>
                  </div>
                  <select
                    value={attFilterEmpId}
                    onChange={(e) => setAttFilterEmpId(e.target.value)}
                    className="w-full bg-white border border-purple-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">-- Choose Employee to inspect --</option>
                    {availableEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} ({emp.employee_id || `ID:${emp.id}`}) • {emp.department || 'General'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* SCOPE: MULTIPLE EMPLOYEES PICKER */}
              {attFilterScope === 'multiple' && (
                <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-2 animate-fade-in">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-600" />
                      Pick Multiple Employees ({attFilterEmpIds.length} selected)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = availableEmployees.map(e => e.id);
                          setAttFilterEmpIds(allIds);
                        }}
                        className="text-[11px] font-bold text-indigo-600 hover:underline"
                      >
                        Select All
                      </button>
                      <span className="text-indigo-200">•</span>
                      <button
                        type="button"
                        onClick={() => setAttFilterEmpIds([])}
                        className="text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={attEmpSearchQuery}
                      onChange={(e) => setAttEmpSearchQuery(e.target.value)}
                      placeholder="Filter employee list by name or ID..."
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="max-h-40 overflow-y-auto divide-y divide-indigo-100/80 bg-white rounded-xl border border-indigo-200 p-1">
                    {availableEmployees
                      .filter(emp => {
                        if (!attEmpSearchQuery.trim()) return true;
                        const q = attEmpSearchQuery.toLowerCase();
                        return (
                          (emp.full_name && emp.full_name.toLowerCase().includes(q)) ||
                          (emp.employee_id && emp.employee_id.toLowerCase().includes(q)) ||
                          (emp.department && emp.department.toLowerCase().includes(q))
                        );
                      })
                      .map(emp => {
                        const isChecked = attFilterEmpIds.includes(emp.id);
                        return (
                          <label
                            key={emp.id}
                            className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                              isChecked ? 'bg-indigo-50/70 font-bold text-indigo-900' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAttFilterEmpIds(prev => [...prev, emp.id]);
                                } else {
                                  setAttFilterEmpIds(prev => prev.filter(id => id !== emp.id));
                                }
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div className="flex-1 truncate">
                              <span>{emp.full_name}</span>
                              <span className="text-[10px] text-slate-400 ml-1.5 font-mono">({emp.employee_id || `ID:${emp.id}`})</span>
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0">{emp.department || 'General'}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* SEARCH & APPLY ACTION ROW */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="relative w-full sm:w-80">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={attSearch}
                    onChange={(e) => setAttSearch(e.target.value)}
                    placeholder="Search loaded records by name / code..."
                    className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
                  />
                  {attSearch && (
                    <button
                      type="button"
                      onClick={() => setAttSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleApplyAttendanceFilter}
                  disabled={attFilterLoading}
                  className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm hover:shadow flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${attFilterLoading ? 'animate-spin' : ''}`} />
                  <span>{attFilterLoading ? 'Loading Attendance...' : 'Apply Filter & View Records'}</span>
                </button>
              </div>
            </div>

            {/* Filter and Section Selector */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAttSectionTab('records')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    attSectionTab === 'records'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Attendance Records ({attHasFiltered ? filteredAttendance.length : 0})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAttSectionTab('requests')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    attSectionTab === 'requests'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5 text-sky-400" />
                  <span>Correction Requests ({pendingRequests.length})</span>
                </button>
              </div>

              {attHasFiltered && (
                <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
                  <span className="font-semibold text-slate-800">Date:</span>
                  <span className="font-mono bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-bold border border-purple-200">
                    {attFilterDate}
                  </span>
                </div>
              )}
            </div>

            {/* TAB CONTENT: ATTENDANCE RECORDS */}
            {attSectionTab === 'records' && (
              <>
                {!attHasFiltered ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto shadow-inner">
                      <Filter className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-800">No Attendance Records Loaded</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                      To protect system privacy and optimize performance, employee attendance data is not loaded automatically on page open.
                      Select your target date, company, and employee scope in the filter above, then click <strong className="text-purple-700">"Apply Filter & View Records"</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setAttFilterDate(new Date().toISOString().slice(0, 10));
                        handleApplyAttendanceFilter();
                      }}
                      className="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 mt-2"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Load Today's Attendance ({new Date().toISOString().slice(0, 10)})</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* METRIC PILLS SUMMARY FOR LOADED DATE */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Total Loaded</span>
                        <p className="text-xl font-black text-slate-900 mt-0.5">{attendanceRecords.length}</p>
                      </div>
                      <div className="bg-emerald-50/70 p-3 rounded-2xl border border-emerald-200/80 shadow-xs">
                        <span className="text-[10px] font-bold text-emerald-800 uppercase">Present</span>
                        <p className="text-xl font-black text-emerald-950 mt-0.5">{presentCount}</p>
                      </div>
                      <div className="bg-amber-50/70 p-3 rounded-2xl border border-amber-200/80 shadow-xs">
                        <span className="text-[10px] font-bold text-amber-800 uppercase">Half Day</span>
                        <p className="text-xl font-black text-amber-950 mt-0.5">{halfDayCount}</p>
                      </div>
                      <div className="bg-rose-50/70 p-3 rounded-2xl border border-rose-200/80 shadow-xs">
                        <span className="text-[10px] font-bold text-rose-800 uppercase">Absent</span>
                        <p className="text-xl font-black text-rose-950 mt-0.5">{absentCount}</p>
                      </div>
                      <div className="bg-purple-50/70 p-3 rounded-2xl border border-purple-200/80 shadow-xs">
                        <span className="text-[10px] font-bold text-purple-800 uppercase">Missing Punch</span>
                        <p className="text-xl font-black text-purple-950 mt-0.5">{missingCount}</p>
                      </div>
                    </div>

                    {/* RECORDS TABLE */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px]">
                            <tr>
                              <th className="p-3">Employee</th>
                              <th className="p-3">Company</th>
                              <th className="p-3">Date</th>
                              <th className="p-3">Punch In</th>
                              <th className="p-3">Punch Out</th>
                              <th className="p-3">Hours</th>
                              <th className="p-3">Status</th>
                              <th className="p-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {paginatedAttendance.map(a => (
                              <tr key={a.id || `${a.employee_id}_${a.date}`} className="hover:bg-slate-50/60 transition-colors">
                                <td className="p-3">
                                  <div className="font-bold text-slate-900">{a.employee_name || 'Staff Member'}</div>
                                  <div className="text-[10px] font-mono text-slate-400">{a.employee_code || `EMP #${a.employee_id}`}</div>
                                </td>
                                <td className="p-3 font-medium text-slate-600">{a.company_name || 'N/A'}</td>
                                <td className="p-3 font-semibold text-slate-700">{a.date}</td>
                                <td className="p-3 font-mono">
                                  {a.punch_in_time ? (
                                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold border border-emerald-200">
                                      {a.punch_in_time}
                                    </span>
                                  ) : (
                                    <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-[11px] font-medium border border-rose-200">
                                      Missing In
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 font-mono">
                                  {a.punch_out_time ? (
                                    <span className="text-sky-700 bg-sky-50 px-2 py-0.5 rounded font-bold border border-sky-200">
                                      {a.punch_out_time}
                                    </span>
                                  ) : (
                                    <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[11px] font-medium border border-amber-200">
                                      Missing Out
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 font-medium text-slate-700">
                                  {a.total_hours !== undefined ? `${a.total_hours} hrs` : '-'}
                                </td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    a.status === 'Present' ? 'bg-emerald-100 text-emerald-700' :
                                    a.status === 'Half Day' ? 'bg-amber-100 text-amber-700' :
                                    a.status === 'Leave' ? 'bg-purple-100 text-purple-700' :
                                    a.status === 'Holiday' ? 'bg-sky-100 text-sky-700' :
                                    a.status === 'Weekly Off' || a.status === 'WO' ? 'bg-slate-100 text-slate-700' : 'bg-rose-100 text-rose-700'
                                  }`}>
                                    {a.status || 'Absent'}
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (pLevel < 2) {
                                        setError('Support Level 2 or higher required to correct attendance.');
                                        return;
                                      }
                                      setSelectedAtt(a);
                                      const initialMode = (a.punch_in_time && !a.punch_out_time) ? 'out' : (!a.punch_in_time && a.punch_out_time) ? 'in' : 'both';
                                      setAttEditForm({
                                        correction_type: initialMode,
                                        punch_in_time: a.punch_in_time || '09:00:00',
                                        punch_out_time: a.punch_out_time || '18:00:00',
                                        status: a.status || 'Present',
                                        reason: '',
                                        remarks: ''
                                      });
                                      setEditAttendanceModal(true);
                                    }}
                                    className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-all hover:scale-105 active:scale-95"
                                    title="Correct single punch (in or out) or both punches"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    <span>Correct Punch</span>
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {filteredAttendance.length === 0 && (
                              <tr>
                                <td colSpan="8" className="p-10 text-center text-slate-400 text-xs">
                                  No attendance records found matching filters for target date {attFilterDate}.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <PaginationBar
                        currentPage={attPage}
                        totalItems={filteredAttendance.length}
                        pageSize={attPageSize}
                        onPageChange={setAttPage}
                        onPageSizeChange={setAttPageSize}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* TAB CONTENT: PENDING CORRECTION REQUESTS */}
            {attSectionTab === 'requests' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Employee Attendance Correction Requests</h4>
                    <p className="text-[11px] text-slate-400">Review and authorize pending employee punch regularization requests</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                    {pendingRequests.length} Pending
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px]">
                      <tr>
                        <th className="p-3">Req ID</th>
                        <th className="p-3">Employee</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Requested In</th>
                        <th className="p-3">Requested Out</th>
                        <th className="p-3">Reason</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedRequests.map(r => (
                        <tr key={r.id} className="hover:bg-slate-50/60">
                          <td className="p-3 font-mono font-bold text-slate-900">#{r.id}</td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{r.employee_name || 'Staff Member'}</div>
                            <div className="text-[10px] text-slate-400">{r.company_name}</div>
                          </td>
                          <td className="p-3 font-semibold text-slate-700">{r.date}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-50 text-purple-700 border border-purple-200 font-mono">
                              {r.correction_type || 'both'}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-emerald-700 font-semibold">{r.requested_punch_in || '-'}</td>
                          <td className="p-3 font-mono text-sky-700 font-semibold">{r.requested_punch_out || '-'}</td>
                          <td className="p-3 text-slate-600 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              r.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                              r.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {r.status === 'pending' && (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleReviewCorrectionRequest(r.id, 'approved')}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-all hover:scale-105 active:scale-95"
                                  title="Approve and mark Present"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approve</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReviewCorrectionRequest(r.id, 'rejected')}
                                  className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-all"
                                  title="Reject request"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Reject</span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {pendingRequests.length === 0 && (
                        <tr>
                          <td colSpan="9" className="p-8 text-center text-slate-400 text-xs">
                            No attendance correction requests submitted.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <PaginationBar
                  currentPage={crPage}
                  totalItems={pendingRequests.length}
                  pageSize={crPageSize}
                  onPageChange={setCrPage}
                  onPageSizeChange={setCrPageSize}
                />
              </div>
            )}
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* OPERATIONS CALENDAR */}
      {/* ========================================================================= */}
      {activeTab === 'calendar' && (
        <UnifiedCalendar role="support" />
      )}

      {/* ========================================================================= */}
      {/* LEVEL 4 AUDIT REPORTS & AUTO-LOGS CONSOLE */}
      {/* ========================================================================= */}
      {(activeTab === 'audit-reports' || activeTab === 'audit-logs') && (
        <div>
          {!canAccessAuditLogs ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-xl mx-auto space-y-4 shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Audit Log Access Disabled</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Access to Audit Reports and System Activity Logs has been disabled for your support account by the Super Administrator.
              </p>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 font-medium">
                To access platform security audit reports and logs, request your Super Administrator to enable "Audit Log Access" in your support account settings.
              </div>
            </div>
          ) : pLevel < 4 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-xl mx-auto space-y-4 shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Level 4 Support Clearance Required</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                The Cross-Tenant Audit Reports & System Auto-Logs Console is strictly reserved for Level 4 Lead Technical Support Engineers and Super Admins.
                Your current authorization profile is <span className="font-bold text-purple-700">Authority Level {pLevel}</span>.
              </p>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 font-medium">
                To access platform security audit reports, inspect auto-archived logs older than 1 day, and execute day/month-wise lifecycle log pruning, request Super Admin to elevate your support permission level to 4.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* TOP HEADER & ACTION BAR */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-purple-100 text-purple-700 font-bold">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900">Audit Reports & System Auto-Logs</h2>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-100 text-purple-800 border border-purple-200">
                          Level 4 Console
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Live system activity logs, automatic 1-day archival segregation, and day/month lifecycle pruning.
                      </p>
                    </div>
                  </div>
                </div>

                {/* VIEW TABS SWITCHER */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="p-1 bg-slate-100 rounded-xl flex items-center gap-1 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setAuditView('today')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        auditView === 'today'
                          ? 'bg-white text-emerald-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Today's Auto-Logs</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-50 text-emerald-700 font-extrabold border border-emerald-200">
                        {auditCounts.today ?? 0}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAuditView('archived')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        auditView === 'archived'
                          ? 'bg-white text-amber-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Archive className="w-3.5 h-3.5 text-amber-600" />
                      <span>Archived Logs (&gt; 1 Day)</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-50 text-amber-700 font-extrabold border border-amber-200">
                        {auditCounts.archived ?? 0}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAuditView('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        auditView === 'all'
                          ? 'bg-white text-purple-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5 text-purple-600" />
                      <span>All System Logs</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-50 text-purple-700 font-extrabold border border-purple-200">
                        {auditCounts.total ?? 0}
                      </span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={fetchAuditReports}
                    disabled={auditLoading}
                    className="p-2 text-slate-500 hover:text-purple-600 bg-white border border-slate-200 hover:bg-purple-50 rounded-xl transition-colors shadow-xs"
                    title="Refresh Audit Logs"
                  >
                    <RefreshCw className={`w-4 h-4 ${auditLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* METRIC SUMMARY CARDS */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-emerald-50/60 border border-emerald-100 p-3.5 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Today's Auto-Logs</span>
                    <p className="text-2xl font-black text-emerald-950 mt-1">{auditCounts.today ?? 0}</p>
                    <span className="text-[10px] text-emerald-700 font-medium">Logged today (auto-segregated)</span>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-100 text-emerald-700">
                    <Clock className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-amber-50/60 border border-amber-100 p-3.5 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Auto-Archived (&gt; 1 Day)</span>
                    <p className="text-2xl font-black text-amber-950 mt-1">{auditCounts.archived ?? 0}</p>
                    <span className="text-[10px] text-amber-700 font-medium">Auto-archived after 24 hours</span>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-100 text-amber-700">
                    <Archive className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-sky-50/60 border border-sky-100 p-3.5 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-sky-800 uppercase tracking-wider">Filtered View Records</span>
                    <p className="text-2xl font-black text-sky-950 mt-1">{auditCounts.filtered ?? auditLogs.length}</p>
                    <span className="text-[10px] text-sky-700 font-medium">Matching filter criteria</span>
                  </div>
                  <div className="p-3 rounded-xl bg-sky-100 text-sky-700">
                    <Filter className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-purple-50/60 border border-purple-100 p-3.5 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">Total Stored Audits</span>
                    <p className="text-2xl font-black text-purple-950 mt-1">{auditCounts.total ?? 0}</p>
                    <span className="text-[10px] text-purple-700 font-medium">Complete platform audit ledger</span>
                  </div>
                  <div className="p-3 rounded-xl bg-purple-100 text-purple-700">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* FILTER TOOLBAR & PRUNING DELETION CONTROLS */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Left Filters */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Day-wise Filter */}
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-[11px] font-bold text-slate-600">Day:</span>
                      <input
                        type="date"
                        value={auditDayFilter}
                        onChange={(e) => setAuditDayFilter(e.target.value)}
                        className="text-xs bg-transparent border-0 focus:ring-0 p-0 text-slate-700 font-semibold cursor-pointer"
                        title="Day-wise Filter"
                      />
                      {auditDayFilter && (
                        <button
                          type="button"
                          onClick={() => setAuditDayFilter('')}
                          className="text-slate-400 hover:text-slate-600 text-xs ml-1"
                        >
                          &times;
                        </button>
                      )}
                    </div>

                    {/* Month-wise Filter */}
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-[11px] font-bold text-slate-600">Month:</span>
                      <input
                        type="month"
                        value={auditMonthFilter}
                        onChange={(e) => setAuditMonthFilter(e.target.value)}
                        className="text-xs bg-transparent border-0 focus:ring-0 p-0 text-slate-700 font-semibold cursor-pointer"
                        title="Month-wise Filter"
                      />
                      {auditMonthFilter && (
                        <button
                          type="button"
                          onClick={() => setAuditMonthFilter('')}
                          className="text-slate-400 hover:text-slate-600 text-xs ml-1"
                        >
                          &times;
                        </button>
                      )}
                    </div>

                    {/* Action Filter */}
                    <select
                      value={auditActionFilter}
                      onChange={(e) => setAuditActionFilter(e.target.value)}
                      className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      <option value="">All Action Types</option>
                      <option value="USER_LOGIN">User Login</option>
                      <option value="DEVICE_UNBOUND">Device Unbind</option>
                      <option value="ACCOUNT_ENABLED">Account Enabled</option>
                      <option value="USER_PROFILE_UPDATED">User Profile Updated</option>
                      <option value="ATTENDANCE_CORRECTED">Attendance Corrected</option>
                      <option value="SERVICE_REQUEST_RESOLVED">Ticket Resolved</option>
                      <option value="TICKET_PERMANENTLY_DELETED">Ticket Deleted</option>
                      <option value="AUDIT_LOGS_DELETED">Audit Logs Deleted</option>
                    </select>

                    {/* Search Input */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search user, reason, IP, target..."
                        value={auditSearch}
                        onChange={(e) => setAuditSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') fetchAuditReports();
                        }}
                        className="text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 w-52 sm:w-64 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>

                    {(auditDayFilter || auditMonthFilter || auditActionFilter || auditSearch) && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuditDayFilter('');
                          setAuditMonthFilter('');
                          setAuditActionFilter('');
                          setAuditSearch('');
                        }}
                        className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>

                  {/* Right Deletion Actions (Level 4 Support Pruning) */}
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const targetDay = auditDayFilter || (auditView === 'today' ? new Date().toISOString().split('T')[0] : '');
                        if (!targetDay) {
                          alert('Please select a specific Day using the Day filter to delete day-wise logs.');
                          return;
                        }
                        triggerDeleteAudit('day', targetDay, '', `All audit logs for day: ${targetDay}`);
                      }}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                      title="Delete all audit logs for the selected day"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Day Logs</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const targetMonth = auditMonthFilter || new Date().toISOString().slice(0, 7);
                        triggerDeleteAudit('month', '', targetMonth, `All audit logs for month: ${targetMonth}`);
                      }}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                      title="Delete all audit logs for the selected month"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Month Logs</span>
                    </button>

                    {(auditDayFilter || auditMonthFilter || auditActionFilter || auditSearch || (selectedCompanyId && selectedCompanyId !== 'all')) && (
                      <button
                        type="button"
                        onClick={() => triggerDeleteAudit('filtered', '', '', 'Audit records matching active filter')}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                        title="Delete all logs currently matching filters"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Filtered Records</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* AUDIT LOGS TABLE */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      {auditView === 'today' ? "Today's Auto-Logs" : auditView === 'archived' ? 'Archived Logs (> 1 Day)' : 'All System Audit Reports'}
                    </h3>
                    <span className="text-xs text-slate-500 font-semibold">
                      ({auditLogs.length} records shown)
                    </span>
                  </div>
                  {auditLoading && (
                    <span className="text-xs text-purple-600 font-bold flex items-center gap-1">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Updating...
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                      <tr>
                        <th className="p-3">Timestamp</th>
                        <th className="p-3">Authorizer / Agent</th>
                        <th className="p-3">Action</th>
                        <th className="p-3">Company</th>
                        <th className="p-3">Target Entity / ID</th>
                        <th className="p-3">Details / Reason</th>
                        <th className="p-3">IP Address</th>
                        <th className="p-3 text-right">Delete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLogs.slice((auditPage - 1) * auditPageSize, auditPage * auditPageSize).map(log => {
                        const isDeletedAction = log.action?.includes('DELETE') || log.action?.includes('UNBOUND');
                        const isSuccessAction = log.action?.includes('RESOLVED') || log.action?.includes('ENABLE') || log.action?.includes('CORRECT');

                        return (
                          <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="p-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                              {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                            </td>
                            <td className="p-3 font-semibold text-slate-800 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span>{log.user_name}</span>
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                  {log.role}
                                </span>
                              </div>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                isDeletedAction
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : isSuccessAction
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="p-3 text-slate-600 whitespace-nowrap">
                              {log.company_name || 'System / All'}
                            </td>
                            <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                              {log.target_entity} {log.target_id ? `#${log.target_id}` : ''}
                            </td>
                            <td className="p-3 text-slate-700 max-w-sm break-words">
                              {log.reason || '-'}
                            </td>
                            <td className="p-3 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                              {log.ip_address || '127.0.0.1'}
                            </td>
                            <td className="p-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleDeleteSingleLog(log.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Permanently delete this audit log record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {auditLogs.length === 0 && !auditLoading && (
                        <tr>
                          <td colSpan={8} className="p-10 text-center text-slate-400">
                            <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300 mb-2 stroke-1" />
                            <p className="font-semibold text-slate-600">No audit records found matching the active criteria.</p>
                            <p className="text-[11px] mt-1 text-slate-400">
                              {auditView === 'today'
                                ? "No new operations logged yet today."
                                : auditView === 'archived'
                                ? "No archived logs older than 1 day exist."
                                : "No audit reports available."}
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <PaginationBar
                  currentPage={auditPage}
                  totalItems={auditLogs.length}
                  pageSize={auditPageSize}
                  onPageChange={setAuditPage}
                  onPageSizeChange={setAuditPageSize}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONFIRMATION MODAL: DELETE AUDIT LOGS (L4) */}
      {showDeleteAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm Audit Log Deletion</h3>
                <span className="text-[10px] font-extrabold uppercase text-rose-600 tracking-wider">Level 4 Support Action</span>
              </div>
            </div>

            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-900 space-y-1">
              <p className="font-bold">Caution: This action is permanent and cannot be undone.</p>
              <p className="text-rose-700 leading-relaxed">
                {deleteAuditConfig.title || 'Selected audit log records will be permanently deleted from the database.'}
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-slate-600">
                Are you sure you want to execute this lifecycle deletion? An audit trail entry will record this purge action.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteAuditModal(false)}
                disabled={deletingAudit}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteAudit}
                disabled={deletingAudit}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
              >
                {deletingAudit ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm & Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

            {/* ========================================================================= */}
      {/* MULTI-PERSPECTIVE REMOTE ACCESS CONSOLE (COMPANY / MANAGER / EMPLOYEE) */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* MULTI-PERSPECTIVE REMOTE ACCESS CONSOLE (COMPANY / MANAGER / EMPLOYEE) */}
      {/* ========================================================================= */}
      {activeTab === 'remote-access' && (
        <div>
          {pLevel < 2 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-xl mx-auto space-y-4 shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Support Level 2+ Clearance Required</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                The Online Remote Access Management Console is reserved for Technical Support Engineers (Level 2, 3, & 4).
                Your current authorization profile is <span className="font-bold text-purple-700">Authority Level {pLevel}</span>.
              </p>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 font-medium">
                To access live company portals, employee diagnostics, leave application on behalf of staff, and remote troubleshooting, request Super Admin to elevate your support permission level.
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* TOP HEADER: PERSPECTIVE SWITCHER & COMPANY SELECTOR */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-xl shadow-xs">
                    <Radio className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      Remote Access & Operational Console
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full uppercase">
                        Level {pLevel} Live
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Full multi-perspective operational management for Employees, Managers, and Companies
                    </p>
                  </div>
                </div>

                {/* PERSPECTIVE SELECTOR BUTTONS */}
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setRemotePerspective('employee')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                      remotePerspective === 'employee'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Employee View</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemotePerspective('manager')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                      remotePerspective === 'manager'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>Manager View</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemotePerspective('company')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                      remotePerspective === 'company'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Company View</span>
                  </button>
                </div>

                {/* COMPANY PICKER & REFRESH */}
                <div className="flex items-center gap-2">
                  <select
                    value={remoteCompanyData?.company?.id || selectedCompanyId || ''}
                    onChange={(e) => {
                      setSelectedCompanyId(e.target.value);
                      fetchRemoteCompanyData(e.target.value);
                    }}
                    className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                  >
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.legal_name || c.name || c.company_code}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const cid = remoteCompanyData?.company?.id || selectedCompanyId;
                      fetchRemoteCompanyData(cid);
                      if (remoteSelectedEmpId) fetchRemoteEmployeeData(remoteSelectedEmpId);
                    }}
                    disabled={remoteCompanyLoading || remoteEmployeeLoading}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"
                    title="Refresh remote data"
                  >
                    <RefreshCw className={`w-4 h-4 ${(remoteCompanyLoading || remoteEmployeeLoading) ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {remoteCompanyLoading && (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs shadow-sm flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                  <span>Loading remote company data stream...</span>
                </div>
              )}

              {/* ========================================================================= */}
              {/* PERSPECTIVE 1: EMPLOYEE PERSPECTIVE */}
              {/* ========================================================================= */}
              {!remoteCompanyLoading && remotePerspective === 'employee' && (
                <div className="space-y-4">
                  {/* EMPLOYEE PICKER BAR */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-bold text-slate-600">Select Employee:</span>
                      <select
                        value={remoteSelectedEmpId || ''}
                        onChange={(e) => handleRemoteSelectEmployee(e.target.value)}
                        className="text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer max-w-sm"
                      >
                        {(remoteCompanyData?.employees || []).map(e => (
                          <option key={e.id} value={e.id}>
                            {e.full_name || e.fullName || e.username} ({e.employee_code || `ID:${e.id}`}) • {e.department || 'General'}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openRemoteCorrectionModal(remoteSelectedEmpId)}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                        title="Submit Attendance Correction"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-amber-600" />
                        <span>Correction</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openRemoteApplyLeaveModal(remoteSelectedEmpId)}
                        className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                        title="Apply Leave on Behalf"
                      >
                        <FileText className="w-3.5 h-3.5 text-purple-600" />
                        <span>Apply Leave</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openRemotePunchModal(remoteSelectedEmpId)}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                        title="Mark or Correct Attendance Punch"
                      >
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Punch</span>
                      </button>
                    </div>
                  </div>

                  {/* EMPLOYEE SUB-NAV TAB BAR (ALL 7 USER REQUESTED PAGES) */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-1.5 shadow-sm flex flex-wrap items-center gap-1 overflow-x-auto">
                    {[
                      { id: 'dashboard', label: 'Dashboard', icon: Layers },
                      { id: 'calendar', label: 'My Calendar & Attendance', icon: Calendar },
                      { id: 'attendance-logs', label: 'Attendance Logs', icon: Clock },
                      {
                        id: 'corrections',
                        label: 'Attendance Correction',
                        icon: CheckSquare,
                        badge: (remoteEmployeeData?.correctionRequests || []).filter(c => c.status === 'pending').length
                      },
                      {
                        id: 'leaves',
                        label: 'Leave & Balances',
                        icon: Award,
                        badge: (remoteEmployeeData?.leaveRequests || []).filter(l => l.status === 'pending').length
                      },
                      {
                        id: 'tickets',
                        label: 'Helpdesk & Tickets',
                        icon: MessageSquare,
                        badge: (remoteEmployeeData?.tickets || []).filter(t => t.status === 'open' || t.status === 'in_progress').length
                      },
                      { id: 'profile', label: 'My Profile & Security', icon: Shield }
                    ].map(tab => {
                      const Icon = tab.icon;
                      const isActive = remoteEmpTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setRemoteEmpTab(tab.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                            isActive
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{tab.label}</span>
                          {Boolean(tab.badge) && (
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                              isActive ? 'bg-white text-purple-700' : 'bg-rose-100 text-rose-700'
                            }`}>
                              {tab.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {remoteEmployeeLoading && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs shadow-sm flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                      <span>Loading employee live data stream...</span>
                    </div>
                  )}

                  {!remoteEmployeeLoading && remoteEmployeeData?.employee && (
                    <div className="space-y-4">
                      {/* SUB-PAGE 1: DASHBOARD */}
                      {remoteEmpTab === 'dashboard' && (
                        <div className="space-y-4">
                          {/* SUMMARY BANNER */}
                          <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                              <div className="flex items-center gap-3.5">
                                <div className="w-14 h-14 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-black text-xl shadow-inner border border-purple-400/30">
                                  {(remoteEmployeeData.employee.full_name || remoteEmployeeData.employee.username)[0].toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h3 className="text-base font-bold text-white">
                                      {remoteEmployeeData.employee.full_name || remoteEmployeeData.employee.username}
                                    </h3>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-500/30 text-purple-200 border border-purple-400/30">
                                      {remoteEmployeeData.employee.role || 'Staff'}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                      remoteEmployeeData.employee.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                                    }`}>
                                      {remoteEmployeeData.employee.status}
                                    </span>
                                  </div>
                                  <p className="text-xs text-purple-200/80 mt-1">
                                    Code: <span className="font-mono font-bold text-white">{remoteEmployeeData.employee.employee_code || `ID:${remoteEmployeeData.employee.id}`}</span> •
                                    Dept: <span className="font-semibold text-white">{remoteEmployeeData.employee.department || 'General'}</span> •
                                    Designation: <span className="font-semibold text-white">{remoteEmployeeData.employee.designation || '-'}</span>
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openRemotePunchModal(remoteEmployeeData.employee.id)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>Record Punch</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openRemoteApplyLeaveModal(remoteEmployeeData.employee.id)}
                                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>Apply Leave</span>
                                </button>
                              </div>
                            </div>

                            {/* QUICK METRICS CARDS */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/10 text-xs">
                              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                <span className="text-[11px] text-purple-200 uppercase font-semibold">Present (Logged)</span>
                                <p className="text-xl font-bold mt-1 text-emerald-400">
                                  {(remoteEmployeeData.attendanceHistory || []).filter(a => a.status === 'Present').length} days
                                </p>
                              </div>
                              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                <span className="text-[11px] text-purple-200 uppercase font-semibold">Leaves Taken</span>
                                <p className="text-xl font-bold mt-1 text-amber-300">
                                  {(remoteEmployeeData.leaveRequests || [])
                                    .filter(l => l.status === 'approved')
                                    .reduce((acc, cur) => acc + (parseFloat(cur.total_days) || 0), 0)} days
                                </p>
                              </div>
                              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                <span className="text-[11px] text-purple-200 uppercase font-semibold">CL Balance</span>
                                <p className="text-xl font-bold mt-1 text-purple-300">
                                  {(() => {
                                    const cl = (remoteEmployeeData.currentBalances || []).find(b => (b.leave_type_code || '').toUpperCase() === 'CL');
                                    return cl ? `${Number(cl.balance || 0).toFixed(1)} / 12` : 'N/A';
                                  })()}
                                </p>
                              </div>
                              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                <span className="text-[11px] text-purple-200 uppercase font-semibold">Pending Requests</span>
                                <p className="text-xl font-bold mt-1 text-sky-300">
                                  {((remoteEmployeeData.correctionRequests || []).filter(c => c.status === 'pending').length) +
                                   ((remoteEmployeeData.leaveRequests || []).filter(l => l.status === 'pending').length)} pending
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* TODAY'S PUNCH STATUS & SUPERVISOR INFO */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-purple-600" />
                                <span>Today's Attendance Status</span>
                              </h4>
                              {(() => {
                                const todayStr = new Date().toISOString().split('T')[0];
                                const todayAtt = (remoteEmployeeData.attendanceHistory || []).find(a => a.date === todayStr);
                                if (!todayAtt) {
                                  return (
                                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 space-y-2">
                                      <p className="font-semibold">No punch recorded for today ({todayStr}).</p>
                                      <button
                                        type="button"
                                        onClick={() => openRemotePunchModal(remoteEmployeeData.employee.id)}
                                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs"
                                      >
                                        Mark Today's Punch
                                      </button>
                                    </div>
                                  );
                                }
                                return (
                                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-emerald-900">Status: {todayAtt.status}</span>
                                      <span className="font-bold text-emerald-800">{todayAtt.total_hours || 0} hrs</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-slate-600 font-mono text-[11px]">
                                      <div>In: <span className="font-bold text-slate-900">{todayAtt.punch_in_time || '-'}</span></div>
                                      <div>Out: <span className="font-bold text-slate-900">{todayAtt.punch_out_time || '-'}</span></div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>

                            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                                <Briefcase className="w-4 h-4 text-indigo-600" />
                                <span>Assigned Hierarchy & Work Policy</span>
                              </h4>
                              <div className="space-y-1.5 text-slate-600">
                                <div>
                                  <span className="font-semibold text-slate-800">Assigned Supervisor / Manager: </span>
                                  {remoteEmployeeData.assignedManager ? (
                                    <span className="font-bold text-purple-700">
                                      {remoteEmployeeData.assignedManager.full_name} ({remoteEmployeeData.assignedManager.designation || 'Manager'})
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 italic">Direct to Company Admin</span>
                                  )}
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-800">Assigned Shift: </span>
                                  <span className="font-mono text-slate-900">
                                    {remoteEmployeeData.employee.shift_name || 'Standard Shift'} ({remoteEmployeeData.employee.shift_start || '09:00'} - {remoteEmployeeData.employee.shift_end || '18:00'})
                                  </span>
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-800">Geofence Location: </span>
                                  <span className="text-slate-900">{remoteEmployeeData.employee.geofence_name || 'Main Workplace (Universal)'}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* RECENT ATTENDANCE PUNCHES PREVIEW */}
                          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between">
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Recent Punch Logs</h4>
                              <button
                                type="button"
                                onClick={() => setRemoteEmpTab('attendance-logs')}
                                className="text-xs font-bold text-purple-600 hover:text-purple-800"
                              >
                                View All ({remoteEmployeeData.attendanceHistory?.length || 0})
                              </button>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                                  <tr>
                                    <th className="p-2.5">Date</th>
                                    <th className="p-2.5">In</th>
                                    <th className="p-2.5">Out</th>
                                    <th className="p-2.5">Hours</th>
                                    <th className="p-2.5">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {(remoteEmployeeData.attendanceHistory || []).slice(0, 5).map(att => (
                                    <tr key={att.id} className="hover:bg-slate-50/50">
                                      <td className="p-2.5 font-mono font-bold text-slate-800">{att.date}</td>
                                      <td className="p-2.5 font-mono text-emerald-700">{att.punch_in_time || '-'}</td>
                                      <td className="p-2.5 font-mono text-sky-700">{att.punch_out_time || '-'}</td>
                                      <td className="p-2.5 font-bold text-slate-800">{att.total_hours || att.working_hours || '-'} hrs</td>
                                      <td className="p-2.5">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                          att.status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                        }`}>
                                          {att.status || 'Present'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* SUB-PAGE 2: MY CALENDAR & ATTENDANCE */}
                      {remoteEmpTab === 'calendar' && (
                        <div className="space-y-4">
                          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                              <div>
                                <h4 className="text-sm font-bold text-slate-900">Attendance Calendar</h4>
                                <p className="text-[11px] text-slate-400">
                                  Daily punch timings, holidays, leaves, and total working hours
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openRemotePunchModal(remoteEmployeeData.employee.id)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>Record Punch</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openRemoteCorrectionModal(remoteEmployeeData.employee.id)}
                                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                                >
                                  <CheckSquare className="w-3.5 h-3.5" />
                                  <span>Submit Correction</span>
                                </button>
                              </div>
                            </div>

                            <UnifiedCalendar
                              companyId={remoteCompanyData?.company?.id}
                              employeeId={remoteSelectedEmpId}
                              role="employee"
                            />
                          </div>
                        </div>
                      )}

                      {/* SUB-PAGE 3: ATTENDANCE LOGS */}
                      {remoteEmpTab === 'attendance-logs' && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
                          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Attendance Timesheet & Punch Logs</h4>
                              <p className="text-[11px] text-slate-400">Complete historical punch logs with instant modification and permanent deletion</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => openRemotePunchModal(remoteEmployeeData.employee.id)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center gap-1.5"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Mark / Correct Punch</span>
                            </button>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                                <tr>
                                  <th className="p-3">Date</th>
                                  <th className="p-3">Punch In</th>
                                  <th className="p-3">Punch Out</th>
                                  <th className="p-3">Total Hours</th>
                                  <th className="p-3">Status</th>
                                  <th className="p-3">Location / Geofence</th>
                                  <th className="p-3 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {(remoteEmployeeData.attendanceHistory || []).map(att => (
                                  <tr key={att.id} className="hover:bg-slate-50/50">
                                    <td className="p-3 font-mono font-bold text-slate-800">{att.date}</td>
                                    <td className="p-3 font-mono text-emerald-700 font-semibold">{att.punch_in_time || '-'}</td>
                                    <td className="p-3 font-mono text-sky-700 font-semibold">{att.punch_out_time || '-'}</td>
                                    <td className="p-3 font-bold text-slate-800">{att.total_hours || att.working_hours || '-'} hrs</td>
                                    <td className="p-3">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        att.status === 'Present' ? 'bg-emerald-100 text-emerald-700' :
                                        att.status === 'Half Day' ? 'bg-amber-100 text-amber-700' :
                                        'bg-rose-100 text-rose-700'
                                      }`}>
                                        {att.status || 'Present'}
                                      </span>
                                    </td>
                                    <td className="p-3 text-slate-500 font-mono text-[11px]">
                                      {att.punch_in_area || att.punch_in_location || 'Office Zone'}
                                    </td>
                                    <td className="p-3 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setRemotePunchForm({
                                              employee_id: remoteEmployeeData.employee.id,
                                              date: att.date,
                                              punch_in_time: att.punch_in_time || '09:30:00',
                                              punch_out_time: att.punch_out_time || '18:30:00',
                                              status: att.status || 'Present',
                                              total_hours: att.total_hours || 9,
                                              reason: 'Correction via Support Console'
                                            });
                                            setRemoteShowPunchModal(true);
                                          }}
                                          className="p-1 text-slate-400 hover:text-emerald-600 transition-colors"
                                          title="Edit punch"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoteDeleteAttendance(att.id)}
                                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                          title="Permanently delete punch record (Zero recovery)"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {(remoteEmployeeData.attendanceHistory || []).length === 0 && (
                                  <tr>
                                    <td colSpan="7" className="p-8 text-center text-slate-400 text-xs">
                                      No attendance records logged for this employee.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* SUB-PAGE 4: ATTENDANCE CORRECTION */}
                      {remoteEmpTab === 'corrections' && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
                          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Attendance Correction Desk</h4>
                              <p className="text-[11px] text-slate-400">
                                Review, approve, reject, delete, or submit correction with direct supervisor mapping routing
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => openRemoteCorrectionModal(remoteEmployeeData.employee.id)}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center gap-1.5"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Submit Correction Request</span>
                            </button>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                                <tr>
                                  <th className="p-3">Date</th>
                                  <th className="p-3">Type</th>
                                  <th className="p-3">Requested In / Out</th>
                                  <th className="p-3">Requested Status</th>
                                  <th className="p-3">Reason / Details</th>
                                  <th className="p-3">Status</th>
                                  <th className="p-3 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {(remoteEmployeeData.correctionRequests || []).map(cr => (
                                  <tr key={cr.id} className="hover:bg-slate-50/50">
                                    <td className="p-3 font-mono font-bold text-slate-800">{cr.date}</td>
                                    <td className="p-3 font-semibold uppercase text-purple-700 text-[10px]">{cr.correction_type || 'both'}</td>
                                    <td className="p-3 font-mono text-slate-700">
                                      <div>In: <span className="text-emerald-700 font-bold">{cr.requested_punch_in || '-'}</span></div>
                                      <div>Out: <span className="text-sky-700 font-bold">{cr.requested_punch_out || '-'}</span></div>
                                    </td>
                                    <td className="p-3 font-semibold text-slate-800">{cr.requested_status || 'Present'}</td>
                                    <td className="p-3 text-slate-600 max-w-xs truncate" title={cr.reason}>
                                      {cr.reason || '-'}
                                    </td>
                                    <td className="p-3">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                        cr.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                        cr.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                                        'bg-amber-100 text-amber-700'
                                      }`}>
                                        {cr.status}
                                      </span>
                                    </td>
                                    <td className="p-3 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        {cr.status === 'pending' && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => handleRemoteReviewCorrection(cr.id, 'approved', 'Direct Support Override Approval')}
                                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded text-[10px] transition-colors"
                                            >
                                              Approve
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleRemoteReviewCorrection(cr.id, 'rejected', 'Rejected by Support')}
                                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded text-[10px] transition-colors"
                                            >
                                              Reject
                                            </button>
                                          </>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleRemoteDeleteCorrection(cr.id)}
                                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                          title="Permanently delete correction request (Zero recovery)"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {(remoteEmployeeData.correctionRequests || []).length === 0 && (
                                  <tr>
                                    <td colSpan="7" className="p-8 text-center text-slate-400 text-xs">
                                      No attendance correction requests recorded for this employee.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* SUB-PAGE 5: LEAVE & BALANCES */}
                      {remoteEmpTab === 'leaves' && (
                        <div className="space-y-4">
                          {/* LEAVE BALANCES CARDS */}
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                <Award className="w-4 h-4 text-purple-600" />
                                <span>Leave Quotas & Balances</span>
                              </h4>
                              <button
                                type="button"
                                onClick={() => openRemoteAdjustBalanceModal(remoteEmployeeData.employee.id)}
                                className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                              >
                                <Sliders className="w-3.5 h-3.5" />
                                <span>Adjust Quotas & Balance</span>
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {(remoteEmployeeData.currentBalances || []).map(bal => {
                                const isCL = (bal.leave_type_code || '').toUpperCase() === 'CL';
                                const isEL = (bal.leave_type_code || '').toUpperCase() === 'EL';
                                const maxLimit = isCL ? 12 : (bal.max_days || 15);
                                const percent = Math.min(100, Math.max(0, ((bal.balance || 0) / maxLimit) * 100));

                                return (
                                  <div
                                    key={bal.leave_type_id}
                                    className={`rounded-2xl border p-5 shadow-sm transition-all ${
                                      isCL
                                        ? 'bg-gradient-to-br from-purple-50/80 to-white border-purple-200'
                                        : isEL
                                        ? 'bg-gradient-to-br from-sky-50/80 to-white border-sky-200'
                                        : 'bg-white border-slate-200'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                                          {bal.leave_type_name || bal.leave_type_code}
                                        </span>
                                        <span className="block text-[10px] text-slate-500 font-semibold mt-0.5">
                                          {isCL ? 'Casual Leave (Max 12/yr)' : isEL ? 'Earned Leave (1.25/mo)' : 'Standard Leave'}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => openRemoteAdjustBalanceModal(remoteEmployeeData.employee.id, bal.leave_type_id)}
                                        className="p-1.5 bg-white border border-slate-200 hover:border-purple-300 text-purple-700 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                                      >
                                        <Sliders className="w-3 h-3" />
                                        <span>Adjust</span>
                                      </button>
                                    </div>

                                    <div className="mt-4 flex items-baseline justify-between">
                                      <div>
                                        <span className="text-3xl font-black text-slate-900">
                                          {Number(bal.balance || 0).toFixed(2)}
                                        </span>
                                        <span className="text-xs font-bold text-slate-400 ml-1">days remaining</span>
                                      </div>
                                      <span className="text-xs font-bold text-slate-500">
                                        Limit: {maxLimit} d
                                      </span>
                                    </div>

                                    <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          isCL ? 'bg-purple-600' : isEL ? 'bg-sky-500' : 'bg-emerald-500'
                                        }`}
                                        style={{ width: `${percent}%` }}
                                      />
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-[10px]">
                                      <div>
                                        <span className="text-slate-400 block">Opening</span>
                                        <span className="font-bold text-slate-700">{bal.opening_balance || 0}</span>
                                      </div>
                                      <div>
                                        <span className="text-slate-400 block">Accrued</span>
                                        <span className="font-bold text-emerald-600">+{bal.accrued || 0}</span>
                                      </div>
                                      <div>
                                        <span className="text-slate-400 block">Used</span>
                                        <span className="font-bold text-rose-600">-{bal.used || 0}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* LEAVE APPLICATIONS HISTORY */}
                          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                              <div>
                                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Leave Applications History</h4>
                                <p className="text-[11px] text-slate-400">All submitted, approved, and rejected leave requests for this employee</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => openRemoteApplyLeaveModal(remoteEmployeeData.employee.id)}
                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center gap-1.5"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Apply Leave on Behalf</span>
                              </button>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                                  <tr>
                                    <th className="p-3">Leave Type</th>
                                    <th className="p-3">Period</th>
                                    <th className="p-3">Duration</th>
                                    <th className="p-3">Reason</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {(remoteEmployeeData.leaveRequests || []).map(lr => (
                                    <tr key={lr.id} className="hover:bg-slate-50/50">
                                      <td className="p-3 font-bold text-purple-700">
                                        {lr.leave_type_name || lr.leave_type_code || 'Leave'}
                                      </td>
                                      <td className="p-3 font-mono text-slate-700">
                                        {lr.start_date} to {lr.end_date}
                                      </td>
                                      <td className="p-3 font-bold text-slate-800">{lr.total_days} day(s)</td>
                                      <td className="p-3 text-slate-600 max-w-xs truncate">{lr.reason || '-'}</td>
                                      <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                          lr.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                          lr.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                                          'bg-amber-100 text-amber-700'
                                        }`}>
                                          {lr.status}
                                        </span>
                                      </td>
                                      <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                          {lr.status === 'pending' && (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() => handleRemoteUpdateLeaveStatus(lr.id, 'approved')}
                                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded text-[10px]"
                                              >
                                                Approve
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleRemoteUpdateLeaveStatus(lr.id, 'rejected')}
                                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded text-[10px]"
                                              >
                                                Reject
                                              </button>
                                            </>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => handleRemoteDeleteLeave(lr.id)}
                                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                            title="Permanently delete leave request (Zero recovery, refunds days)"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                  {(remoteEmployeeData.leaveRequests || []).length === 0 && (
                                    <tr>
                                      <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">
                                        No leave requests recorded for this employee.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* SUB-PAGE 6: HELPDESK & TICKETS */}
                      {remoteEmpTab === 'tickets' && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
                          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Service Requests & Helpdesk Tickets</h4>
                              <p className="text-[11px] text-slate-400">View conversations, chat, resolve, or permanently delete tickets</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => openRemoteTicketModal(remoteEmployeeData.employee.id)}
                              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center gap-1.5"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Raise Ticket on Behalf</span>
                            </button>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                                <tr>
                                  <th className="p-3">Ticket #</th>
                                  <th className="p-3">Category</th>
                                  <th className="p-3">Title & Details</th>
                                  <th className="p-3">Created</th>
                                  <th className="p-3">Status</th>
                                  <th className="p-3 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {(remoteEmployeeData.tickets || []).map(tkt => (
                                  <tr key={tkt.id} className="hover:bg-slate-50/50">
                                    <td className="p-3 font-mono font-bold text-purple-700">#{tkt.id}</td>
                                    <td className="p-3 font-semibold uppercase text-slate-600 text-[10px]">{tkt.request_type || 'General'}</td>
                                    <td className="p-3">
                                      <div className="font-bold text-slate-900">{tkt.title}</div>
                                      <div className="text-[11px] text-slate-500 max-w-sm truncate">{tkt.description}</div>
                                    </td>
                                    <td className="p-3 font-mono text-slate-500 text-[11px]">{tkt.created_at ? new Date(tkt.created_at).toLocaleDateString() : '-'}</td>
                                    <td className="p-3">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                        tkt.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                                        tkt.status === 'closed' ? 'bg-slate-100 text-slate-600' :
                                        'bg-amber-100 text-amber-700'
                                      }`}>
                                        {tkt.status}
                                      </span>
                                    </td>
                                    <td className="p-3 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setChatTicketId(tkt.id);
                                            setShowChatModal(true);
                                          }}
                                          className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-lg text-xs transition-colors flex items-center gap-1"
                                        >
                                          <MessageSquare className="w-3 h-3" />
                                          <span>Chat</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoteDeleteTicket(tkt.id)}
                                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                          title="Permanently delete ticket (Zero recovery)"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {(remoteEmployeeData.tickets || []).length === 0 && (
                                  <tr>
                                    <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">
                                      No service tickets logged for this employee.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* SUB-PAGE 7: MY PROFILE & SECURITY */}
                      {remoteEmpTab === 'profile' && (
                        <div className="space-y-4">
                          {/* DETAILS GRID */}
                          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 text-xs">
                            <div className="flex items-center justify-between border-b pb-3">
                              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-xs flex items-center gap-2">
                                <User className="w-4 h-4 text-purple-600" />
                                <span>Employee Account & Contact Information</span>
                              </h4>
                              <button
                                type="button"
                                onClick={() => openRemoteEditProfileModal(remoteEmployeeData.employee)}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl transition-colors flex items-center gap-1.5"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Edit Profile</span>
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              <div>
                                <span className="text-slate-400 block font-medium">Full Name</span>
                                <span className="font-bold text-slate-900 text-sm">{remoteEmployeeData.employee.full_name}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-medium">Employee Code</span>
                                <span className="font-mono font-bold text-slate-800">{remoteEmployeeData.employee.employee_code || `ID:${remoteEmployeeData.employee.id}`}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-medium">Username</span>
                                <span className="font-mono text-purple-700 font-bold">@{remoteEmployeeData.employee.username}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-medium">Mobile Phone</span>
                                <span className="font-mono font-semibold text-slate-800">{remoteEmployeeData.employee.mobile || 'Not set'}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-medium">Email Address</span>
                                <span className="font-mono font-semibold text-slate-800">{remoteEmployeeData.employee.email || 'Not set'}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-medium">Department & Designation</span>
                                <span className="font-semibold text-slate-900">{remoteEmployeeData.employee.department || 'General'} • {remoteEmployeeData.employee.designation || 'Staff'}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-medium">Assigned Shift</span>
                                <span className="font-semibold text-slate-900">{remoteEmployeeData.employee.shift_name || 'Standard'}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-medium">Assigned Geofence</span>
                                <span className="font-semibold text-slate-900">{remoteEmployeeData.employee.geofence_name || 'Main Office'}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-medium">Account Status</span>
                                <span className={`inline-block px-2 py-0.5 rounded-full font-bold uppercase text-[10px] mt-0.5 ${
                                  remoteEmployeeData.employee.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                }`}>
                                  {remoteEmployeeData.employee.status}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* HARDWARE & DEVICE LOCK */}
                          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 text-xs">
                            <div className="flex items-center justify-between border-b pb-3">
                              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-xs flex items-center gap-2">
                                <Laptop className="w-4 h-4 text-indigo-600" />
                                <span>Hardware MAC Lock & Registered Device</span>
                              </h4>
                              {remoteEmployeeData.device && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedDevice(remoteEmployeeData.device);
                                    setShowUnbindModal(true);
                                  }}
                                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-xl transition-colors flex items-center gap-1.5"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span>Deregister Device Lock</span>
                                </button>
                              )}
                            </div>

                            {remoteEmployeeData.device ? (
                              <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <span className="font-bold text-slate-900 block">MAC Address: {remoteEmployeeData.device.mac_address || 'Registered'}</span>
                                  <span className="text-slate-500 font-mono text-[11px]">
                                    Device: {remoteEmployeeData.device.device_name || 'PC / Mobile'} • Status: {remoteEmployeeData.device.status}
                                  </span>
                                </div>
                                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px] uppercase">
                                  Device Locked (1-to-1 Bound)
                                </span>
                              </div>
                            ) : (
                              <div className="p-4 bg-slate-50 rounded-xl text-center text-slate-400">
                                No device is currently locked to this employee account. Login allowed from any authorized browser.
                              </div>
                            )}
                          </div>

                          {/* RESET PASSWORD / CREDENTIALS */}
                          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 text-xs">
                            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-xs flex items-center gap-2 border-b pb-3">
                              <Key className="w-4 h-4 text-purple-600" />
                              <span>Reset Employee Login Password</span>
                            </h4>
                            <div className="flex flex-wrap items-center gap-3">
                              <input
                                type="text"
                                placeholder="Enter new password"
                                value={remoteNewPassword}
                                onChange={(e) => setRemoteNewPassword(e.target.value)}
                                className="p-2 border border-slate-200 rounded-xl text-xs max-w-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoteResetPassword(remoteEmployeeData.employee.user_id, remoteEmployeeData.employee.full_name)}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-all shadow-xs"
                              >
                                Update Password
                              </button>
                            </div>
                          </div>

                          {/* DANGER ZONE: PERMANENT DELETION */}
                          {pLevel >= 4 && (
                            <div className="bg-rose-50/50 rounded-2xl border border-rose-200 p-5 shadow-sm space-y-3 text-xs">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-bold text-rose-900 uppercase tracking-wider text-xs flex items-center gap-2">
                                    <Trash2 className="w-4 h-4 text-rose-600" />
                                    <span>Danger Zone: Permanent Account Deletion</span>
                                  </h4>
                                  <p className="text-[11px] text-rose-700 mt-0.5">
                                    Permanently wipes this employee from SQLite, Firestore, and Realtime Database with zero recovery.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoteConfirmDeleteEmployee(remoteEmployeeData.employee.id, remoteEmployeeData.employee.full_name || remoteEmployeeData.employee.username)}
                                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Permanently Delete Employee</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ========================================================================= */}
              {/* PERSPECTIVE 2: MANAGER PERSPECTIVE */}
              {/* ========================================================================= */}
              {!remoteCompanyLoading && remotePerspective === 'manager' && remoteCompanyData && (
                <div className="space-y-4">
                  {/* MANAGER SELECTOR */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-bold text-slate-600">Select Manager:</span>
                      <select
                        value={remoteSelectedMgrId || ''}
                        onChange={(e) => setRemoteSelectedMgrId(e.target.value)}
                        className="text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                      >
                        {(remoteCompanyData.managers || []).map(m => (
                          <option key={m.id} value={m.id}>
                            {m.full_name || m.fullName || m.username} ({m.department || 'Manager'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* MANAGER SUB-NAV TABS */}
                    <div className="flex flex-wrap items-center gap-1">
                      {[
                        { id: 'dashboard', label: 'Dashboard', icon: Layers },
                        { id: 'team', label: 'My Team', icon: Users },
                        { id: 'attendance-logs', label: 'Team Attendance', icon: Clock },
                        { id: 'corrections', label: 'Correction Reviews', icon: CheckSquare },
                        { id: 'leaves', label: 'Leave Approvals', icon: Award },
                        { id: 'my-attendance', label: 'Personal Calendar', icon: Calendar },
                        { id: 'tickets', label: 'Helpdesk', icon: MessageSquare },
                        { id: 'profile', label: 'Profile', icon: Shield }
                      ].map(tab => {
                        const Icon = tab.icon;
                        const isActive = remoteMgrTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setRemoteMgrTab(tab.id)}
                            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
                              isActive
                                ? 'bg-purple-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{tab.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(() => {
                    const activeMgr = (remoteCompanyData.managers || []).find(m => String(m.id) === String(remoteSelectedMgrId)) || remoteCompanyData.managers?.[0];
                    if (!activeMgr) {
                      return (
                        <div className="p-8 bg-white rounded-2xl border text-center text-xs text-slate-500">
                          No manager account found in this company.
                        </div>
                      );
                    }
                    const mgrTeam = (remoteCompanyData.employees || []).filter(e => String(e.manager_id || e.managerId) === String(activeMgr.id));
                    const mgrLeaves = (remoteCompanyData.leaveRequests || []).filter(lr => mgrTeam.some(tm => String(tm.id) === String(lr.employee_id)));
                    const mgrCorrections = (remoteCompanyData.correctionRequests || []).filter(cr => mgrTeam.some(tm => String(tm.id) === String(cr.employee_id)));
                    const mgrAttLogs = (remoteCompanyData.attendanceLogs || []).filter(att => mgrTeam.some(tm => String(tm.id) === String(att.employee_id)));

                    return (
                      <div className="space-y-4">
                        {/* MANAGER TAB 1: DASHBOARD */}
                        {remoteMgrTab === 'dashboard' && (
                          <div className="space-y-4">
                            <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 border border-purple-100 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
                              <div className="flex items-center gap-3.5">
                                <div className="w-14 h-14 rounded-2xl bg-purple-600 text-white font-black text-xl flex items-center justify-center shadow-xs">
                                  {(activeMgr.full_name || activeMgr.username || 'M')[0].toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-900 text-base">{activeMgr.full_name || activeMgr.username}</span>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-200 text-purple-800">
                                      Manager
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-600 mt-1">
                                    Dept: <span className="font-semibold text-slate-800">{activeMgr.department || 'General'}</span> •
                                    Designation: <span className="font-semibold text-slate-800">{activeMgr.designation || 'Team Lead'}</span> •
                                    Mobile: <span className="font-mono">{activeMgr.mobile || 'N/A'}</span>
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleRemoteSelectEmployee(activeMgr.id);
                                    setRemotePerspective('employee');
                                  }}
                                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                                >
                                  <User className="w-3.5 h-3.5" />
                                  <span>Inspect as Employee View</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openRemoteApplyLeaveModal(activeMgr.id)}
                                  className="px-3.5 py-2 bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 rounded-xl text-xs font-bold transition-all"
                                >
                                  Apply Leave for Manager
                                </button>
                              </div>
                            </div>

                            {/* STAT STRIP */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <div className="bg-white rounded-2xl border p-4 shadow-sm">
                                <span className="text-slate-400 font-bold uppercase text-[10px]">Direct Reports</span>
                                <p className="text-2xl font-black text-slate-900 mt-1">{mgrTeam.length}</p>
                              </div>
                              <div className="bg-white rounded-2xl border p-4 shadow-sm">
                                <span className="text-slate-400 font-bold uppercase text-[10px]">Team Pending Leaves</span>
                                <p className="text-2xl font-black text-amber-600 mt-1">
                                  {mgrLeaves.filter(l => l.status === 'pending').length}
                                </p>
                              </div>
                              <div className="bg-white rounded-2xl border p-4 shadow-sm">
                                <span className="text-slate-400 font-bold uppercase text-[10px]">Team Pending Corrections</span>
                                <p className="text-2xl font-black text-purple-600 mt-1">
                                  {mgrCorrections.filter(c => c.status === 'pending').length}
                                </p>
                              </div>
                              <div className="bg-white rounded-2xl border p-4 shadow-sm">
                                <span className="text-slate-400 font-bold uppercase text-[10px]">Team Punches Logged</span>
                                <p className="text-2xl font-black text-emerald-600 mt-1">{mgrAttLogs.length}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* MANAGER TAB 2: MY TEAM */}
                        {remoteMgrTab === 'team' && (
                          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                Direct Reporting Team ({mgrTeam.length})
                              </h4>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                                  <tr>
                                    <th className="p-3">Staff / Code</th>
                                    <th className="p-3">Designation</th>
                                    <th className="p-3">Mobile</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3 text-right">Support Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {mgrTeam.map(tm => (
                                    <tr key={tm.id} className="hover:bg-slate-50/50">
                                      <td className="p-3">
                                        <div className="font-bold text-slate-900">{tm.full_name || tm.fullName || tm.username}</div>
                                        <div className="text-[10px] text-slate-400 font-mono">{tm.employee_code || `ID:${tm.id}`}</div>
                                      </td>
                                      <td className="p-3 text-slate-600">{tm.designation || '-'}</td>
                                      <td className="p-3 font-mono text-slate-700">{tm.mobile || '-'}</td>
                                      <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                          tm.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                        }`}>
                                          {tm.status}
                                        </span>
                                      </td>
                                      <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              handleRemoteSelectEmployee(tm.id);
                                              setRemotePerspective('employee');
                                            }}
                                            className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-lg text-xs"
                                          >
                                            Inspect
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => openRemoteApplyLeaveModal(tm.id)}
                                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs"
                                          >
                                            Apply Leave
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => openRemotePunchModal(tm.id)}
                                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs"
                                          >
                                            Punch
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                  {mgrTeam.length === 0 && (
                                    <tr>
                                      <td colSpan="5" className="p-8 text-center text-slate-400 text-xs">
                                        No direct reporting team members assigned to this manager.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* MANAGER TAB 3: TEAM ATTENDANCE */}
                        {remoteMgrTab === 'attendance-logs' && (
                          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                Team Attendance Punches & Logs
                              </h4>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                                  <tr>
                                    <th className="p-3">Staff</th>
                                    <th className="p-3">Date</th>
                                    <th className="p-3">In</th>
                                    <th className="p-3">Out</th>
                                    <th className="p-3">Hours</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3 text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {mgrAttLogs.map(att => (
                                    <tr key={att.id} className="hover:bg-slate-50/50">
                                      <td className="p-3 font-bold text-slate-900">{att.employee_name}</td>
                                      <td className="p-3 font-mono text-slate-700">{att.date}</td>
                                      <td className="p-3 font-mono text-emerald-700">{att.punch_in_time || '-'}</td>
                                      <td className="p-3 font-mono text-sky-700">{att.punch_out_time || '-'}</td>
                                      <td className="p-3 font-bold text-slate-800">{att.total_hours || '-'} hrs</td>
                                      <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                          att.status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                        }`}>
                                          {att.status}
                                        </span>
                                      </td>
                                      <td className="p-3 text-right">
                                        <button
                                          type="button"
                                          onClick={() => handleRemoteDeleteAttendance(att.id)}
                                          className="p-1 text-slate-400 hover:text-rose-600"
                                          title="Permanently delete punch (Zero recovery)"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                  {mgrAttLogs.length === 0 && (
                                    <tr>
                                      <td colSpan="7" className="p-8 text-center text-slate-400 text-xs">
                                        No attendance records found for this manager's team.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* MANAGER TAB 4: CORRECTIONS */}
                        {remoteMgrTab === 'corrections' && (
                          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                Team Attendance Correction Requests
                              </h4>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                                  <tr>
                                    <th className="p-3">Staff</th>
                                    <th className="p-3">Date</th>
                                    <th className="p-3">Requested In/Out</th>
                                    <th className="p-3">Reason</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {mgrCorrections.map(cr => (
                                    <tr key={cr.id} className="hover:bg-slate-50/50">
                                      <td className="p-3 font-bold text-slate-900">{cr.employee_name}</td>
                                      <td className="p-3 font-mono text-slate-700">{cr.date}</td>
                                      <td className="p-3 font-mono text-slate-600">
                                        In: {cr.requested_punch_in || '-'} | Out: {cr.requested_punch_out || '-'}
                                      </td>
                                      <td className="p-3 text-slate-600 max-w-xs truncate">{cr.reason}</td>
                                      <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                          cr.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                          cr.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                                          'bg-amber-100 text-amber-700'
                                        }`}>
                                          {cr.status}
                                        </span>
                                      </td>
                                      <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                          {cr.status === 'pending' && (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() => handleRemoteReviewCorrection(cr.id, 'approved', `Approved on behalf of Manager (${activeMgr.full_name})`)}
                                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded text-[10px]"
                                              >
                                                Approve
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleRemoteReviewCorrection(cr.id, 'rejected', `Rejected on behalf of Manager (${activeMgr.full_name})`)}
                                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded text-[10px]"
                                              >
                                                Reject
                                              </button>
                                            </>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => handleRemoteDeleteCorrection(cr.id)}
                                            className="p-1 text-slate-400 hover:text-rose-600"
                                            title="Permanently delete correction (Zero recovery)"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                  {mgrCorrections.length === 0 && (
                                    <tr>
                                      <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">
                                        No correction requests submitted by this manager's team.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* MANAGER TAB 5: LEAVES */}
                        {remoteMgrTab === 'leaves' && (
                          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                Manager's Team Leave Approvals Desk
                              </h4>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                                  <tr>
                                    <th className="p-3">Team Member</th>
                                    <th className="p-3">Leave Type</th>
                                    <th className="p-3">Dates & Days</th>
                                    <th className="p-3">Reason</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3 text-right">Support Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {mgrLeaves.map(lr => (
                                    <tr key={lr.id} className="hover:bg-slate-50/50">
                                      <td className="p-3 font-semibold text-slate-900">{lr.employee_name}</td>
                                      <td className="p-3 font-semibold text-purple-700">{lr.leave_type_name || 'Leave'}</td>
                                      <td className="p-3 text-slate-600">{lr.start_date} to {lr.end_date} ({lr.total_days} d)</td>
                                      <td className="p-3 text-slate-600 max-w-xs truncate">{lr.reason}</td>
                                      <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                          lr.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                          lr.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                                          'bg-amber-100 text-amber-700'
                                        }`}>
                                          {lr.status}
                                        </span>
                                      </td>
                                      <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                          {lr.status === 'pending' && (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() => handleRemoteUpdateLeaveStatus(lr.id, 'approved', `Approved on behalf of Manager (${activeMgr.full_name})`)}
                                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded text-[10px]"
                                              >
                                                Approve
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleRemoteUpdateLeaveStatus(lr.id, 'rejected', `Rejected on behalf of Manager (${activeMgr.full_name})`)}
                                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded text-[10px]"
                                              >
                                                Reject
                                              </button>
                                            </>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => handleRemoteDeleteLeave(lr.id)}
                                            className="p-1 text-slate-400 hover:text-rose-600"
                                            title="Permanently delete leave (Zero recovery, refunds days)"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                  {mgrLeaves.length === 0 && (
                                    <tr>
                                      <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">
                                        No leave requests submitted by this manager's team.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* MANAGER TAB 6: PERSONAL ATTENDANCE & CALENDAR */}
                        {remoteMgrTab === 'my-attendance' && (
                          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                              Manager's Personal Attendance Calendar ({activeMgr.full_name})
                            </h4>
                            <UnifiedCalendar
                              companyId={remoteCompanyData?.company?.id}
                              employeeId={activeMgr.id}
                              role="manager"
                            />
                          </div>
                        )}

                        {/* MANAGER TAB 7: TICKETS */}
                        {remoteMgrTab === 'tickets' && (
                          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Manager / Team Service Tickets</h4>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                                  <tr>
                                    <th className="p-3">Ticket #</th>
                                    <th className="p-3">Staff</th>
                                    <th className="p-3">Title</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {(remoteCompanyData.tickets || [])
                                    .filter(t => t.employee_id === activeMgr.id || mgrTeam.some(tm => tm.id === t.employee_id))
                                    .map(tkt => (
                                      <tr key={tkt.id} className="hover:bg-slate-50/50">
                                        <td className="p-3 font-mono font-bold text-purple-700">#{tkt.id}</td>
                                        <td className="p-3 font-bold text-slate-900">{tkt.employee_name || 'Staff'}</td>
                                        <td className="p-3 text-slate-700">{tkt.title}</td>
                                        <td className="p-3">
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700">
                                            {tkt.status}
                                          </span>
                                        </td>
                                        <td className="p-3 text-right">
                                          <div className="flex items-center justify-end gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setChatTicketId(tkt.id);
                                                setShowChatModal(true);
                                              }}
                                              className="px-2.5 py-1 bg-purple-50 text-purple-700 font-bold rounded-lg text-xs"
                                            >
                                              Chat
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleRemoteDeleteTicket(tkt.id)}
                                              className="p-1 text-slate-400 hover:text-rose-600"
                                              title="Permanently delete ticket"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* MANAGER TAB 8: PROFILE */}
                        {remoteMgrTab === 'profile' && (
                          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 text-xs">
                            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-xs">Manager Profile & Admin Operations</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              <div>
                                <span className="text-slate-400 block font-medium">Full Name</span>
                                <span className="font-bold text-slate-900 text-sm">{activeMgr.full_name}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-medium">Department</span>
                                <span className="font-bold text-slate-900">{activeMgr.department}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-medium">Mobile</span>
                                <span className="font-mono font-bold text-slate-900">{activeMgr.mobile}</span>
                              </div>
                            </div>
                            <div className="pt-3 border-t flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openRemoteEditProfileModal(activeMgr)}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl transition-colors"
                              >
                                Edit Profile
                              </button>
                              {pLevel >= 4 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoteConfirmDeleteEmployee(activeMgr.id, activeMgr.full_name)}
                                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-xl transition-colors"
                                >
                                  Permanently Delete Manager Account
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ========================================================================= */}
              {/* PERSPECTIVE 3: COMPANY ADMIN PERSPECTIVE */}
              {/* ========================================================================= */}
              {!remoteCompanyLoading && remotePerspective === 'company' && remoteCompanyData && (
                <div className="space-y-4">
                  {/* COMPANY SUB-NAV TABS */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {[
                        { id: 'dashboard', label: 'Dashboard', icon: Layers },
                        { id: 'directory', label: 'Personnel Directory', icon: Users },
                        { id: 'attendance', label: 'Attendance Records', icon: Clock },
                        {
                          id: 'corrections',
                          label: 'Attendance Corrections',
                          icon: CheckSquare,
                          badge: (remoteCompanyData.correctionRequests || []).filter(c => c.status === 'pending').length
                        },
                        {
                          id: 'leaves',
                          label: 'Leave Management',
                          icon: Award,
                          badge: (remoteCompanyData.leaveRequests || []).filter(l => l.status === 'pending').length
                        },
                        { id: 'shifts-geofences', label: 'Shifts & Geofences', icon: MapPin },
                        { id: 'tickets', label: 'Company Tickets', icon: MessageSquare },
                        { id: 'settings', label: 'Company Settings', icon: Building2 }
                      ].map(tab => {
                        const Icon = tab.icon;
                        const isActive = remoteCompTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setRemoteCompTab(tab.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                              isActive
                                ? 'bg-purple-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{tab.label}</span>
                            {Boolean(tab.badge) && (
                              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                                isActive ? 'bg-white text-purple-700' : 'bg-rose-100 text-rose-700'
                              }`}>
                                {tab.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openRemoteApplyLeaveModal()}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Apply Leave</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openRemotePunchModal()}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Record Punch</span>
                      </button>
                    </div>
                  </div>

                  {/* COMPANY TAB 1: DASHBOARD */}
                  {remoteCompTab === 'dashboard' && (
                    <div className="space-y-4">
                      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 text-white rounded-2xl p-6 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h2 className="text-xl font-bold tracking-tight">
                                {remoteCompanyData.company?.legal_name || remoteCompanyData.company?.name || 'Company Portal'}
                              </h2>
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                {remoteCompanyData.company?.status || 'Active'}
                              </span>
                            </div>
                            <p className="text-xs text-purple-200/80 mt-1">
                              Company Code: <span className="font-mono font-bold text-white">{remoteCompanyData.company?.company_code || remoteCompanyData.company?.code}</span> •
                              Admin: <span className="font-bold text-white">{remoteCompanyData.admin?.full_name || remoteCompanyData.admin?.username || 'N/A'}</span> ({remoteCompanyData.admin?.email || 'No email'}) •
                              Timezone: <span className="text-white">{remoteCompanyData.company?.timezone || 'Asia/Kolkata'}</span>
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-white/10 text-xs">
                          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                            <span className="text-[11px] text-purple-200 uppercase font-semibold">Total Personnel</span>
                            <p className="text-xl font-bold mt-1">{remoteCompanyData.employees?.length || 0}</p>
                          </div>
                          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                            <span className="text-[11px] text-purple-200 uppercase font-semibold">Managers</span>
                            <p className="text-xl font-bold mt-1">{remoteCompanyData.managers?.length || 0}</p>
                          </div>
                          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                            <span className="text-[11px] text-purple-200 uppercase font-semibold">Configured Shifts</span>
                            <p className="text-xl font-bold mt-1">{remoteCompanyData.shifts?.length || 0}</p>
                          </div>
                          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                            <span className="text-[11px] text-purple-200 uppercase font-semibold">Geofence Zones</span>
                            <p className="text-xl font-bold mt-1">{remoteCompanyData.geofences?.length || 0}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* COMPANY TAB 2: DIRECTORY */}
                  {remoteCompTab === 'directory' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Company Personnel Directory</h4>
                          <p className="text-[11px] text-slate-400">All registered employees, managers, and admin accounts</p>
                        </div>
                        <input
                          type="text"
                          placeholder="Search personnel by name or code..."
                          value={remoteCompSearch}
                          onChange={(e) => setRemoteCompSearch(e.target.value)}
                          className="p-1.5 px-3 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 w-64"
                        />
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                            <tr>
                              <th className="p-3">Staff / Code</th>
                              <th className="p-3">Role</th>
                              <th className="p-3">Department & Designation</th>
                              <th className="p-3">Contact</th>
                              <th className="p-3">Status</th>
                              <th className="p-3 text-right">Operational Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(remoteCompanyData.employees || [])
                              .filter(emp => {
                                if (!remoteCompSearch.trim()) return true;
                                const s = remoteCompSearch.toLowerCase();
                                return (
                                  (emp.full_name || '').toLowerCase().includes(s) ||
                                  (emp.employee_code || '').toLowerCase().includes(s) ||
                                  (emp.department || '').toLowerCase().includes(s) ||
                                  (emp.username || '').toLowerCase().includes(s)
                                );
                              })
                              .map(emp => (
                                <tr key={emp.id} className="hover:bg-purple-50/30 transition-colors">
                                  <td className="p-3">
                                    <div className="font-bold text-slate-900">{emp.full_name || emp.fullName || emp.username}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      {emp.employee_code || `ID: ${emp.id}`} • @{emp.username || 'user'}
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      emp.role === 'manager' || emp.role_name === 'manager'
                                        ? 'bg-purple-100 text-purple-700'
                                        : 'bg-slate-100 text-slate-700'
                                    }`}>
                                      {emp.role || emp.role_name || 'employee'}
                                    </span>
                                  </td>
                                  <td className="p-3 text-slate-600">
                                    <div>{emp.department || 'General'}</div>
                                    <div className="text-[10px] text-slate-400">{emp.designation || '-'}</div>
                                  </td>
                                  <td className="p-3 text-slate-600 font-mono text-[11px]">
                                    <div>{emp.mobile || '-'}</div>
                                    <div className="text-[10px] text-slate-400">{emp.email || '-'}</div>
                                  </td>
                                  <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      emp.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                    }`}>
                                      {emp.status}
                                    </span>
                                  </td>
                                  <td className="p-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleRemoteSelectEmployee(emp.id);
                                          setRemotePerspective('employee');
                                        }}
                                        className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-lg text-[11px] transition-colors flex items-center gap-1"
                                      >
                                        <User className="w-3 h-3" />
                                        <span>Inspect</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openRemoteApplyLeaveModal(emp.id)}
                                        className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-[11px]"
                                      >
                                        Leave
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openRemotePunchModal(emp.id)}
                                        className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-[11px]"
                                      >
                                        Punch
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openRemoteEditProfileModal(emp)}
                                        className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </button>
                                      {pLevel >= 4 && (
                                        <button
                                          type="button"
                                          onClick={() => handleRemoteConfirmDeleteEmployee(emp.id, emp.full_name || emp.username)}
                                          className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg"
                                          title="Permanently delete account (Zero recovery)"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* COMPANY TAB 3: ATTENDANCE RECORDS */}
                  {remoteCompTab === 'attendance' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Company Attendance Live Feed</h4>
                          <p className="text-[11px] text-slate-400">Punch logs and timesheet across all company personnel</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openRemotePunchModal()}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Record Manual Punch</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                            <tr>
                              <th className="p-3">Staff / Code</th>
                              <th className="p-3">Date</th>
                              <th className="p-3">In</th>
                              <th className="p-3">Out</th>
                              <th className="p-3">Hours</th>
                              <th className="p-3">Status</th>
                              <th className="p-3 text-right">Support Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(remoteCompanyData.attendanceLogs || []).map(att => (
                              <tr key={att.id} className="hover:bg-slate-50/50">
                                <td className="p-3 font-semibold text-slate-900">{att.employee_name}</td>
                                <td className="p-3 font-mono text-slate-700">{att.date}</td>
                                <td className="p-3 font-mono text-emerald-700">{att.punch_in_time || '-'}</td>
                                <td className="p-3 font-mono text-sky-700">{att.punch_out_time || '-'}</td>
                                <td className="p-3 font-bold text-slate-800">{att.total_hours || '-'} hrs</td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    att.status === 'Present' ? 'bg-emerald-100 text-emerald-700' :
                                    att.status === 'Half Day' ? 'bg-amber-100 text-amber-700' :
                                    'bg-rose-100 text-rose-700'
                                  }`}>
                                    {att.status}
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoteDeleteAttendance(att.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                    title="Permanently delete punch record (Zero recovery)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {(remoteCompanyData.attendanceLogs || []).length === 0 && (
                              <tr>
                                <td colSpan="7" className="p-8 text-center text-slate-400 text-xs">
                                  No attendance logs recorded today.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* COMPANY TAB 4: CORRECTIONS */}
                  {remoteCompTab === 'corrections' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Attendance Corrections Desk</h4>
                          <p className="text-[11px] text-slate-400">Review, approve, reject, or permanently delete correction requests</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openRemoteCorrectionModal()}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Submit Correction for Staff</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                            <tr>
                              <th className="p-3">Staff / Code</th>
                              <th className="p-3">Date</th>
                              <th className="p-3">Requested In / Out</th>
                              <th className="p-3">Reason</th>
                              <th className="p-3">Status</th>
                              <th className="p-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(remoteCompanyData.correctionRequests || []).map(cr => (
                              <tr key={cr.id} className="hover:bg-slate-50/50">
                                <td className="p-3 font-semibold text-slate-900">{cr.employee_name}</td>
                                <td className="p-3 font-mono text-slate-700">{cr.date}</td>
                                <td className="p-3 font-mono text-slate-600">
                                  In: {cr.requested_punch_in || '-'} | Out: {cr.requested_punch_out || '-'}
                                </td>
                                <td className="p-3 text-slate-600 max-w-xs truncate">{cr.reason}</td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                    cr.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                    cr.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>
                                    {cr.status}
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {cr.status === 'pending' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoteReviewCorrection(cr.id, 'approved', 'Approved by Support on Company Desk')}
                                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded text-[10px]"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoteReviewCorrection(cr.id, 'rejected', 'Rejected by Support')}
                                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded text-[10px]"
                                        >
                                          Reject
                                        </button>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoteDeleteCorrection(cr.id)}
                                      className="p-1 text-slate-400 hover:text-rose-600"
                                      title="Permanently delete correction request"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {(remoteCompanyData.correctionRequests || []).length === 0 && (
                              <tr>
                                <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">
                                  No correction requests recorded for this company.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* COMPANY TAB 5: LEAVES */}
                  {remoteCompTab === 'leaves' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Company Leave Requests Desk</h4>
                          <p className="text-[11px] text-slate-400">Review, approve, reject, or permanently delete leaves across the company</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openRemoteApplyLeaveModal()}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Apply Leave for Staff</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                            <tr>
                              <th className="p-3">Staff / Code</th>
                              <th className="p-3">Leave Type</th>
                              <th className="p-3">Dates & Days</th>
                              <th className="p-3">Reason</th>
                              <th className="p-3">Status</th>
                              <th className="p-3 text-right">Support Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(remoteCompanyData.leaveRequests || []).map(lr => (
                              <tr key={lr.id} className="hover:bg-slate-50/50">
                                <td className="p-3 font-semibold text-slate-900">{lr.employee_name}</td>
                                <td className="p-3 font-semibold text-purple-700">{lr.leave_type_name || 'Leave'}</td>
                                <td className="p-3 text-slate-600">{lr.start_date} to {lr.end_date} ({lr.total_days} d)</td>
                                <td className="p-3 text-slate-600 max-w-xs truncate">{lr.reason}</td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                    lr.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                    lr.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>
                                    {lr.status}
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {lr.status === 'pending' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoteUpdateLeaveStatus(lr.id, 'approved')}
                                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded text-[10px]"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoteUpdateLeaveStatus(lr.id, 'rejected')}
                                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded text-[10px]"
                                        >
                                          Reject
                                        </button>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoteDeleteLeave(lr.id)}
                                      className="p-1 text-slate-400 hover:text-rose-600"
                                      title="Permanently delete leave request (Zero recovery, refunds days)"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {(remoteCompanyData.leaveRequests || []).length === 0 && (
                              <tr>
                                <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">
                                  No leave requests recorded for this company.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* COMPANY TAB 6: SHIFTS & GEOFENCES */}
                  {remoteCompTab === 'shifts-geofences' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {/* SHIFTS */}
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-purple-600" />
                          <span>Configured Shifts ({(remoteCompanyData.shifts || []).length})</span>
                        </h4>
                        <div className="space-y-2">
                          {(remoteCompanyData.shifts || []).map(s => (
                            <div key={s.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                              <div>
                                <span className="font-bold text-slate-900">{s.name}</span>
                                <span className="text-slate-500 font-mono block text-[11px]">
                                  {s.start_time} - {s.end_time} ({s.working_hours || 8.5} hrs)
                                </span>
                              </div>
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px] uppercase">
                                {s.status || 'Active'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* GEOFENCES */}
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-emerald-600" />
                          <span>Geofence Attendance Zones ({(remoteCompanyData.geofences || []).length})</span>
                        </h4>
                        <div className="space-y-2">
                          {(remoteCompanyData.geofences || []).map(g => (
                            <div key={g.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                              <div>
                                <span className="font-bold text-slate-900">{g.location_name}</span>
                                <span className="text-slate-500 font-mono block text-[11px]">
                                  Radius: {g.radius}m • Lat: {g.latitude?.toFixed(4)}, Lng: {g.longitude?.toFixed(4)}
                                </span>
                              </div>
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px] uppercase">
                                {g.status || 'Active'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* COMPANY TAB 7: TICKETS */}
                  {remoteCompTab === 'tickets' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">All Company Tickets & Inquiries</h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                            <tr>
                              <th className="p-3">Ticket #</th>
                              <th className="p-3">Staff</th>
                              <th className="p-3">Title</th>
                              <th className="p-3">Status</th>
                              <th className="p-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(remoteCompanyData.tickets || []).map(tkt => (
                              <tr key={tkt.id} className="hover:bg-slate-50/50">
                                <td className="p-3 font-mono font-bold text-purple-700">#{tkt.id}</td>
                                <td className="p-3 font-bold text-slate-900">{tkt.employee_name || 'Personnel'}</td>
                                <td className="p-3 text-slate-700">{tkt.title}</td>
                                <td className="p-3">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700">
                                    {tkt.status}
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setChatTicketId(tkt.id);
                                        setShowChatModal(true);
                                      }}
                                      className="px-2.5 py-1 bg-purple-50 text-purple-700 font-bold rounded-lg text-xs"
                                    >
                                      Chat
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoteDeleteTicket(tkt.id)}
                                      className="p-1 text-slate-400 hover:text-rose-600"
                                      title="Permanently delete ticket"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {(remoteCompanyData.tickets || []).length === 0 && (
                              <tr>
                                <td colSpan="5" className="p-8 text-center text-slate-400 text-xs">
                                  No service tickets filed for this company.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* COMPANY TAB 8: SETTINGS */}
                  {remoteCompTab === 'settings' && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 text-xs">
                      <h4 className="font-bold text-slate-900 uppercase tracking-wider text-xs">Company System Profile & Configuration</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                          <span className="text-slate-400 block font-medium">Legal Name</span>
                          <span className="font-bold text-slate-900 text-sm">{remoteCompanyData.company?.legal_name || remoteCompanyData.company?.name}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-medium">Company Code</span>
                          <span className="font-mono font-bold text-slate-900">{remoteCompanyData.company?.company_code || remoteCompanyData.company?.code}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-medium">Admin User</span>
                          <span className="font-bold text-purple-700">@{remoteCompanyData.admin?.username || 'admin'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-medium">Contact Email</span>
                          <span className="font-mono text-slate-800">{remoteCompanyData.company?.email || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-medium">Phone</span>
                          <span className="font-mono text-slate-800">{remoteCompanyData.company?.phone || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-medium">Timezone</span>
                          <span className="text-slate-800">{remoteCompanyData.company?.timezone || 'Asia/Kolkata'}</span>
                        </div>
                      </div>

                      {pLevel >= 4 && (
                        <div className="mt-6 pt-5 border-t border-rose-200 bg-rose-50/50 p-4 rounded-xl space-y-2">
                          <h5 className="font-bold text-rose-900">Danger Zone: Permanent Company Wipe</h5>
                          <p className="text-[11px] text-rose-700">
                            Permanent deletion of this entire company including all staff, attendance history, leave quotas, and device locks across SQLite, Firestore, and Realtime Database.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`PERMANENT COMPANY WIPE WARNING:\nAre you sure you want to permanently erase "${remoteCompanyData.company?.legal_name || remoteCompanyData.company?.name}"?\nZero data will be recoverable.`)) {
                                apiRequest(`/companies/${remoteCompanyData.company.id}`, { method: 'DELETE' })
                                  .then(res => {
                                    setSuccess(res.message || 'Company permanently wiped.');
                                    fetchData();
                                  })
                                  .catch(err => setError(err.message));
                              }
                            }}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all shadow-xs"
                          >
                            Permanently Wipe Company Data
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* USER & ISSUE DIAGNOSTICS / RESOLUTION HUB MODAL */}
      {/* ========================================================================= */}
      {selectedUserDiag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* MODAL HEADER */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                  {(selectedUserDiag.full_name || selectedUserDiag.username)[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    {selectedUserDiag.full_name || selectedUserDiag.username}
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-800">
                      {selectedUserDiag.role_name}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      selectedUserDiag.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {selectedUserDiag.status}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    @{selectedUserDiag.username} • {selectedUserDiag.company_name || 'No Company'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserDiag(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* NAVIGATION PILLS INSIDE MODAL */}
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2 text-xs">
              <button
                type="button"
                onClick={() => setUserDiagTab('requirements')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  userDiagTab === 'requirements'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Update Requirements & Credentials
              </button>
              <button
                type="button"
                onClick={() => setUserDiagTab('device')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  userDiagTab === 'device'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Device & MAC Lock ({selectedUserDiag.device ? '1 Bound' : 'None'})
              </button>
              <button
                type="button"
                onClick={() => setUserDiagTab('tickets')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  userDiagTab === 'tickets'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Service Tickets ({selectedUserDiag.tickets?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setUserDiagTab('attendance')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  userDiagTab === 'attendance'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Attendance Logs
              </button>
            </div>

            {/* TAB 1: REQUIREMENTS & PROFILE UPDATE FORM */}
            {userDiagTab === 'requirements' && (
              <form onSubmit={handleSaveUserRequirements} className="space-y-4 text-xs">
                <div className="bg-purple-50/60 p-3 rounded-xl border border-purple-200 text-purple-900">
                  <p className="font-bold">Instant Account Requirements Update:</p>
                  <p className="text-[11px] text-purple-700 mt-0.5">
                    Modify contact information, toggle account active status, or reset credentials per employee/company request.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Phone / Mobile No.</label>
                    <input
                      type="text"
                      value={updateProfileForm.mobile}
                      onChange={(e) => setUpdateProfileForm({ ...updateProfileForm, mobile: e.target.value })}
                      placeholder="e.g. 9876543210"
                      className="w-full p-2.5 border rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Email ID</label>
                    <input
                      type="email"
                      value={updateProfileForm.email}
                      onChange={(e) => setUpdateProfileForm({ ...updateProfileForm, email: e.target.value })}
                      placeholder="e.g. user@company.com"
                      className="w-full p-2.5 border rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Account Status</label>
                    <select
                      value={updateProfileForm.status}
                      onChange={(e) => setUpdateProfileForm({ ...updateProfileForm, status: e.target.value })}
                      className="w-full p-2.5 border rounded-xl bg-white"
                    >
                      <option value="active">Active (Full Access)</option>
                      <option value="disabled">Disabled (Suspended)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Reset Password (Leave blank to keep current)</label>
                    <input
                      type="text"
                      value={updateProfileForm.password}
                      onChange={(e) => setUpdateProfileForm({ ...updateProfileForm, password: e.target.value })}
                      placeholder="Enter new password (min 4 chars)"
                      className="w-full p-2.5 border rounded-xl font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Mandatory Support Audit Reason *</label>
                  <textarea
                    rows={2}
                    required
                    value={updateProfileForm.reason}
                    onChange={(e) => setUpdateProfileForm({ ...updateProfileForm, reason: e.target.value })}
                    placeholder="e.g. Customer requested mobile number correction & password reset via helpline"
                    className="w-full p-2.5 border rounded-xl"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={updatingProfile}
                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold shadow-sm transition-all"
                  >
                    {updatingProfile ? 'Saving Requirements...' : 'Save & Update Requirements'}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: DEVICE SECURITY & UNBIND */}
            {userDiagTab === 'device' && (
              <div className="space-y-4 text-xs">
                {selectedUserDiag.device ? (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex justify-between">
                      <span className="font-semibold text-slate-600">Device Model:</span>
                      <span className="font-bold text-slate-900">{selectedUserDiag.device.device_name || selectedUserDiag.device.device_type}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-600">Locked MAC Address:</span>
                      <span className="font-mono font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded border border-purple-200 select-all">
                        {selectedUserDiag.device.mac_address || selectedUserDiag.device.device_id}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-slate-600">Bound IP:</span>
                      <span className="font-mono text-slate-700">{selectedUserDiag.device.bound_ip || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-slate-600">Status:</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {selectedUserDiag.device.status === 'bound' ? 'Single-Device Locked' : selectedUserDiag.device.status}
                      </span>
                    </div>

                    <div className="pt-3 border-t border-slate-200 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDevice(selectedUserDiag.device);
                          setUnbindReason('Employee requested device change / MAC lock reset.');
                          setShowUnbindModal(true);
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-sm"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        Deregister & Unlock Device
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 p-6 rounded-xl text-center border border-slate-200">
                    <Laptop className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-700">No Device Currently Bound</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">User will bind their new device automatically upon next login.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: TICKETS */}
            {userDiagTab === 'tickets' && (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-700">Associated Tickets</span>
                  <button
                    type="button"
                    onClick={() => setShowNewTicketModal(true)}
                    className="px-3 py-1 bg-purple-100 text-purple-700 hover:bg-purple-200 font-bold rounded-lg flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create Ticket for User
                  </button>
                </div>

                {selectedUserDiag.tickets && selectedUserDiag.tickets.length > 0 ? (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                    {selectedUserDiag.tickets.map(t => (
                      <div key={t.id} className="p-3 hover:bg-slate-50 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">#{t.id}</span>
                            <span className="font-semibold text-slate-800">{t.title}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                              t.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                              t.status === 'in_progress' ? 'bg-purple-100 text-purple-700' :
                              t.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {t.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{t.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setChatTicketId(t.id);
                            setShowChatModal(true);
                          }}
                          className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold flex items-center gap-1 shrink-0"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Chat
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-50 p-6 rounded-xl text-center border border-slate-200">
                    <Ticket className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-700">No Tickets Filed</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: ATTENDANCE HISTORY */}
            {userDiagTab === 'attendance' && (
              <div className="space-y-3 text-xs">
                <span className="font-bold text-slate-700">Recent Attendance Records</span>
                {selectedUserDiag.recentAttendance && selectedUserDiag.recentAttendance.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                        <tr>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Punch In</th>
                          <th className="p-2.5">Punch Out</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedUserDiag.recentAttendance.map(att => (
                          <tr key={att.id}>
                            <td className="p-2.5 font-semibold text-slate-900">{att.date}</td>
                            <td className="p-2.5 font-mono text-emerald-700">{att.punch_in_time || '-'}</td>
                            <td className="p-2.5 font-mono text-rose-700">{att.punch_out_time || '-'}</td>
                            <td className="p-2.5">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                                {att.status}
                              </span>
                            </td>
                            <td className="p-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAtt(att);
                                  setAttEditForm({
                                    punch_in_time: att.punch_in_time || '09:00:00',
                                    punch_out_time: att.punch_out_time || '18:00:00',
                                    status: att.status || 'Present',
                                    reason: ''
                                  });
                                  setEditAttendanceModal(true);
                                }}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                              >
                                Correct
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="bg-slate-50 p-6 rounded-xl text-center border border-slate-200">
                    <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-700">No Attendance Records Found</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE TICKET MODAL FROM HUB */}
      {showNewTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Log Ticket for {selectedUserDiag?.full_name || selectedUserDiag?.username}
            </h3>

            <form onSubmit={handleCreateSupportTicket} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Issue Category</label>
                <select
                  value={newTicketForm.request_type}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, request_type: e.target.value })}
                  className="w-full p-2 border rounded-xl bg-white"
                >
                  <option value="account_problem">Account Problem / Login Failure</option>
                  <option value="device_change">Device Change / MAC Reset</option>
                  <option value="missing_punch">Missing Punch Assistance</option>
                  <option value="attendance_correction">Attendance Correction</option>
                  <option value="password_reset">Password Reset Request</option>
                  <option value="other">Other Technical Inquiry</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Subject / Title *</label>
                <input
                  type="text"
                  required
                  value={newTicketForm.title}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, title: e.target.value })}
                  placeholder="e.g. Employee unable to punch in from remote site"
                  className="w-full p-2 border rounded-xl"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Description</label>
                <textarea
                  rows={3}
                  value={newTicketForm.description}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, description: e.target.value })}
                  placeholder="Details of complaint / issue..."
                  className="w-full p-2 border rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewTicketModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-xs"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SEND REMOTE ALERT MODAL */}
      {remoteShowAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Dispatch Priority Alert to {remoteSelectedUser?.full_name}
            </h3>

            <form onSubmit={handleSendRemoteAlert} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Alert Title *</label>
                <input
                  type="text"
                  required
                  value={remoteAlertData.title}
                  onChange={(e) => setRemoteAlertData({ ...remoteAlertData, title: e.target.value })}
                  placeholder="e.g. Action Required: Please verify Attendance"
                  className="w-full p-2 border rounded-xl"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Message Body *</label>
                <textarea
                  rows={3}
                  required
                  value={remoteAlertData.message}
                  onChange={(e) => setRemoteAlertData({ ...remoteAlertData, message: e.target.value })}
                  placeholder="Support Team has resolved your ticket..."
                  className="w-full p-2 border rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRemoteShowAlertModal(false)}
                  className="px-4 py-2 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-xs"
                >
                  Dispatch Alert
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEREGISTER DEVICE MODAL */}
      {showUnbindModal && selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <Unlock className="w-5 h-5 text-purple-600" />
              Deregister Employee Device (Unlock Account)
            </h3>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-600">Employee:</span>
                <span className="font-bold text-slate-900">{selectedDevice.full_name || selectedDevice.username} {selectedDevice.employee_code ? `(${selectedDevice.employee_code})` : ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-600">Company:</span>
                <span className="text-slate-800">{selectedDevice.company_name || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-600">Locked MAC Address:</span>
                <span className="font-mono font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded border border-purple-200">
                  {selectedDevice.mac_address || (selectedDevice.device_id && selectedDevice.device_id.startsWith('hw_') ? selectedDevice.device_id.replace('hw_', '') : selectedDevice.device_id)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-600">Device Details:</span>
                <span className="text-slate-700">{selectedDevice.device_name || selectedDevice.device_type}</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800">
              <p className="font-bold mb-0.5">Device Unlock Confirmation:</p>
              Deregistering this device will remove the single-device lock. On their next login attempt, the new device and its MAC address will automatically be registered and locked to this employee account.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mandatory Support Audit Reason *
              </label>
              <textarea
                rows={3}
                required
                value={unbindReason}
                onChange={(e) => setUnbindReason(e.target.value)}
                placeholder="e.g. Employee replaced mobile phone, verified via Support Ticket / HR"
                className="w-full p-2.5 border rounded-lg text-xs focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowUnbindModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUnbind}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all"
              >
                <Unlock className="w-3.5 h-3.5" />
                Confirm Deregistration & Unlock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESOLVE TICKET MODAL */}
      {showTicketModal && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Process Ticket #{selectedTicket.id}
            </h3>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <p className="font-bold text-slate-900">{selectedTicket.title}</p>
              <p className="text-slate-600">{selectedTicket.description}</p>
              <p className="text-slate-400 text-[10px]">Submitted by: {selectedTicket.employee_name}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Resolution Notes / Remarks
              </label>
              <textarea
                rows={3}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="e.g. Approved missing punch request and adjusted attendance record."
                className="w-full p-2.5 border rounded-lg text-xs focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowTicketModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleResolveTicket('resolved')}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium shadow-sm"
              >
                Approve & Resolve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ATTENDANCE MODAL (SINGLE OR BOTH PUNCH CORRECTION) */}
      {editAttendanceModal && selectedAtt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Attendance Correction Desk
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Update single punch (in or out) or both punch times with mandatory audit trail
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditAttendanceModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Information */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold text-slate-900">{selectedAtt.employee_name} ({selectedAtt.employee_code || `EMP #${selectedAtt.employee_id}`})</p>
                <p className="text-[11px] text-slate-500">{selectedAtt.company_name || 'Organization Staff'}</p>
              </div>
              <div className="text-right">
                <span className="font-mono font-semibold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {selectedAtt.date}
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">Current: {selectedAtt.status || 'Present'}</p>
              </div>
            </div>

            <form onSubmit={handleSaveAttendanceCorrection} className="space-y-4 text-xs">
              {/* Correction Mode Selector */}
              <div>
                <label className="font-bold text-slate-700 block mb-1.5 uppercase text-[10px] tracking-wider">
                  Select Correction Scope
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAttEditForm({ ...attEditForm, correction_type: 'both' })}
                    className={`py-2 px-2 rounded-xl font-bold text-center border transition-all ${
                      attEditForm.correction_type === 'both'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Both In & Out
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttEditForm({ ...attEditForm, correction_type: 'in' })}
                    className={`py-2 px-2 rounded-xl font-bold text-center border transition-all ${
                      attEditForm.correction_type === 'in'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Punch In Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttEditForm({ ...attEditForm, correction_type: 'out' })}
                    className={`py-2 px-2 rounded-xl font-bold text-center border transition-all ${
                      attEditForm.correction_type === 'out'
                        ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Punch Out Only
                  </button>
                </div>
              </div>

              {/* Time Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Punch In */}
                <div className={`p-3 rounded-xl border ${
                  attEditForm.correction_type === 'out'
                    ? 'bg-slate-50 border-dashed border-slate-200 opacity-60'
                    : 'bg-white border-slate-200 focus-within:border-emerald-500 ring-emerald-500/10'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">Punch In Time</label>
                    {attEditForm.correction_type === 'out' && (
                      <span className="text-[10px] text-slate-400 italic">Untouched</span>
                    )}
                  </div>
                  <input
                    type="time"
                    step="1"
                    disabled={attEditForm.correction_type === 'out'}
                    value={attEditForm.punch_in_time}
                    onChange={(e) => setAttEditForm({ ...attEditForm, punch_in_time: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-lg font-mono text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {selectedAtt.punch_in_time ? `Current: ${selectedAtt.punch_in_time}` : 'Currently missing'}
                  </p>
                </div>

                {/* Punch Out */}
                <div className={`p-3 rounded-xl border ${
                  attEditForm.correction_type === 'in'
                    ? 'bg-slate-50 border-dashed border-slate-200 opacity-60'
                    : 'bg-white border-slate-200 focus-within:border-sky-500 ring-sky-500/10'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">Punch Out Time</label>
                    {attEditForm.correction_type === 'in' && (
                      <span className="text-[10px] text-slate-400 italic">Untouched</span>
                    )}
                  </div>
                  <input
                    type="time"
                    step="1"
                    disabled={attEditForm.correction_type === 'in'}
                    value={attEditForm.punch_out_time}
                    onChange={(e) => setAttEditForm({ ...attEditForm, punch_out_time: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-lg font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {selectedAtt.punch_out_time ? `Current: ${selectedAtt.punch_out_time}` : 'Currently missing'}
                  </p>
                </div>
              </div>

              {/* Attendance Status */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Resolved Attendance Status</label>
                <select
                  value={attEditForm.status}
                  onChange={(e) => setAttEditForm({ ...attEditForm, status: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                >
                  <option value="Present">Present</option>
                  <option value="Half Day">Half Day</option>
                  <option value="Absent">Absent</option>
                  <option value="Leave">Leave</option>
                  <option value="Holiday">Holiday</option>
                  <option value="Weekly Off">Weekly Off</option>
                </select>
              </div>

              {/* Mandatory Audit Reason */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Mandatory Audit Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={attEditForm.reason}
                  onChange={(e) => setAttEditForm({ ...attEditForm, reason: e.target.value })}
                  placeholder="e.g. Employee biometric machine glitch / onsite duty verified by manager"
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs"
                />
              </div>

              {/* Supervisor Remarks */}
              <div>
                <label className="font-medium text-slate-600 block mb-1">Internal Remarks / Notes (Optional)</label>
                <input
                  type="text"
                  value={attEditForm.remarks || ''}
                  onChange={(e) => setAttEditForm({ ...attEditForm, remarks: e.target.value })}
                  placeholder="e.g. Corrected via Level 2 Support Desk"
                  className="w-full p-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditAttendanceModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-sm transition-all hover:scale-105 active:scale-95"
                >
                  Save & Audit Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANUAL PUNCH / ATTENDANCE ENTRY MODAL */}
      {showManualPunchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Manual Attendance & Punch Entry
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Record new attendance or manually adjust punch for an employee
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManualPunchModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManualPunch} className="space-y-4 text-xs">
              {/* Employee Selection */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Select Employee <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={manualPunchForm.employee_id}
                  onChange={(e) => setManualPunchForm({ ...manualPunchForm, employee_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                >
                  <option value="">-- Choose Employee --</option>
                  {employeesList.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.employee_code || `ID: ${emp.id}`}) {emp.company_name ? `• ${emp.company_name}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Attendance Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={manualPunchForm.date}
                  onChange={(e) => setManualPunchForm({ ...manualPunchForm, date: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                />
              </div>

              {/* Correction Scope Selector */}
              <div>
                <label className="font-bold text-slate-700 block mb-1.5 uppercase text-[10px] tracking-wider">
                  Punch Scope
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setManualPunchForm({ ...manualPunchForm, correction_type: 'both' })}
                    className={`py-2 px-2 rounded-xl font-bold text-center border transition-all ${
                      manualPunchForm.correction_type === 'both'
                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Both In & Out
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualPunchForm({ ...manualPunchForm, correction_type: 'in' })}
                    className={`py-2 px-2 rounded-xl font-bold text-center border transition-all ${
                      manualPunchForm.correction_type === 'in'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Punch In Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualPunchForm({ ...manualPunchForm, correction_type: 'out' })}
                    className={`py-2 px-2 rounded-xl font-bold text-center border transition-all ${
                      manualPunchForm.correction_type === 'out'
                        ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Punch Out Only
                  </button>
                </div>
              </div>

              {/* Time Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`p-3 rounded-xl border ${
                  manualPunchForm.correction_type === 'out'
                    ? 'bg-slate-50 border-dashed border-slate-200 opacity-60'
                    : 'bg-white border-slate-200 focus-within:border-emerald-500'
                }`}>
                  <label className="font-bold text-slate-700 block mb-1">Punch In Time</label>
                  <input
                    type="time"
                    step="1"
                    disabled={manualPunchForm.correction_type === 'out'}
                    value={manualPunchForm.punch_in_time}
                    onChange={(e) => setManualPunchForm({ ...manualPunchForm, punch_in_time: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-lg font-mono text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>

                <div className={`p-3 rounded-xl border ${
                  manualPunchForm.correction_type === 'in'
                    ? 'bg-slate-50 border-dashed border-slate-200 opacity-60'
                    : 'bg-white border-slate-200 focus-within:border-sky-500'
                }`}>
                  <label className="font-bold text-slate-700 block mb-1">Punch Out Time</label>
                  <input
                    type="time"
                    step="1"
                    disabled={manualPunchForm.correction_type === 'in'}
                    value={manualPunchForm.punch_out_time}
                    onChange={(e) => setManualPunchForm({ ...manualPunchForm, punch_out_time: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-lg font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Status</label>
                <select
                  value={manualPunchForm.status}
                  onChange={(e) => setManualPunchForm({ ...manualPunchForm, status: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                >
                  <option value="Present">Present</option>
                  <option value="Half Day">Half Day</option>
                  <option value="Absent">Absent</option>
                  <option value="Leave">Leave</option>
                  <option value="Holiday">Holiday</option>
                  <option value="Weekly Off">Weekly Off</option>
                </select>
              </div>

              {/* Mandatory Reason */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Mandatory Audit Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={manualPunchForm.reason}
                  onChange={(e) => setManualPunchForm({ ...manualPunchForm, reason: e.target.value })}
                  placeholder="e.g. Employee forgot card / server maintenance window"
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="font-medium text-slate-600 block mb-1">Remarks (Optional)</label>
                <input
                  type="text"
                  value={manualPunchForm.remarks || ''}
                  onChange={(e) => setManualPunchForm({ ...manualPunchForm, remarks: e.target.value })}
                  placeholder="e.g. Added via Support Panel"
                  className="w-full p-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowManualPunchModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-bold shadow-sm transition-all hover:scale-105 active:scale-95"
                >
                  Record Attendance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

            {/* ========================================================================= */}
      {/* REMOTE ACTION MODALS */}
      {/* ========================================================================= */}
      {/* 1. APPLY LEAVE ON BEHALF MODAL */}
      {/* ========================================================================= */}
      {/* REMOTE ACTION MODALS */}
      {/* ========================================================================= */}
      {/* 1. APPLY LEAVE ON BEHALF MODAL */}
      {remoteShowLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">Apply Leave via Support Authority</h3>
              </div>
              <button
                type="button"
                onClick={() => setRemoteShowLeaveModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRemoteSubmitLeave} className="space-y-3.5 text-xs">
              {/* Employee Selection */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Target Personnel <span className="text-rose-500">*</span></label>
                <select
                  value={remoteLeaveForm.employee_id}
                  onChange={(e) => setRemoteLeaveForm({ ...remoteLeaveForm, employee_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold"
                  required
                >
                  <option value="">-- Choose Employee / Manager --</option>
                  {(remoteCompanyData?.employees || []).map(e => (
                    <option key={e.id} value={e.id}>
                      {e.full_name || e.fullName || e.username} ({e.employee_code || `ID:${e.id}`}) • {e.role || 'Staff'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Leave Type */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Leave Type <span className="text-rose-500">*</span></label>
                <select
                  value={remoteLeaveForm.leave_type_id}
                  onChange={(e) => setRemoteLeaveForm({ ...remoteLeaveForm, leave_type_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold"
                  required
                >
                  <option value="">-- Choose Leave Type --</option>
                  {(remoteCompanyData?.leaveTypes || []).map(lt => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name || lt.type_name || lt.code} (Code: {lt.code || lt.type_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Dates & Days */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={remoteLeaveForm.start_date}
                    onChange={(e) => setRemoteLeaveForm({ ...remoteLeaveForm, start_date: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">End Date</label>
                  <input
                    type="date"
                    value={remoteLeaveForm.end_date}
                    onChange={(e) => setRemoteLeaveForm({ ...remoteLeaveForm, end_date: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Days</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={remoteLeaveForm.total_days}
                    onChange={(e) => setRemoteLeaveForm({ ...remoteLeaveForm, total_days: parseFloat(e.target.value) || 1 })}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 font-bold"
                    required
                  />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Reason / User Request Notes <span className="text-rose-500">*</span></label>
                <textarea
                  rows={2}
                  value={remoteLeaveForm.reason}
                  onChange={(e) => setRemoteLeaveForm({ ...remoteLeaveForm, reason: e.target.value })}
                  placeholder="e.g. Employee experienced portal error applying for medical leave"
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs"
                  required
                />
              </div>

              {/* WORKFLOW / ROUTING OPTIONS */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <label className="font-black text-slate-800 text-[11px] uppercase tracking-wider block">
                  Approval & Execution Routing Rule <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                    remoteLeaveForm.flow === 'route_to_mapping'
                      ? 'bg-purple-50 border-purple-300 ring-1 ring-purple-400'
                      : 'bg-white border-slate-200 hover:bg-slate-100'
                  }`}>
                    <input
                      type="radio"
                      name="leave_flow_opt"
                      value="route_to_mapping"
                      checked={remoteLeaveForm.flow === 'route_to_mapping'}
                      onChange={() => setRemoteLeaveForm({ ...remoteLeaveForm, flow: 'route_to_mapping', auto_approve: false })}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-1">
                        <span>📩 Route to Supervisor</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Submits leave as Pending and notifies assigned manager/approver mapping rule.
                      </p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                    remoteLeaveForm.flow === 'auto_approve'
                      ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-400'
                      : 'bg-white border-slate-200 hover:bg-slate-100'
                  }`}>
                    <input
                      type="radio"
                      name="leave_flow_opt"
                      value="auto_approve"
                      checked={remoteLeaveForm.flow === 'auto_approve'}
                      onChange={() => setRemoteLeaveForm({ ...remoteLeaveForm, flow: 'auto_approve', auto_approve: true })}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-1">
                        <span>🚀 Direct Auto-Approval</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Immediately marks as Approved, deducts days from CL/EL balance, and dual-syncs to cloud.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setRemoteShowLeaveModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={remoteActionExecuting}
                  className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-xl shadow-sm hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50"
                >
                  {remoteActionExecuting ? 'Submitting...' : 'Apply Leave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1.1 ATTENDANCE CORRECTION MODAL */}
      {remoteShowCorrectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900">Submit Attendance Correction on Behalf</h3>
              </div>
              <button
                type="button"
                onClick={() => setRemoteShowCorrectionModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRemoteSubmitCorrection} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Target Personnel <span className="text-rose-500">*</span></label>
                <select
                  value={remoteCorrectionForm.employee_id}
                  onChange={(e) => setRemoteCorrectionForm({ ...remoteCorrectionForm, employee_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                  required
                >
                  <option value="">-- Choose Employee / Manager --</option>
                  {(remoteCompanyData?.employees || []).map(e => (
                    <option key={e.id} value={e.id}>
                      {e.full_name || e.fullName || e.username} ({e.employee_code || `ID:${e.id}`}) • {e.role || 'Staff'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Attendance Date <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    value={remoteCorrectionForm.date}
                    onChange={(e) => setRemoteCorrectionForm({ ...remoteCorrectionForm, date: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Correction Type</label>
                  <select
                    value={remoteCorrectionForm.correction_type}
                    onChange={(e) => setRemoteCorrectionForm({ ...remoteCorrectionForm, correction_type: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-white font-semibold"
                  >
                    <option value="both">Both Punch In & Out</option>
                    <option value="in">Punch In Only</option>
                    <option value="out">Punch Out Only</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Corrected Punch In Time</label>
                  <input
                    type="time"
                    step="1"
                    value={remoteCorrectionForm.punch_in_time}
                    onChange={(e) => setRemoteCorrectionForm({ ...remoteCorrectionForm, punch_in_time: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Corrected Punch Out Time</label>
                  <input
                    type="time"
                    step="1"
                    value={remoteCorrectionForm.punch_out_time}
                    onChange={(e) => setRemoteCorrectionForm({ ...remoteCorrectionForm, punch_out_time: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Requested Attendance Status</label>
                <select
                  value={remoteCorrectionForm.requested_status}
                  onChange={(e) => setRemoteCorrectionForm({ ...remoteCorrectionForm, requested_status: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-xl bg-white font-semibold"
                >
                  <option value="Present">Present (Full Day)</option>
                  <option value="Half Day">Half Day</option>
                  <option value="Absent">Absent</option>
                  <option value="Weekly Off">Weekly Off</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Mandatory Audit Reason / Issue Details <span className="text-rose-500">*</span></label>
                <textarea
                  rows={2}
                  value={remoteCorrectionForm.reason}
                  onChange={(e) => setRemoteCorrectionForm({ ...remoteCorrectionForm, reason: e.target.value })}
                  placeholder="e.g. Employee experienced biometric punch synchronization timeout on arrival"
                  className="w-full p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              {/* WORKFLOW / ROUTING OPTIONS */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <label className="font-black text-slate-800 text-[11px] uppercase tracking-wider block">
                  Approval & Execution Routing Rule <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                    remoteCorrectionForm.flow === 'route_to_mapping'
                      ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-400'
                      : 'bg-white border-slate-200 hover:bg-slate-100'
                  }`}>
                    <input
                      type="radio"
                      name="correction_flow"
                      value="route_to_mapping"
                      checked={remoteCorrectionForm.flow === 'route_to_mapping'}
                      onChange={() => setRemoteCorrectionForm({ ...remoteCorrectionForm, flow: 'route_to_mapping' })}
                      className="mt-0.5 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-1">
                        <span>📩 Route to Supervisor</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Sends request to assigned manager mapping rule for review & approval.
                      </p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                    remoteCorrectionForm.flow === 'auto_approve'
                      ? 'bg-purple-50 border-purple-300 ring-1 ring-purple-400'
                      : 'bg-white border-slate-200 hover:bg-slate-100'
                  }`}>
                    <input
                      type="radio"
                      name="correction_flow"
                      value="auto_approve"
                      checked={remoteCorrectionForm.flow === 'auto_approve'}
                      onChange={() => setRemoteCorrectionForm({ ...remoteCorrectionForm, flow: 'auto_approve' })}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-1">
                        <span>🚀 Direct Auto-Approval</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Immediately writes to attendance records, marks is_edited=1, and dual-syncs to cloud realtime.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setRemoteShowCorrectionModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={remoteActionExecuting}
                  className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl shadow-sm hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
                >
                  {remoteActionExecuting ? 'Submitting...' : 'Submit Attendance Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1.2 RAISE TICKET ON BEHALF MODAL */}
      {remoteShowTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">Raise Service Ticket on Behalf</h3>
              </div>
              <button
                type="button"
                onClick={() => setRemoteShowTicketModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRemoteSubmitTicket} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Target Personnel <span className="text-rose-500">*</span></label>
                <select
                  value={remoteTicketForm.employee_id}
                  onChange={(e) => setRemoteTicketForm({ ...remoteTicketForm, employee_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold"
                  required
                >
                  <option value="">-- Choose Employee / Manager --</option>
                  {(remoteCompanyData?.employees || []).map(e => (
                    <option key={e.id} value={e.id}>
                      {e.full_name || e.fullName || e.username} ({e.employee_code || `ID:${e.id}`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Category / Issue Type</label>
                <select
                  value={remoteTicketForm.request_type}
                  onChange={(e) => setRemoteTicketForm({ ...remoteTicketForm, request_type: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-xl bg-white font-semibold"
                >
                  <option value="general_support">General Support / Inquiries</option>
                  <option value="attendance_correction">Attendance / Biometric Issue</option>
                  <option value="leave_error">Leave Portal / Balance Problem</option>
                  <option value="account_problem">Login / Hardware Binding Issue</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Subject / Title <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  value={remoteTicketForm.title}
                  onChange={(e) => setRemoteTicketForm({ ...remoteTicketForm, title: e.target.value })}
                  placeholder="e.g. Unable to punch out due to GPS error"
                  className="w-full p-2 border border-slate-200 rounded-xl focus:ring-1 focus:ring-purple-500 font-semibold"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Description / Details</label>
                <textarea
                  rows={3}
                  value={remoteTicketForm.description}
                  onChange={(e) => setRemoteTicketForm({ ...remoteTicketForm, description: e.target.value })}
                  placeholder="Provide technical specifics or user explanation..."
                  className="w-full p-2 border border-slate-200 rounded-xl focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setRemoteShowTicketModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={remoteActionExecuting}
                  className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-xl shadow-sm hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50"
                >
                  {remoteActionExecuting ? 'Creating...' : 'Open Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. ADJUST LEAVE BALANCE MODAL */}
      {remoteShowBalanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900">Adjust Leave Balance (CL / EL)</h3>
              </div>
              <button
                type="button"
                onClick={() => setRemoteShowBalanceModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRemoteSubmitBalance} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Target Personnel <span className="text-rose-500">*</span></label>
                <select
                  value={remoteBalanceForm.employee_id}
                  onChange={(e) => setRemoteBalanceForm({ ...remoteBalanceForm, employee_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                  required
                >
                  <option value="">-- Choose Employee --</option>
                  {(remoteCompanyData?.employees || []).map(e => (
                    <option key={e.id} value={e.id}>
                      {e.full_name || e.fullName || e.username} ({e.employee_code || `ID:${e.id}`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Leave Type <span className="text-rose-500">*</span></label>
                <select
                  value={remoteBalanceForm.leave_type_id}
                  onChange={(e) => setRemoteBalanceForm({ ...remoteBalanceForm, leave_type_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                  required
                >
                  <option value="">-- Choose Leave Type --</option>
                  {(remoteCompanyData?.leaveTypes || []).map(lt => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name || lt.type_name || lt.code} ({lt.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Action Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'credit', label: 'Credit (+)' },
                    { id: 'deduct', label: 'Deduct (-)' },
                    { id: 'set', label: 'Set Value (=)' }
                  ].map(act => (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => setRemoteBalanceForm({ ...remoteBalanceForm, action_type: act.id })}
                      className={`p-2 rounded-xl font-bold border transition-all text-center ${
                        remoteBalanceForm.action_type === act.id
                          ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Number of Days <span className="text-rose-500">*</span></label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={remoteBalanceForm.days}
                  onChange={(e) => setRemoteBalanceForm({ ...remoteBalanceForm, days: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-black text-sm"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Mandatory Audit Reason <span className="text-rose-500">*</span></label>
                <textarea
                  rows={2}
                  value={remoteBalanceForm.reason}
                  onChange={(e) => setRemoteBalanceForm({ ...remoteBalanceForm, reason: e.target.value })}
                  placeholder="e.g. Compensatory leave credited upon manager email approval"
                  className="w-full p-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setRemoteShowBalanceModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={remoteActionExecuting}
                  className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl shadow-sm hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
                >
                  {remoteActionExecuting ? 'Updating...' : 'Confirm Balance Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. RECORD / CORRECT ATTENDANCE PUNCH MODAL */}
      {remoteShowPunchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Mark / Correct Attendance Punch</h3>
              </div>
              <button
                type="button"
                onClick={() => setRemoteShowPunchModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRemoteSubmitPunch} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Target Personnel <span className="text-rose-500">*</span></label>
                <select
                  value={remotePunchForm.employee_id}
                  onChange={(e) => setRemotePunchForm({ ...remotePunchForm, employee_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                  required
                >
                  <option value="">-- Choose Employee / Manager --</option>
                  {(remoteCompanyData?.employees || []).map(e => (
                    <option key={e.id} value={e.id}>
                      {e.full_name || e.fullName || e.username} ({e.employee_code || `ID:${e.id}`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Attendance Date <span className="text-rose-500">*</span></label>
                <input
                  type="date"
                  value={remotePunchForm.date}
                  onChange={(e) => setRemotePunchForm({ ...remotePunchForm, date: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Punch In Time</label>
                  <input
                    type="time"
                    step="1"
                    value={remotePunchForm.punch_in_time}
                    onChange={(e) => setRemotePunchForm({ ...remotePunchForm, punch_in_time: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono text-xs focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Punch Out Time</label>
                  <input
                    type="time"
                    step="1"
                    value={remotePunchForm.punch_out_time}
                    onChange={(e) => setRemotePunchForm({ ...remotePunchForm, punch_out_time: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono text-xs focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Status</label>
                  <select
                    value={remotePunchForm.status}
                    onChange={(e) => setRemotePunchForm({ ...remotePunchForm, status: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-white focus:ring-1 focus:ring-emerald-500 font-semibold"
                  >
                    <option value="Present">Present</option>
                    <option value="Half Day">Half Day</option>
                    <option value="Absent">Absent</option>
                    <option value="Leave">Leave</option>
                    <option value="Weekly Off">Weekly Off</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Total Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={remotePunchForm.total_hours}
                    onChange={(e) => setRemotePunchForm({ ...remotePunchForm, total_hours: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 border border-slate-200 rounded-xl font-bold text-xs focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Mandatory Audit Reason <span className="text-rose-500">*</span></label>
                <textarea
                  rows={2}
                  value={remotePunchForm.reason}
                  onChange={(e) => setRemotePunchForm({ ...remotePunchForm, reason: e.target.value })}
                  placeholder="e.g. Employee biometric punch sync failure, corrected via Support"
                  className="w-full p-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setRemoteShowPunchModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={remoteActionExecuting}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl shadow-sm hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
                >
                  {remoteActionExecuting ? 'Saving...' : 'Record Punch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. REMOTELY EDIT PROFILE MODAL */}
      {remoteShowEditProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">Remotely Edit Personnel Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setRemoteShowEditProfileModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRemoteSubmitProfile} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Full Name</label>
                  <input
                    type="text"
                    value={remoteProfileForm.full_name}
                    onChange={(e) => setRemoteProfileForm({ ...remoteProfileForm, full_name: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl focus:ring-1 focus:ring-purple-500 font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Account Status</label>
                  <select
                    value={remoteProfileForm.status}
                    onChange={(e) => setRemoteProfileForm({ ...remoteProfileForm, status: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-white focus:ring-1 focus:ring-purple-500 font-semibold"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Mobile</label>
                  <input
                    type="text"
                    value={remoteProfileForm.mobile}
                    onChange={(e) => setRemoteProfileForm({ ...remoteProfileForm, mobile: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Email</label>
                  <input
                    type="email"
                    value={remoteProfileForm.email}
                    onChange={(e) => setRemoteProfileForm({ ...remoteProfileForm, email: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Department</label>
                  <input
                    type="text"
                    value={remoteProfileForm.department}
                    onChange={(e) => setRemoteProfileForm({ ...remoteProfileForm, department: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Designation</label>
                  <input
                    type="text"
                    value={remoteProfileForm.designation}
                    onChange={(e) => setRemoteProfileForm({ ...remoteProfileForm, designation: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Assigned Shift</label>
                  <select
                    value={remoteProfileForm.shift_id}
                    onChange={(e) => setRemoteProfileForm({ ...remoteProfileForm, shift_id: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-white focus:ring-1 focus:ring-purple-500 font-semibold"
                  >
                    <option value="">Default Company Shift</option>
                    {(remoteCompanyData?.shifts || []).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name || s.shift_name} ({s.start_time || '09:00'} - {s.end_time || '18:00'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Assigned Geofence</label>
                  <select
                    value={remoteProfileForm.geofence_id}
                    onChange={(e) => setRemoteProfileForm({ ...remoteProfileForm, geofence_id: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-white focus:ring-1 focus:ring-purple-500 font-semibold"
                  >
                    <option value="">All Company Geofences</option>
                    {(remoteCompanyData?.geofences || []).map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name || g.location_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setRemoteShowEditProfileModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={remoteActionExecuting}
                  className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-xl shadow-sm hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50"
                >
                  {remoteActionExecuting ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
    </div>
  );
}
