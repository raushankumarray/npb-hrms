import React, { useState, useEffect, useRef } from 'react';
import {
  Shield, Laptop, Ticket, Clock, CheckCircle, AlertTriangle,
  RefreshCw, Unlock, Edit3, Search, MessageSquare, CheckCheck, X, Building2, Copy, Lock,
  Globe, Phone, Mail, User, Key, Send, Eye, MapPin, Check, Plus, AlertCircle, Play, ExternalLink, Power, UserX, UserCheck,
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
                : 'Support Operations Hub'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
              Authority Level {pLevel}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Multi-company operational assistance, instant identity search, device unlock, attendance corrections, and helpdesk operations
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
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${canAccessAuditLogs ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-4`}>
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
