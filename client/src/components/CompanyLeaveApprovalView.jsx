import React, { useState, useEffect } from 'react';
import {
  CheckCircle2, XCircle, Clock, Calendar, User, Search, Filter,
  RefreshCw, Check, X, AlertCircle, FileText, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { apiRequest } from '../api';

export default function CompanyLeaveApprovalView({ role = 'company_admin', title = 'Leave Approval Review' }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'rejected'
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'employee' | 'manager'
  const [searchQuery, setSearchQuery] = useState('');

  // Review modal state
  const [reviewModal, setReviewModal] = useState({
    open: false,
    request: null,
    action: 'approved', // 'approved' | 'rejected'
    notes: '',
    submitting: false
  });

  const fetchRequests = async () => {
    setLoading(true);
    setError('');
    try {
      const queryParams = new URLSearchParams();
      if (statusFilter !== 'all') queryParams.append('status', statusFilter);
      queryParams.append('limit', '100');

      const res = await apiRequest(`/leave/requests?${queryParams.toString()}`);
      setRequests(res.requests || []);
    } catch (err) {
      setError(err.message || 'Failed to load leave requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();

    const handleMasterRefresh = () => {
      fetchRequests();
    };
    window.addEventListener('master-refresh', handleMasterRefresh);
    return () => window.removeEventListener('master-refresh', handleMasterRefresh);
  }, [statusFilter]);

  const handleOpenReview = (req, action) => {
    setReviewModal({
      open: true,
      request: req,
      action,
      notes: action === 'approved' ? 'Approved by administration' : '',
      submitting: false
    });
  };

  const handleSubmitReview = async (e) => {
    e?.preventDefault();
    if (!reviewModal.request) return;

    if (reviewModal.action === 'rejected' && !reviewModal.notes.trim()) {
      setError('Please provide a reason or note for rejecting this leave request.');
      return;
    }

    setReviewModal(prev => ({ ...prev, submitting: true }));
    setError('');
    setSuccess('');

    try {
      await apiRequest(`/leave/requests/${reviewModal.request.id}`, {
        method: 'PUT',
        body: {
          status: reviewModal.action,
          rejection_reason: reviewModal.notes.trim() || undefined
        }
      });

      setSuccess(
        reviewModal.action === 'approved'
          ? `Leave request for ${reviewModal.request.employee_name} (${reviewModal.request.total_days} days) has been APPROVED and attendance updated.`
          : `Leave request for ${reviewModal.request.employee_name} has been REJECTED.`
      );

      // Broadcast and master refresh
      try {
        new BroadcastChannel('npb_hrms_leave_sync').postMessage({ type: 'LEAVE_UPDATED', timestamp: Date.now() });
      } catch (e) {}
      localStorage.setItem('hrms_leave_updated', String(Date.now()));
      window.dispatchEvent(new CustomEvent('master-refresh'));

      setReviewModal({ open: false, request: null, action: 'approved', notes: '', submitting: false });
      fetchRequests();
    } catch (err) {
      setError(err.message || 'Failed to process leave decision.');
      setReviewModal(prev => ({ ...prev, submitting: false }));
    }
  };

  // Filter requests
  const filteredRequests = requests.filter(r => {
    // Role filter
    if (roleFilter !== 'all') {
      const rRole = (r.role_name || '').toLowerCase();
      if (roleFilter === 'manager' && !rRole.includes('manager')) return false;
      if (roleFilter === 'employee' && rRole.includes('manager')) return false;
    }

    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.employee_name && r.employee_name.toLowerCase().includes(q)) ||
      (r.employee_code && r.employee_code.toLowerCase().includes(q)) ||
      (r.department && r.department.toLowerCase().includes(q)) ||
      (r.leave_type_name && r.leave_type_name.toLowerCase().includes(q)) ||
      (r.reason && r.reason.toLowerCase().includes(q))
    );
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  return (
    <div className="space-y-4">
      {/* Alert Notices */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-none text-xs text-rose-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-none text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess('')} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Square Container */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-none overflow-hidden">
        {/* Header & Controls in Square Container */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 uppercase tracking-wide">
                <Calendar className="w-4 h-4 text-sky-600" />
                <span>{title}</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Review, authorize, or decline employee and manager leave applications with instant database update
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchRequests}
                disabled={loading}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-none text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
                title="Refresh Requests"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-200 text-xs">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff, code, leave type..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-none text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 text-slate-800"
              />
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full py-1.5 px-3 bg-white border border-slate-300 rounded-none text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="all">All Statuses ({requests.length})</option>
                <option value="pending">Pending Review ({pendingCount})</option>
                <option value="approved">Approved ({approvedCount})</option>
                <option value="rejected">Rejected ({rejectedCount})</option>
              </select>
            </div>

            {/* Role Filter */}
            <div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full py-1.5 px-3 bg-white border border-slate-300 rounded-none text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="all">All Roles (Employees & Managers)</option>
                <option value="employee">Employees Only</option>
                <option value="manager">Managers Only</option>
              </select>
            </div>

            {/* Counter Badge */}
            <div className="flex items-center justify-end">
              <span className="text-xs text-slate-600 font-medium">
                Showing <strong className="text-slate-900">{filteredRequests.length}</strong> of {requests.length} requests
              </span>
            </div>
          </div>
        </div>

        {/* Requests Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[11px] border-b border-slate-200">
              <tr>
                <th className="p-3">Staff / Personnel</th>
                <th className="p-3">Role Type</th>
                <th className="p-3">Leave Type</th>
                <th className="p-3">Duration & Dates</th>
                <th className="p-3">Days</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Applied On</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-400">
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-sky-600" />
                        <span>Loading leave applications...</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="font-semibold text-slate-600">No leave requests match the current filters.</p>
                        <p className="text-[11px] text-slate-400">New leave requests from assigned staff will show up here automatically.</p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredRequests.map(r => {
                  const isPending = r.status === 'pending';
                  const isApproved = r.status === 'approved';
                  const isRejected = r.status === 'rejected';
                  const isManager = (r.role_name || '').toLowerCase().includes('manager');

                  return (
                    <tr key={r.id} className={`hover:bg-slate-50/70 transition-colors ${isPending ? 'bg-amber-50/20' : ''}`}>
                      {/* Staff Member */}
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{r.employee_name || 'Staff Member'}</div>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                          <span>{r.employee_code || `#${r.employee_id}`}</span>
                          {r.department && <span>• {r.department}</span>}
                        </div>
                      </td>

                      {/* Role Type */}
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-none text-[10px] font-bold uppercase tracking-wider border ${
                          isManager
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200'
                        }`}>
                          {isManager ? 'Manager' : 'Employee'}
                        </span>
                      </td>

                      {/* Leave Type */}
                      <td className="p-3">
                        <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 border border-slate-200 rounded-none">
                          {r.leave_type_name || 'Leave'}
                        </span>
                      </td>

                      {/* Duration */}
                      <td className="p-3 text-slate-700 font-medium whitespace-nowrap">
                        <div>{r.start_date} <span className="text-slate-400">to</span> {r.end_date}</div>
                      </td>

                      {/* Total Days */}
                      <td className="p-3">
                        <span className="font-bold text-slate-900 bg-slate-50 px-2 py-0.5 border border-slate-200 rounded-none">
                          {r.total_days} {r.total_days === 1 ? 'day' : 'days'}
                        </span>
                      </td>

                      {/* Reason */}
                      <td className="p-3 text-slate-600 max-w-xs truncate" title={r.reason || ''}>
                        {r.reason || <span className="text-slate-400 italic">No reason specified</span>}
                      </td>

                      {/* Applied On */}
                      <td className="p-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                      </td>

                      {/* Status */}
                      <td className="p-3 whitespace-nowrap">
                        {isPending && (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-300 font-bold rounded-none flex items-center gap-1 w-fit">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Pending Review</span>
                          </span>
                        )}
                        {isApproved && (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold rounded-none flex items-center gap-1 w-fit">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Approved</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-300 font-bold rounded-none flex items-center gap-1 w-fit">
                            <X className="w-3 h-3 text-rose-600" />
                            <span>Rejected</span>
                          </span>
                        )}
                        {r.rejection_reason && (
                          <p className="text-[10px] text-slate-500 mt-1 italic truncate max-w-[140px]" title={r.rejection_reason}>
                            Note: {r.rejection_reason}
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right whitespace-nowrap">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenReview(r, 'approved')}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-none text-xs font-bold flex items-center gap-1 border border-emerald-700 shadow-xs transition-all"
                              title="Approve Leave Request"
                            >
                              <Check className="w-3 h-3" />
                              <span>Approve</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenReview(r, 'rejected')}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-none text-xs font-bold flex items-center gap-1 border border-rose-700 shadow-xs transition-all"
                              title="Reject Leave Request"
                            >
                              <X className="w-3 h-3" />
                              <span>Reject</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">Decided</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Review Decision (Approve / Reject) in Square Box */}
      {reviewModal.open && reviewModal.request && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-300 shadow-2xl rounded-none max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 uppercase tracking-wide">
                  {reviewModal.action === 'approved' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Confirm Leave Approval</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-rose-600" />
                      <span>Reject Leave Request</span>
                    </>
                  )}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Applicant: <strong>{reviewModal.request.employee_name}</strong> ({reviewModal.request.employee_code || reviewModal.request.employee_id})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewModal({ open: false, request: null, action: 'approved', notes: '', submitting: false })}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Leave Details Summary Box */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-none text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Leave Type:</span>
                <span className="font-bold text-slate-800">{reviewModal.request.leave_type_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duration:</span>
                <span className="font-bold text-slate-800">{reviewModal.request.start_date} to {reviewModal.request.end_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Deducted Days:</span>
                <span className="font-bold text-slate-900">{reviewModal.request.total_days} days</span>
              </div>
              {reviewModal.request.reason && (
                <div className="pt-1 border-t border-slate-200">
                  <span className="text-slate-500 block mb-0.5">Reason:</span>
                  <p className="text-slate-700 italic">{reviewModal.request.reason}</p>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {reviewModal.action === 'approved' ? 'Approval Notes (Optional)' : 'Rejection Reason / Notes *'}
                </label>
                <textarea
                  rows={3}
                  required={reviewModal.action === 'rejected'}
                  value={reviewModal.notes}
                  onChange={(e) => setReviewModal({ ...reviewModal, notes: e.target.value })}
                  placeholder={
                    reviewModal.action === 'approved'
                      ? 'e.g. Approved as per project availability.'
                      : 'e.g. Critical project deadline, please reschedule.'
                  }
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-none text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setReviewModal({ open: false, request: null, action: 'approved', notes: '', submitting: false })}
                  className="px-3.5 py-1.5 border border-slate-300 rounded-none font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewModal.submitting}
                  className={`px-4 py-1.5 rounded-none font-bold text-white shadow-xs flex items-center gap-1.5 disabled:opacity-50 ${
                    reviewModal.action === 'approved'
                      ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-500 border border-rose-700'
                  }`}
                >
                  {reviewModal.submitting ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      {reviewModal.action === 'approved' ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                      <span>{reviewModal.action === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
