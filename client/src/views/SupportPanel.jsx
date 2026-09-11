import React, { useState, useEffect } from 'react';
import {
  Shield, Laptop, Ticket, Clock, CheckCircle, AlertTriangle,
  RefreshCw, Unlock, Edit3, Search, MessageSquare, CheckCheck, X, Building2, Copy, Lock
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

  const pLevel = user.supportLevel || 1;

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
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {activeTab === 'dashboard'
                ? `Welcome, ${user.fullName || user.username} (Support Desk)`
                : 'Support Operations Hub'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
              Authority Level {pLevel}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Multi-company operational assistance, device unlock, attendance corrections, and ticket processing
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

      {/* DASHBOARD SUMMARY */}
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        </div>
      )}

      {/* DEVICE SUPPORT & UNLOCK */}
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

      {/* TICKETS */}
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

      {/* ATTENDANCE SUPPORT & MANUAL CORRECTION */}
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

      {/* TAB: OPERATIONS CALENDAR */}
      {activeTab === 'calendar' && (
        <UnifiedCalendar role="support" />
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
