import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, X, Send, Volume2, VolumeX, Sparkles, Clock,
  Calendar, CheckCircle2, UserCheck, ShieldAlert, Bot, ArrowRight,
  RefreshCw, AlertCircle
} from 'lucide-react';
import { apiRequest } from '../api';

const INACTIVITY_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

export default function PihuAssistant({ user, company, onSelectTab }) {
  const [isOpen, setIsOpen] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    return localStorage.getItem('pihu_voice_enabled') !== 'false';
  });
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationState, setConversationState] = useState({});
  const [inactivityNotice, setInactivityNotice] = useState(false);

  const inactivityTimerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const role = user?.role_name || user?.role || 'employee';

  // Speak aloud via Web Speech API
  const speakVoice = (text) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const cleanText = text
        .replace(/[*_#`]/g, '')
        .replace(/•/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 0.95;
      utterance.pitch = 1.1; // Friendly warm pitch
      utterance.volume = 1.0; // Clear & loud

      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v =>
        v.lang.startsWith('en') && (
          v.name.includes('Google UK English Female') ||
          v.name.includes('Natural') ||
          v.name.includes('Female') ||
          v.name.includes('Samantha') ||
          v.name.includes('Zira')
        )
      );
      if (preferredVoice) utterance.voice = preferredVoice;

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis notice:', e.message);
    }
  };

  // Reset 5-minute inactivity timer
  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    if (isOpen) {
      inactivityTimerRef.current = setTimeout(() => {
        setIsOpen(false);
        setInactivityNotice(true);
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
      }, INACTIVITY_LIMIT_MS);
    }
  };

  // Setup initial message when opened for the first time
  const handleOpenChat = () => {
    setIsOpen(true);
    setInactivityNotice(false);

    // Speak loud greeting voice when opening
    const greetingAudio = "Hi, I am Pihu, your AI assistant. May I help you?";
    speakVoice(greetingAudio);

    if (messages.length === 0) {
      const defaultGreeting = `Hi ${user?.full_name || user?.username || ''}! 🌸 Main hoon **PIHU**, aapki smart AI Assistant.\n\nAap mujhse punch status, working hours, leave balance, team analytics aur leave apply karne ke baare mein kuch bhi pooch sakte hain!`;
      setMessages([
        {
          id: 'msg-welcome',
          sender: 'pihu',
          text: defaultGreeting,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          action: 'GREETING'
        }
      ]);
    }

    setTimeout(() => {
      inputRef.current?.focus();
    }, 200);
  };

  const handleCloseChat = () => {
    setIsOpen(false);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
  };

  // Activity listeners to reset 5-min inactivity timer
  useEffect(() => {
    if (isOpen) {
      resetInactivityTimer();
    } else {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    }
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [isOpen]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  // Send message to PIHU backend
  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading) return;

    resetInactivityTimer();

    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      const res = await apiRequest('/assistant/chat', {
        method: 'POST',
        body: {
          message: text,
          conversationState
        }
      });

      const pihuReply = res?.reply || 'Main samajh rahi hoon, kripya thoda aur detail me batayein.';
      const newAction = res?.action || null;
      const nextState = res?.conversationState || {};
      const leaveDetails = res?.leaveDetails || null;

      setConversationState(nextState);

      const pihuMsg = {
        id: `pihu-${Date.now()}`,
        sender: 'pihu',
        text: pihuReply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        action: newAction,
        leaveDetails
      };

      setMessages(prev => [...prev, pihuMsg]);

      // If voice enabled, speak summary
      if (newAction === 'LEAVE_SUBMITTED') {
        speakVoice("Aapki leave request successfully submit ho gayi hai.");
      } else if (newAction === 'LEAVE_APPLICATION') {
        // Speak the question
        speakVoice(pihuReply);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `pihu-err-${Date.now()}`,
          sender: 'pihu',
          text: `⚠️ Maaf kijiye, temporary server issue: ${err.message}. Kripya thodi der baad try karein.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
      resetInactivityTimer();
    }
  };

  // Toggle voice mute/unmute
  const toggleVoice = () => {
    const nextVal = !voiceEnabled;
    setVoiceEnabled(nextVal);
    localStorage.setItem('pihu_voice_enabled', String(nextVal));
    if (!nextVal && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    resetInactivityTimer();
  };

  // Suggestion chips by Role
  const getSuggestions = () => {
    if (role === 'employee') {
      return [
        { label: '📅 Apply My Leave', query: 'Apply my leave' },
        { label: '⏰ My Punch Status', query: 'Aaj ka punch status' },
        { label: '🏖️ Leave Balance', query: 'Mera leave balance kitna hai?' },
        { label: '🎉 Upcoming Holidays', query: 'Upcoming holidays list' },
        { label: '⌛ My Shift Timings', query: 'Mera shift timing kya hai?' }
      ];
    }
    if (role === 'manager') {
      return [
        { label: '👥 Who is Absent Today?', query: 'Who is absent in my team today?' },
        { label: '⏳ Pending Approvals', query: 'Pending leave approvals' },
        { label: '📊 Team Attendance', query: 'Team attendance status today' },
        { label: '🎉 Upcoming Holidays', query: 'Upcoming holidays list' }
      ];
    }
    if (role === 'company_admin') {
      return [
        { label: '🏢 Today Attendance Rate', query: 'Today company attendance overview' },
        { label: '⏳ Pending Approvals', query: 'Company pending leave approvals' },
        { label: '🎉 Upcoming Holidays', query: 'Upcoming holidays' }
      ];
    }
    return [
      { label: '🌐 System Overview', query: 'Platform system overview' },
      { label: '🏢 Companies Count', query: 'Registered companies overview' }
    ];
  };

  const suggestions = getSuggestions();

  return (
    <>
      {/* Floating Action Button at Bottom Right */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
          {inactivityNotice && (
            <div className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-xl border border-slate-700 flex items-center gap-1.5 animate-fade-in">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Closed after 5 min inactivity</span>
              <button
                type="button"
                onClick={() => setInactivityNotice(false)}
                className="ml-1 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleOpenChat}
            className="group relative flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-pink-600 via-rose-600 to-indigo-600 text-white font-semibold rounded-full shadow-2xl hover:shadow-pink-500/30 hover:scale-105 active:scale-95 transition-all duration-300 border-2 border-white/30"
            title="Chat with PIHU AI Assistant"
          >
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400"></span>
            </span>

            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
              <span className="text-sm font-bold tracking-wide">PIHU AI</span>
            </div>

            {/* Hover Tooltip */}
            <span className="absolute -top-9 right-0 bg-slate-900 text-white text-[11px] font-medium px-2.5 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              May I help you?
            </span>
          </button>
        </div>
      )}

      {/* PIHU Chat Window Modal/Drawer */}
      {isOpen && (
        <div
          className="fixed bottom-4 right-4 z-50 w-[95vw] sm:w-[410px] h-[580px] max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200"
          onClick={resetInactivityTimer}
          onMouseMove={resetInactivityTimer}
          onKeyDown={resetInactivityTimer}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-pink-600 via-rose-600 to-indigo-600 text-white flex items-center justify-between shadow-md select-none">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm border border-white/40 flex items-center justify-center font-bold text-sm">
                  🌸
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-pink-700 rounded-full"></span>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm leading-tight tracking-wide">PIHU AI</h3>
                  <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded font-medium">Assistant</span>
                </div>
                <p className="text-[11px] text-pink-100 leading-tight flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Online • 5m Inactivity Auto-Close
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleVoice}
                className={`p-1.5 rounded-lg transition-colors ${voiceEnabled ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}
                title={voiceEnabled ? 'Voice Sound Active (Click to Mute)' : 'Voice Sound Muted (Click to Enable)'}
              >
                {voiceEnabled ? <Volume2 className="w-4 h-4 text-emerald-300" /> : <VolumeX className="w-4 h-4 text-white/50" />}
              </button>

              <button
                type="button"
                onClick={handleCloseChat}
                className="p-1.5 hover:bg-white/20 rounded-lg text-white transition-colors"
                title="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Suggestion Chips */}
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 overflow-x-auto flex gap-1.5 scrollbar-none">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(s.query)}
                className="text-[11px] whitespace-nowrap px-2.5 py-1 bg-white hover:bg-pink-50 hover:text-pink-700 hover:border-pink-300 border border-slate-200 rounded-full text-slate-700 font-medium transition-all shadow-2xs cursor-pointer active:scale-95"
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Messages Body */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-50/50">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white rounded-br-none'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                  }`}
                >
                  <div className="whitespace-pre-wrap">
                    {m.text}
                  </div>

                  {/* Special Leave Submitted Card */}
                  {m.leaveDetails && (
                    <div className="mt-2.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Leave Request Created</span>
                      </div>
                      <div>• Type: <b>{m.leaveDetails.leaveType}</b></div>
                      <div>• Duration: <b>{m.leaveDetails.startDate}</b> to <b>{m.leaveDetails.endDate}</b> ({m.leaveDetails.workingDays} working days)</div>
                      <div>• Reason: <i>{m.leaveDetails.reason}</i></div>
                    </div>
                  )}

                  {/* Action Link button */}
                  {m.action === 'VIEW_APPROVALS' && onSelectTab && (
                    <button
                      type="button"
                      onClick={() => onSelectTab('approvals')}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-pink-700 bg-pink-50 hover:bg-pink-100 px-2.5 py-1 rounded-lg border border-pink-200 transition-colors"
                    >
                      Open Approvals Tab <ArrowRight className="w-3 h-3" />
                    </button>
                  )}

                  {m.action === 'VIEW_PUNCH' && onSelectTab && (
                    <button
                      type="button"
                      onClick={() => onSelectTab('punch')}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-pink-700 bg-pink-50 hover:bg-pink-100 px-2.5 py-1 rounded-lg border border-pink-200 transition-colors"
                    >
                      Go to Punch In Screen <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <span className="text-[10px] text-slate-400 mt-1 px-1">
                  {m.time}
                </span>
              </div>
            ))}

            {loading && (
              <div className="flex items-start gap-2">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none px-3.5 py-2.5 shadow-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-bounce"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-bounce [animation-delay:0.4s]"></span>
                  <span className="text-[11px] text-slate-400 ml-1 font-medium">PIHU is analyzing...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-2.5 bg-white border-t border-slate-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  resetInactivityTimer();
                }}
                placeholder={
                  conversationState.actionState === 'AWAITING_LEAVE_DATES'
                    ? 'e.g. 2026-09-22 to 2026-09-23...'
                    : conversationState.actionState === 'AWAITING_LEAVE_REASON'
                    ? 'Enter reason for leave...'
                    : 'Ask PIHU anything (e.g. Apply my leave)...'
                }
                className="flex-1 text-xs px-3.5 py-2.5 bg-slate-100 border border-slate-300 rounded-full focus:outline-none focus:border-pink-500 focus:bg-white text-slate-900 transition-all placeholder:text-slate-400"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || loading}
                className="p-2.5 rounded-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-md active:scale-95 transition-all cursor-pointer"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="flex items-center justify-between text-[10px] text-slate-400 px-2 pt-1">
              <span>🔒 Confidentiality Protected</span>
              <span>Auto-closes in 5m idle</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
