import React, { useState, useEffect, useRef } from 'react';
import {
  Shield, Laptop, Ticket, Clock, CheckCircle, AlertTriangle,
  RefreshCw, Unlock, Edit3, Search, MessageSquare, CheckCheck, X, Building2, Copy, Lock,
  Radio, Globe, Phone, Mail, User, Key, Send, Eye, MapPin, Check, Plus, AlertCircle, Play, ExternalLink, Power, UserX, UserCheck
} from 'lucide-react';
import { apiRequest } from '../api';
import UnifiedCalendar from '../components/UnifiedCalendar';
import TicketChatModal from '../components/TicketChatModal';

export default function SupportPanel({ user, activeTab }) {
  const [devices, setDevices] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Multi-Company Support Access
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('all');

  // Ticket Chat State
  const [chatTicketId, setChatTicketId] = useState(null);
  const [showChatModal, setShowChatModal] = useState(false);

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
    punch_in_time: '',
    punch_out_time: '',
    status: 'Present',
    reason: ''
  });

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

  const pLevel = Number(user.supportLevel ?? user.support_level ?? 1);

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
        setCompanies(compRes.companies || []);
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
      if (activeTab === 'tickets' || activeTab === 'dashboard') {
        const res = await apiRequest(buildUrl('/tickets/service-requests', 'view=active'));
        setTickets(res.requests || []);
      }
      if (activeTab === 'attendance-support' || activeTab === 'dashboard') {
        const res = await apiRequest(buildUrl('/attendance/list', 'limit=50'));
        setAttendanceRecords(res.records || []);
      }
      if (activeTab === 'audit-logs' || activeTab === 'dashboard') {
        const res = await apiRequest(buildUrl('/support/audit-logs', 'limit=50'));
        setAuditLogs(res.logs || []);
      }
      if (activeTab === 'remote-access' && pLevel >= 4) {
        fetchRemoteTargets();
      }
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
  }, [activeTab, selectedCompanyId]);

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
      await apiRequest(`/attendance/correct/${selectedAtt.id}`, {
        method: 'PUT',
        body: attEditForm
      });
      setSuccess('Attendance record corrected and audit log recorded.');
      setEditAttendanceModal(false);
      fetchData();
      if (selectedUserDiag) {
        handlePerformSearch(selectedUserDiag.username);
      }
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
                ? `Welcome, ${user.fullName || user.username} (Support Desk)`
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
              <option value="all">All Companies</option>
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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase">Bound Devices</span>
              <Laptop className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{devices.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">Single-device locked accounts</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase">Active Tickets</span>
              <Ticket className="w-5 h-5 text-sky-600" />
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{tickets.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">Pending user service requests</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase">Support Action Logs</span>
              <Clock className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{auditLogs.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">Audited operations</p>
          </div>

          <div className="bg-gradient-to-br from-purple-900 to-indigo-900 text-white p-5 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-200 uppercase tracking-wider">Remote Access</span>
              <Radio className="w-5 h-5 text-purple-300 animate-pulse" />
            </div>
            <p className="text-xl font-black mt-2">{pLevel >= 4 ? 'Level 4 Unlocked' : `Level ${pLevel} Active`}</p>
            <p className="text-[11px] text-purple-200 mt-1">
              {pLevel >= 4 ? 'Online Remote Console Enabled' : 'Level 4 Clearance Required'}
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DEVICE SUPPORT & UNLOCK */}
      {/* ========================================================================= */}
      {(activeTab === 'device-support' || activeTab === 'dashboard') && (
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
                {devices.map(d => (
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
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TICKETS & HELPDESK */}
      {/* ========================================================================= */}
      {(activeTab === 'tickets' || activeTab === 'dashboard') && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Service Requests & Support Tickets</h3>
            <span className="text-xs text-sky-600 font-semibold">1-Day Auto-Archival Rule Active</span>
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
                {tickets.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="p-3">
                      <span className="font-bold text-slate-900">#{t.id}</span>
                      <span className="block text-[10px] text-sky-600 uppercase font-semibold">{t.request_type.replace('_', ' ')}</span>
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
                            onClick={() => handleDeregisterAndCloseTicket(t)}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs transition-all"
                            title="1-Click Deregister Device and Close Ticket"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            Deregister & Close
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

      {/* ========================================================================= */}
      {/* ATTENDANCE SUPPORT */}
      {/* ========================================================================= */}
      {activeTab === 'attendance-support' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Attendance Correction Desk</h3>
            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-lg font-semibold">
              Requires Level 2+ Support
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
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
                {attendanceRecords.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-semibold text-slate-900">{a.employee_name} ({a.employee_code})</td>
                    <td className="p-3 text-slate-600">{a.company_name}</td>
                    <td className="p-3 text-slate-700">{a.date}</td>
                    <td className="p-3 font-mono text-emerald-700">{a.punch_in_time || 'Missing'}</td>
                    <td className="p-3 font-mono text-rose-700">{a.punch_out_time || 'Missing'}</td>
                    <td className="p-3 font-medium">{a.total_hours} hrs</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        a.status === 'Present' ? 'bg-emerald-100 text-emerald-700' :
                        a.status === 'Half Day' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => {
                          if (pLevel < 2) {
                            setError('Support Level 2 or higher required to correct attendance.');
                            return;
                          }
                          setSelectedAtt(a);
                          setAttEditForm({
                            punch_in_time: a.punch_in_time || '09:00:00',
                            punch_out_time: a.punch_out_time || '18:00:00',
                            status: a.status || 'Present',
                            reason: ''
                          });
                          setEditAttendanceModal(true);
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 ml-auto"
                      >
                        <Edit3 className="w-3 h-3" />
                        Correct
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* OPERATIONS CALENDAR */}
      {/* ========================================================================= */}
      {activeTab === 'calendar' && (
        <UnifiedCalendar role="support" />
      )}

      {/* ========================================================================= */}
      {/* AUDIT LOGS VIEW */}
      {/* ========================================================================= */}
      {activeTab === 'audit-logs' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Support Operations & Security Audit Logs</h3>
            <span className="text-xs text-slate-500 font-semibold">{auditLogs.length} recent operations</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Authorizer / Support Agent</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">Target Entity / ID</th>
                  <th className="p-3">Reason / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="p-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">{log.created_at}</td>
                    <td className="p-3 font-semibold text-slate-800">{log.user_name} ({log.role})</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-50 text-purple-700 border border-purple-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">{log.company_name || 'System / All'}</td>
                    <td className="p-3 font-mono text-slate-600">{log.target_entity} #{log.target_id || '-'}</td>
                    <td className="p-3 text-slate-700 max-w-sm">{log.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LEVEL 4 ONLINE REMOTE ACCESS CONSOLE */}
      {/* ========================================================================= */}
      {activeTab === 'remote-access' && (
        <div>
          {pLevel < 4 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-xl mx-auto space-y-4 shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Level 4 Support Clearance Required</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                The Online Remote Access & Solution Console is strictly reserved for Level 4 Lead Technical Support Engineers.
                Your current authorization profile is <span className="font-bold text-purple-700">Authority Level {pLevel}</span>.
              </p>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 font-medium">
                To access live company/employee remote diagnostics, single-device remote unlock, and online assistance streams, request Super Admin to elevate your support permission level to 4.
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* REMOTE CONSOLE CONTROLS */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-xl shadow-xs">
                    <Radio className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      Online Remote Diagnostic & Assistance Stream
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full uppercase">
                        Connected & Active
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Real-time online remote access to any company portal or employee account
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={remoteSearch}
                      onChange={(e) => setRemoteSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchRemoteTargets()}
                      placeholder="Filter target user/emp..."
                      className="text-xs border rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500 w-48"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                  <button
                    type="button"
                    onClick={fetchRemoteTargets}
                    disabled={remoteLoading}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
                    title="Refresh remote targets"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${remoteLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* TWO-COLUMN REMOTE CONSOLE */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LEFT COLUMN: TARGET SELECTION DIRECTORY */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[650px]">
                  <div className="p-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase">Available Remote Targets</span>
                    <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                      {remoteTargetUsers.length} staff
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
                    {remoteTargetUsers.map(target => {
                      const isSelected = remoteSelectedUser?.user_id === target.user_id;
                      return (
                        <div
                          key={target.user_id}
                          onClick={() => handleSelectRemoteTarget(target)}
                          className={`p-3 cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-purple-50/80 border-l-4 border-purple-600'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">
                              {target.full_name || target.username}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                              target.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {target.role_name}
                            </span>
                          </div>
                          <p className="text-[11px] text-purple-700 font-semibold truncate mt-0.5">
                            {target.company_name}
                          </p>
                          <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500 font-mono">
                            <span>@{target.username}</span>
                            <span>{target.mac_address ? 'MAC Locked' : 'No MAC'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* RIGHT COLUMN: LIVE REMOTE DIAGNOSTICS & CONTROL CONSOLE */}
                <div className="lg:col-span-2 space-y-4">
                  {remoteSelectedUser && remoteDiagnostics ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
                      {/* TARGET BANNER */}
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                            {(remoteDiagnostics.user.full_name || remoteDiagnostics.user.username)[0].toUpperCase()}
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                              {remoteDiagnostics.user.full_name || remoteDiagnostics.user.username}
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-800">
                                {remoteDiagnostics.user.role_name}
                              </span>
                            </h3>
                            <p className="text-xs text-slate-500">
                              {remoteDiagnostics.user.company_name} • @{remoteDiagnostics.user.username} • ID: {remoteDiagnostics.user.employee_code || remoteDiagnostics.user.user_id}
                            </p>
                          </div>
                        </div>

                        {/* REMOTE SESSION CONTROLLER */}
                        <div className="flex items-center gap-2">
                          {remoteSessionPin ? (
                            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                              <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
                              <div>
                                <span className="text-[10px] font-bold text-emerald-800 uppercase block">Session Code</span>
                                <span className="text-xs font-mono font-black text-emerald-900 select-all">{remoteSessionPin}</span>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={handleStartRemoteSession}
                              disabled={remoteActionExecuting}
                              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              Start Live Remote Assist Session
                            </button>
                          )}
                        </div>
                      </div>

                      {/* DIAGNOSTIC CARDS GRID */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Device Diagnostic Card */}
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5">
                            <span>Device Security Lock</span>
                            <Laptop className="w-4 h-4 text-purple-600" />
                          </div>
                          {remoteDiagnostics.device ? (
                            <div className="text-[11px] space-y-1">
                              <p className="text-slate-900 font-semibold">{remoteDiagnostics.device.device_name || 'Bound Mobile'}</p>
                              <p className="font-mono text-purple-700 bg-purple-100/70 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                {remoteDiagnostics.device.mac_address || remoteDiagnostics.device.device_id}
                              </p>
                              <p className="text-slate-400 text-[10px]">Last IP: {remoteDiagnostics.device.bound_ip || '-'}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 font-medium">No device currently bound</p>
                          )}
                        </div>

                        {/* Attendance Today Card */}
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5">
                            <span>Today's Attendance</span>
                            <Clock className="w-4 h-4 text-emerald-600" />
                          </div>
                          {remoteDiagnostics.todayAttendance ? (
                            <div className="text-[11px] space-y-1">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                                {remoteDiagnostics.todayAttendance.status}
                              </span>
                              <p className="font-mono text-slate-700 mt-1">In: {remoteDiagnostics.todayAttendance.punch_in_time || 'Pending'}</p>
                              <p className="font-mono text-slate-700">Out: {remoteDiagnostics.todayAttendance.punch_out_time || 'Pending'}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-amber-600 font-medium">No punch recorded today</p>
                          )}
                        </div>

                        {/* Last Tracking Location Card */}
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5">
                            <span>GPS Location Check</span>
                            <MapPin className="w-4 h-4 text-rose-600" />
                          </div>
                          {remoteDiagnostics.lastLocation ? (
                            <div className="text-[11px] space-y-0.5">
                              <p className="font-mono font-bold text-slate-800">
                                {Number(remoteDiagnostics.lastLocation.latitude).toFixed(4)}, {Number(remoteDiagnostics.lastLocation.longitude).toFixed(4)}
                              </p>
                              <p className="text-slate-500 truncate text-[10px]">{remoteDiagnostics.lastLocation.location_name || 'Tracked GPS Point'}</p>
                              <p className="text-slate-400 text-[10px]">{remoteDiagnostics.lastLocation.captured_at}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 font-medium">No recent GPS tracking</p>
                          )}
                        </div>
                      </div>

                      {/* REMOTE SOLUTION & REPAIR TOOLBAR */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                          Remote Control & Instant Solutions Toolbar
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <button
                            type="button"
                            onClick={() => handleRemoteQuickAction('unbind_device')}
                            disabled={remoteActionExecuting}
                            className="p-3 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all shadow-xs"
                          >
                            <Unlock className="w-4 h-4 text-purple-600" />
                            <span>Unlock Device</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoteQuickAction('sync_attendance')}
                            disabled={remoteActionExecuting}
                            className="p-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all shadow-xs"
                          >
                            <Clock className="w-4 h-4 text-emerald-600" />
                            <span>Sync Attendance</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoteQuickAction('reset_password')}
                            disabled={remoteActionExecuting}
                            className="p-3 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all shadow-xs"
                          >
                            <Key className="w-4 h-4 text-amber-600" />
                            <span>Reset Password</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setRemoteShowAlertModal(true)}
                            className="p-3 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all shadow-xs"
                          >
                            <Send className="w-4 h-4 text-sky-600" />
                            <span>Dispatch Alert</span>
                          </button>
                        </div>
                      </div>

                      {/* SIMULATED REMOTE VIEW-AS MODE TOGGLE */}
                      <div className="p-4 bg-slate-900 text-white rounded-2xl flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                          <Eye className="w-5 h-5 text-purple-400" />
                          <div>
                            <h4 className="text-xs font-bold">Online Remote Portal Impersonation & Assist View</h4>
                            <p className="text-[10px] text-slate-400">
                              Simulate and inspect the target user's active portal experience directly
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRemoteSimulatePortal(!remoteSimulatePortal)}
                          className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                        >
                          {remoteSimulatePortal ? 'Exit Remote View' : 'Launch Remote View'}
                        </button>
                      </div>

                      {/* SIMULATED VIEWPORT */}
                      {remoteSimulatePortal && (
                        <div className="border-2 border-dashed border-purple-500/40 rounded-2xl p-4 bg-purple-50/20 space-y-3">
                          <div className="flex items-center justify-between text-xs font-bold text-purple-900">
                            <span>Simulated Portal Screen: {remoteDiagnostics.user.full_name} ({remoteDiagnostics.user.role_name})</span>
                            <span className="font-mono text-[10px] bg-purple-200 px-2 py-0.5 rounded text-purple-900">Session View Live</span>
                          </div>
                          <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div><span className="font-semibold">Company:</span> {remoteDiagnostics.user.company_name}</div>
                              <div><span className="font-semibold">Assigned Shift:</span> {remoteDiagnostics.shift?.name || 'General 09:00 - 18:00'}</div>
                              <div><span className="font-semibold">Geofence Policy:</span> {remoteDiagnostics.geofence?.name || 'Office Main Perimeter'}</div>
                              <div><span className="font-semibold">Active Tickets:</span> {remoteDiagnostics.activeTickets?.length || 0} issues open</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                      <Radio className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-600">Select a Target from Directory</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Pick an employee or administrator to initiate online remote diagnostics.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
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

      {/* EDIT ATTENDANCE MODAL */}
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
                  placeholder="e.g. Employee verified client visit punch glitch"
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
                  Save & Audit Log
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
