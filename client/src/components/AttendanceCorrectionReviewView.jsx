import React, { useState, useEffect } from 'react';
import {
  CheckCircle2, XCircle, Clock, Calendar, User, Search, Filter,
  RefreshCw, Check, X, AlertCircle, FileText, ChevronRight, MapPin
} from 'lucide-react';
import { apiRequest } from '../api';

export default function AttendanceCorrectionReviewView({ role = 'company_admin', title = 'Attendance Correction Requests' }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'rejected'
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

      const res = await apiRequest(`/attendance/correction-requests?${queryParams.toString()}`);
      setRequests(res.requests || []);
    } catch (err) {
      setError(err.message || 'Failed to load correction requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const handleOpenReview = (req, action) => {
    setReviewModal({
      open: true,
      request: req,
      action,
      notes: action === 'approved' ? 'Approved by supervisor' : 'Rejected by supervisor',
      submitting: false
    });
  };

  const handleSubmitReview = async (e) => {
    e?.preventDefault();
    if (!reviewModal.request) return;

    setReviewModal(prev => ({ ...prev, submitting: true }));
    setError('');
    setSuccess('');

    try {
      const res = await apiRequest(`/attendance/correction-requests/${reviewModal.request.id}/review`, {
        method: 'PUT',
        body: {
          status: reviewModal.action,
          review_notes: reviewModal.notes
        }
      });

      setSuccess(
        reviewModal.action === 'approved'
          ? `Request for ${reviewModal.request.employee_name} approved! Attendance marked as Present.`
          : `Request for ${reviewModal.request.employee_name} rejected. Attendance marked as Absent.`
      );

      // Instant cross-tab and cross-window sync to employee panel
      try {
        new BroadcastChannel('npb_hrms_attendance_sync').postMessage({ type: 'ATTENDANCE_CORRECTED', timestamp: Date.now() });
      } catch (e) {}
      localStorage.setItem('hrms_attendance_updated', String(Date.now()));
      window.dispatchEvent(new CustomEvent('master-refresh'));

      setReviewModal({ open: false, request: null, action: 'approved', notes: '', submitting: false });
      fetchRequests();
    } catch (err) {
      setError(err.message || 'Failed to submit review decision.');
      setReviewModal(prev => ({ ...prev, submitting: false }));
    }
  };

  const filteredRequests = requests.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.employee_name && r.employee_name.toLowerCase().includes(q)) ||
      (r.employee_code && r.employee_code.toLowerCase().includes(q)) ||
      (r.department && r.department.toLowerCase().includes(q)) ||
      (r.date && r.date.includes(q)) ||
      (r.reason && r.reason.toLowerCase().includes(q))
    );
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-sky-50 text-sky-600 rounded-xl">
              <Clock className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-xs font-bold rounded-full animate-pulse">
                {pendingCount} Pending Review
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review employee attendance correction applications. Approving marks attendance as <strong className="text-emerald-700">Present</strong> with updated hours. Rejecting or cancelling marks attendance as <strong className="text-rose-700">Absent</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchRequests}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Feedback Alerts */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="p-1 hover:text-rose-900"><X className="w-4 h-4" /></button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess('')} className="p-1 hover:text-emerald-900"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 uppercase mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" /> Filter Status:
          </span>
          {[
            { id: 'all', label: 'All Requests', count: requests.length },
            { id: 'pending', label: 'Pending', count: requests.filter(r => r.status === 'pending').length },
            { id: 'approved', label: 'Approved (Present)', count: requests.filter(r => r.status === 'approved').length },
            { id: 'rejected', label: 'Rejected (Absent)', count: requests.filter(r => r.status === 'rejected').length }
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                statusFilter === f.id
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search employee, date, reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-100">
              <tr>
                <th className="p-3">Employee</th>
                <th className="p-3">Attendance Date</th>
                <th className="p-3">Requested Punch Times</th>
                <th className="p-3">Requested Status</th>
                <th className="p-3">Reason / Justification</th>
                <th className="p-3">Applied On</th>
                <th className="p-3">Review Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-3 font-semibold text-slate-900">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center font-bold text-xs">
                        {r.employee_name?.charAt(0) || 'E'}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{r.employee_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {r.employee_code} {r.department ? `• ${r.department}` : ''} {r.city ? `• ${r.city}` : ''}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="p-3 font-mono font-semibold text-slate-800">
                    <div className="flex items-center gap-1 text-sky-700">
                      <Calendar className="w-3.5 h-3.5 text-sky-500" />
                      {r.date}
                    </div>
                  </td>

                  <td className="p-3">
                    <div className="space-y-0.5 font-mono text-[11px]">
                      <div className="text-emerald-700">
                        <span className="font-semibold">In:</span> {r.requested_punch_in || 'N/A'}
                      </div>
                      <div className="text-amber-700">
                        <span className="font-semibold">Out:</span> {r.requested_punch_out || 'N/A'}
                      </div>
                    </div>
                  </td>

                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-semibold text-[11px]">
                      {r.requested_status || 'Present'}
                    </span>
                  </td>

                  <td className="p-3 max-w-xs">
                    <p className="text-slate-700 line-clamp-2" title={r.reason}>
                      {r.reason}
                    </p>
                  </td>

                  <td className="p-3 text-slate-400 text-[11px]">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : 'N/A'}
                  </td>

                  <td className="p-3">
                    {r.status === 'pending' && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 w-fit">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                    )}
                    {r.status === 'approved' && (
                      <div>
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Approved (Present)
                        </span>
                        {r.reviewer_name && (
                          <div className="text-[10px] text-slate-400 mt-1">
                            By {r.reviewer_name}
                          </div>
                        )}
                      </div>
                    )}
                    {r.status === 'rejected' && (
                      <div>
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 w-fit">
                          <XCircle className="w-3 h-3" /> Rejected (Absent)
                        </span>
                        {r.reviewer_name && (
                          <div className="text-[10px] text-slate-400 mt-1">
                            By {r.reviewer_name}
                          </div>
                        )}
                        {r.review_notes && (
                          <div className="text-[10px] text-rose-600 italic mt-0.5">
                            "{r.review_notes}"
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="p-3 text-right">
                    {r.status === 'pending' ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenReview(r, 'approved')}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center gap-1 shadow-sm transition-all text-[11px]"
                          title="Approve request and mark attendance as Present"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve (Present)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenReview(r, 'rejected')}
                          className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold flex items-center gap-1 shadow-sm transition-all text-[11px]"
                          title="Reject/Cancel request and mark attendance as Absent"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject (Absent)</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">Resolved</span>
                    )}
                  </td>
                </tr>
              ))}

              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No attendance correction requests found.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {statusFilter !== 'all' ? `No requests matching "${statusFilter}" status.` : 'Employees have not submitted any correction requests yet.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Decision Confirmation Modal */}
      {reviewModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className={`p-2 rounded-xl ${
                  reviewModal.action === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {reviewModal.action === 'approved' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {reviewModal.action === 'approved' ? 'Approve Correction Request' : 'Reject / Cancel Request'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {reviewModal.action === 'approved'
                      ? 'Attendance record will be updated to Present.'
                      : 'Attendance record will be marked as Absent.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewModal({ open: false, request: null, action: 'approved', notes: '', submitting: false })}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="font-semibold text-slate-800">
                Employee: <span className="font-bold text-slate-900">{reviewModal.request?.employee_name}</span> ({reviewModal.request?.employee_code})
              </div>
              <div className="text-slate-600">
                Date: <span className="font-mono font-semibold text-sky-700">{reviewModal.request?.date}</span>
              </div>
              <div className="text-slate-600">
                Requested Times: <span className="font-mono">{reviewModal.request?.requested_punch_in || 'N/A'} - {reviewModal.request?.requested_punch_out || 'N/A'}</span>
              </div>
              <div className="text-slate-600">
                Employee Reason: <span className="italic text-slate-700">"{reviewModal.request?.reason}"</span>
              </div>
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Reviewer Note / Comment</label>
                <textarea
                  rows="3"
                  value={reviewModal.notes}
                  onChange={(e) => setReviewModal({ ...reviewModal, notes: e.target.value })}
                  placeholder="Optional review notes explaining the decision..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
                />
              </div>

              <div className="p-3 rounded-xl text-[11px] font-medium border"
                style={{
                  backgroundColor: reviewModal.action === 'approved' ? '#f0fdf4' : '#fff1f2',
                  borderColor: reviewModal.action === 'approved' ? '#bbf7d0' : '#fecdd3',
                  color: reviewModal.action === 'approved' ? '#15803d' : '#be123c'
                }}
              >
                {reviewModal.action === 'approved' ? (
                  <span>✓ Action: Attendance status for {reviewModal.request?.date} will be set to <strong>Present</strong> with calculated working hours.</span>
                ) : (
                  <span>✕ Action: Attendance status for {reviewModal.request?.date} will be set to <strong>Absent</strong>.</span>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReviewModal({ open: false, request: null, action: 'approved', notes: '', submitting: false })}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewModal.submitting}
                  className={`px-4 py-2 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-all ${
                    reviewModal.action === 'approved'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {reviewModal.submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{reviewModal.action === 'approved' ? 'Confirm Approval (Present)' : 'Confirm Rejection (Absent)'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
