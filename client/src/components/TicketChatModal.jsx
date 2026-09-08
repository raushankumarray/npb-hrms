import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Send, CheckCircle, Clock, AlertCircle,
  User, Shield, Building2, RefreshCw, X, ChevronDown, CheckCheck
} from 'lucide-react';
import { apiRequest } from '../api';

export default function TicketChatModal({ ticketId, isOpen, onClose, currentUser, onStatusUpdated }) {
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const fetchMessages = async () => {
    if (!ticketId) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest(`/tickets/service-requests/${ticketId}/messages`);
      setTicket(res.ticket);
      setMessages(res.messages || []);
    } catch (err) {
      setError(err.message || 'Failed to load ticket conversation.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && ticketId) {
      fetchMessages();
      setNewMessage('');
      setError('');
      setSuccess('');
    }
  }, [isOpen, ticketId]);

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (customStatus = null) => {
    if (!newMessage.trim() && !customStatus) return;
    setSending(true);
    setError('');
    try {
      const res = await apiRequest(`/tickets/service-requests/${ticketId}/messages`, {
        method: 'POST',
        body: {
          message: newMessage.trim() || `Status updated to ${customStatus}.`,
          status: customStatus || undefined
        }
      });

      if (res.chatMessage) {
        setMessages(prev => [...prev, res.chatMessage]);
      }
      if (res.status && ticket) {
        setTicket(prev => ({ ...prev, status: res.status }));
      }
      setNewMessage('');
      setSuccess(customStatus ? `Reply sent & ticket marked as ${customStatus}.` : 'Reply sent successfully.');
      if (onStatusUpdated) onStatusUpdated();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleQuickStatusChange = async (newStatus) => {
    if (!newStatus || newStatus === ticket?.status) return;
    try {
      await apiRequest(`/tickets/service-requests/${ticketId}/resolve`, {
        method: 'PUT',
        body: {
          status: newStatus,
          resolution_notes: `Status changed to ${newStatus} by ${currentUser?.username || 'user'}.`
        }
      });
      setTicket(prev => ({ ...prev, status: newStatus }));
      setSuccess(`Status updated to ${newStatus}.`);
      fetchMessages();
      if (onStatusUpdated) onStatusUpdated();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update status.');
    }
  };

  if (!isOpen) return null;

  const isStaffOrSupport = currentUser && ['super_admin', 'support', 'company_admin', 'hr', 'manager'].includes(currentUser.role);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full h-[88vh] max-h-[750px] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        
        {/* HEADER */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700 font-bold shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-900 tracking-tight">
                  Ticket #{ticketId}
                </span>
                {ticket && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    ticket.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                    ticket.status === 'in_progress' ? 'bg-sky-100 text-sky-700' :
                    ticket.status === 'closed' ? 'bg-slate-200 text-slate-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {ticket.status.replace('_', ' ')}
                  </span>
                )}
                {ticket?.company_name && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    <Building2 className="w-3 h-3" />
                    {ticket.company_name} ({ticket.company_code})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 font-medium truncate max-w-sm sm:max-w-md">
                {ticket?.title || 'Loading Ticket Discussion...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isStaffOrSupport && ticket && (
              <select
                value={ticket.status}
                onChange={(e) => handleQuickStatusChange(e.target.value)}
                className="text-xs font-semibold px-2 py-1 border rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            )}

            <button
              onClick={fetchMessages}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              title="Refresh conversation"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              title="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ALERTS */}
        {error && (
          <div className="mx-4 mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mx-4 mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2 shrink-0">
            <CheckCheck className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* CONVERSATION STREAM */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-50/30">
          {/* TICKET INITIAL PROBLEM DETAILS CARD */}
          {ticket && (
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-100 pb-1.5">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Raised by: {ticket.employee_name} ({ticket.employee_code})
                </span>
                <span>{new Date(ticket.created_at).toLocaleString()}</span>
              </div>
              <div>
                <span className="inline-block px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-bold text-[10px] uppercase mb-1">
                  Type: {ticket.request_type?.replace(/_/g, ' ')}
                </span>
                <p className="text-xs font-semibold text-slate-900">{ticket.title}</p>
                {ticket.description && (
                  <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{ticket.description}</p>
                )}
              </div>
              {ticket.punch_date && (
                <div className="p-2 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 flex items-center gap-3">
                  <span><strong>Punch Date:</strong> {ticket.punch_date}</span>
                  <span><strong>Suggested:</strong> {ticket.suggested_punch_in || '-'} &rarr; {ticket.suggested_punch_out || '-'}</span>
                </div>
              )}
            </div>
          )}

          {/* CHAT MESSAGES */}
          {messages.length === 0 && !loading && (
            <div className="text-center py-8 text-xs text-slate-400">
              <MessageSquare className="w-8 h-8 mx-auto text-slate-300 mb-2 stroke-1" />
              <p className="font-medium">No replies yet on Ticket #{ticketId}.</p>
              <p className="text-[11px] mt-0.5">Start the conversation below to discuss and solve this ticket.</p>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isMe = currentUser && (msg.user_id === currentUser.id || msg.sender_name?.includes(currentUser.username));
            const isSupport = msg.sender_role === 'support' || msg.sender_role === 'super_admin';
            const isAdminOrHr = msg.sender_role === 'company_admin' || msg.sender_role === 'hr';

            return (
              <div
                key={msg.id || idx}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400 font-medium">
                  <span className="font-bold text-slate-700">{msg.sender_name}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase ${
                    isSupport ? 'bg-purple-100 text-purple-800' :
                    isAdminOrHr ? 'bg-sky-100 text-sky-800' :
                    'bg-slate-200 text-slate-600'
                  }`}>
                    {msg.sender_role?.replace('_', ' ')}
                  </span>
                  <span>•</span>
                  <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                <div
                  className={`max-w-[85%] sm:max-w-[75%] p-3 rounded-2xl text-xs shadow-sm leading-relaxed whitespace-pre-wrap ${
                    isMe
                      ? 'bg-purple-600 text-white rounded-tr-xs'
                      : isSupport
                      ? 'bg-purple-50 text-slate-900 border border-purple-200 rounded-tl-xs'
                      : 'bg-white text-slate-900 border border-slate-200 rounded-tl-xs'
                  }`}
                >
                  {msg.message}
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* CHAT INPUT FORM OR RESOLVED BANNER */}
        {currentUser?.role === 'employee' && (ticket?.status === 'resolved' || ticket?.status === 'closed') ? (
          <div className="p-4 border-t border-amber-200 bg-amber-50 text-amber-900 shrink-0 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold">This ticket has been marked as {ticket?.status?.toUpperCase()}.</p>
              <p className="text-amber-700 leading-relaxed">
                Resolved and closed tickets cannot be reopened. If you still need help or have another request, please submit a new ticket.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3 border-t border-slate-100 bg-white shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="space-y-2"
            >
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  rows={2}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={`Type your reply to solve ticket #${ticketId}... (Enter to send)`}
                  className="w-full p-2.5 pr-10 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-purple-500 resize-none"
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="absolute right-2.5 bottom-3.5 p-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-lg transition-colors shadow-sm"
                  title="Send reply"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">
                  Shift + Enter for new line
                </span>

                {isStaffOrSupport && ticket && ticket.status !== 'resolved' && (
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => handleSendMessage('resolved')}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Reply & Mark Resolved</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}
