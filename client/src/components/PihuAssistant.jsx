import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, X, Send, Volume2, VolumeX, Sparkles, Clock,
  Calendar, CheckCircle2, UserCheck, ShieldAlert, Bot, ArrowRight,
  RefreshCw, AlertCircle, MapPin, Ticket, Edit3, BarChart2, Languages
} from 'lucide-react';
import { apiRequest } from '../api';

const INACTIVITY_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

// Circular AI Girl SVG Illustration Avatar
function AiGirlAvatar({ size = 'w-10 h-10', border = true }) {
  return (
    <div className={`relative ${size} rounded-full overflow-hidden flex items-center justify-center shrink-0 ${border ? 'ring-2 ring-pink-400/80 shadow-md shadow-pink-500/20 bg-gradient-to-tr from-pink-500 via-rose-500 to-indigo-600' : 'bg-pink-600'}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="hairGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e1b4b" />
            <stop offset="100%" stopColor="#431407" />
          </linearGradient>
          <linearGradient id="skinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fed7aa" />
            <stop offset="100%" stopColor="#fdba74" />
          </linearGradient>
          <linearGradient id="headsetGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>

        {/* Background Aura */}
        <circle cx="50" cy="50" r="48" fill="#fce7f3" />

        {/* Hair Back */}
        <path d="M 22,50 Q 18,20 50,16 Q 82,20 78,50 Q 84,80 75,90 Q 50,96 25,90 Q 16,80 22,50 Z" fill="url(#hairGrad)" />

        {/* Neck */}
        <rect x="43" y="66" width="14" height="16" rx="4" fill="url(#skinGrad)" />

        {/* Shirt/Collar */}
        <path d="M 28,82 Q 50,95 72,82 L 80,100 L 20,100 Z" fill="#ec4899" />
        <polygon points="44,82 50,90 56,82" fill="#ffffff" opacity="0.9" />

        {/* Face */}
        <ellipse cx="50" cy="48" rx="20" ry="24" fill="url(#skinGrad)" />

        {/* Eyes */}
        <ellipse cx="42" cy="46" rx="2.5" ry="3.5" fill="#1e293b" />
        <ellipse cx="58" cy="46" rx="2.5" ry="3.5" fill="#1e293b" />
        <circle cx="43" cy="45" r="1" fill="#ffffff" />
        <circle cx="59" cy="45" r="1" fill="#ffffff" />

        {/* Eyebrows */}
        <path d="M 38,40 Q 42,38 46,40" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M 54,40 Q 58,38 62,40" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" fill="none" />

        {/* Cute Smile */}
        <path d="M 45,58 Q 50,63 55,58" stroke="#e11d48" strokeWidth="1.8" strokeLinecap="round" fill="none" />

        {/* Soft Blush */}
        <circle cx="36" cy="52" r="3.5" fill="#f43f5e" opacity="0.35" />
        <circle cx="64" cy="52" r="3.5" fill="#f43f5e" opacity="0.35" />

        {/* Front Hair Bangs */}
        <path d="M 30,35 Q 50,22 70,35 Q 60,32 50,34 Q 40,32 30,35 Z" fill="url(#hairGrad)" />
        <path d="M 28,34 Q 32,48 34,56 Q 30,46 28,34 Z" fill="url(#hairGrad)" />
        <path d="M 72,34 Q 68,48 66,56 Q 70,46 72,34 Z" fill="url(#hairGrad)" />

        {/* Modern AI Headset & Mic */}
        <path d="M 26,45 A 25,25 0 0,1 74,45" stroke="url(#headsetGrad)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="26" cy="47" r="4" fill="#8b5cf6" />
        <circle cx="74" cy="47" r="4" fill="#8b5cf6" />
        <path d="M 26,47 Q 34,64 45,64" stroke="#ec4899" strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="45" cy="64" r="2.5" fill="#3b82f6" />

        {/* Sparkling Hairclip */}
        <polygon points="68,30 70,33 73,33 71,35 72,38 69,36 66,38 67,35 65,33 68,33" fill="#facc15" />
      </svg>
    </div>
  );
}

export default function PihuAssistant({ user, company, onSelectTab }) {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('pihu_lang') || 'en';
  });
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    return localStorage.getItem('pihu_voice_enabled') !== 'false';
  });
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationState, setConversationState] = useState({});
  const [inactivityNotice, setInactivityNotice] = useState(false);

  // In-chat punch state
  const [pendingPunch, setPendingPunch] = useState(null); // { type: 'in'|'out', time: '', lat: 0, lon: 0, location: '', loading: false }

  const inactivityTimerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const role = user?.role_name || user?.role || 'employee';

  // Determine personalized account announcement name
  const getAccountAnnouncementName = () => {
    if (role === 'super_admin') {
      return language === 'hi' ? 'सुपर एडमिन' : 'Super Admin';
    }
    if (role === 'company_admin') {
      const compName = company?.portalName || company?.name || 'Company';
      return language === 'hi' ? `${compName} एडमिन` : `${compName} Admin`;
    }
    if (role === 'manager') {
      const mName = user?.full_name || user?.username || 'Manager';
      return language === 'hi' ? `मैनेजर ${mName}` : `Manager ${mName}`;
    }
    return user?.full_name || user?.username || (language === 'hi' ? 'साथी' : 'Colleague');
  };

  // Speak aloud via Web Speech API with dual-language support (English / Hindi)
  const speakVoice = (text, forcedLang = null) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const cleanText = text
        .replace(/[*_#`]/g, '')
        .replace(/•/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      const activeLang = forcedLang || language;

      utterance.rate = 0.95;
      utterance.pitch = 1.1; // Friendly female pitch
      utterance.volume = 1.0; // Loud and clear

      const voices = window.speechSynthesis.getVoices();
      if (activeLang === 'hi') {
        utterance.lang = 'hi-IN';
        const hiVoice = voices.find(v => v.lang.includes('hi') || v.name.includes('Hindi') || v.name.includes('Kalpana'));
        if (hiVoice) utterance.voice = hiVoice;
      } else {
        utterance.lang = 'en-US';
        const enVoice = voices.find(v =>
          v.lang.startsWith('en') && (
            v.name.includes('Google UK English Female') ||
            v.name.includes('Natural') ||
            v.name.includes('Female') ||
            v.name.includes('Samantha') ||
            v.name.includes('Zira')
          )
        );
        if (enVoice) utterance.voice = enVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis notice:', e.message);
    }
  };

  // Reset 5-minute inactivity timer with Auto-Clear
  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    if (isOpen) {
      inactivityTimerRef.current = setTimeout(() => {
        // Auto-close and clear chat after 5 minutes of inactivity
        setIsOpen(false);
        setMessages([]); // Clear chat completely
        setConversationState({}); // Reset multi-turn state
        setPendingPunch(null);
        setInactivityNotice(true);
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
      }, INACTIVITY_LIMIT_MS);
    }
  };

  // Setup initial personalized greeting when opened
  const handleOpenChat = () => {
    setIsOpen(true);
    setInactivityNotice(false);

    const accountName = getAccountAnnouncementName();

    if (language === 'hi') {
      const audioHi = `नमस्ते ${accountName} जी, मैं पिहू हूँ, आपकी AI सहायक। क्या मैं आपकी कोई मदद कर सकती हूँ?`;
      speakVoice(audioHi, 'hi');
    } else {
      const audioEn = `Hi ${accountName}, I am Pihu, your AI assistant. May I help you?`;
      speakVoice(audioEn, 'en');
    }

    if (messages.length === 0) {
      const welcomeText = language === 'hi'
        ? `नमस्ते **${accountName}** जी! 🌸 मैं हूँ **पिहू**, आपकी स्मार्ट AI सहायक।\n\nमैं आपकी अटेंडेंस दर्ज करने, छुट्टी अप्लाई करने, सपोर्ट टिकट बनाने, और डेटा रिपोर्ट विश्लेषण करने में तुरंत सहायता कर सकती हूँ। बताइए, आज मैं आपकी क्या मदद करूँ?`
        : `Hi **${accountName}**! 🌸 I am **PIHU**, your smart AI Assistant.\n\nI can help you record your Punch In/Out, apply for leaves, raise support tickets, correct attendance, and analyze monthly performance reports! How may I help you today?`;

      setMessages([
        {
          id: 'msg-welcome',
          sender: 'pihu',
          text: welcomeText,
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

  // Switch Language (English / Hindi)
  const handleSwitchLanguage = (newLang) => {
    setLanguage(newLang);
    localStorage.setItem('pihu_lang', newLang);
    resetInactivityTimer();

    if (newLang === 'hi') {
      const hiSpeak = "नमस्ते! क्या मैं आपकी कोई मदद कर सकती हूँ?";
      speakVoice(hiSpeak, 'hi');
      setMessages(prev => [
        ...prev,
        {
          id: `lang-${Date.now()}`,
          sender: 'pihu',
          text: "भाषा हिंदी चुनी गई है। 🌸 नमस्ते! क्या मैं आपकी कोई मदद कर सकती हूँ?",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } else {
      const enSpeak = "Hi, I am Pihu! May I help you?";
      speakVoice(enSpeak, 'en');
      setMessages(prev => [
        ...prev,
        {
          id: `lang-${Date.now()}`,
          sender: 'pihu',
          text: "Language switched to English. 🌸 Hi, I am Pihu! May I help you?",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
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
  }, [messages, loading, isOpen, pendingPunch]);

  // Handle GPS location acquisition for In-Chat Punching
  const triggerInChatPunchPrompt = async (punchType) => {
    setLoading(true);
    resetInactivityTimer();
    try {
      const pos = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error(language === 'hi' ? 'आपके ब्राउज़र में GPS समर्थित नहीं है।' : 'Geolocation is not supported by your browser.'));
        } else {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          });
        }
      });

      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const acc = pos.coords.accuracy || 10;
      let locName = 'Verified GPS Site';

      try {
        const geoRes = await apiRequest(`/attendance/reverse-geocode?lat=${lat}&lon=${lon}`);
        if (geoRes?.location) locName = geoRes.location;
      } catch (e) {}

      const now = new Date();
      const currentPunchTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const currentPunchDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      setPendingPunch({
        type: punchType,
        lat,
        lon,
        acc,
        location: locName,
        punchTime: currentPunchTime,
        punchDate: currentPunchDate,
        displayTime: timeFormatted,
        loading: false
      });

      const promptMsg = language === 'hi'
        ? `📍 **पंच पुष्टि (Punch Confirmation)**:\nस्थान: **${locName}**\nGPS: \`${lat.toFixed(4)}, ${lon.toFixed(4)}\`\nसमय: **${timeFormatted}**\n\nक्या आप अपना **${punchType === 'in' ? 'पंच-इन' : 'पंच-आउट'}** दर्ज करना चाहते हैं?`
        : `📍 **Punch Confirmation**:\nLocation: **${locName}**\nGPS: \`${lat.toFixed(4)}, ${lon.toFixed(4)}\`\nTime: **${timeFormatted}**\n\nDo you want to confirm your **${punchType === 'in' ? 'Punch-In' : 'Punch-Out'}** now?`;

      setMessages(prev => [
        ...prev,
        {
          id: `punch-prompt-${Date.now()}`,
          sender: 'pihu',
          text: promptMsg,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isPunchCard: true,
          punchType
        }
      ]);

      speakVoice(language === 'hi' ? "कृपया अपना पंच कन्फर्म करें।" : "Please confirm your punch.");
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `punch-err-${Date.now()}`,
          sender: 'pihu',
          text: `⚠️ GPS Error: ${err.message}. ${language === 'hi' ? 'कृपया डिवाइस GPS सक्षम करें।' : 'Please ensure GPS is enabled on your device.'}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Execute confirmed in-chat punch
  const handleConfirmPunch = async () => {
    if (!pendingPunch) return;
    setLoading(true);
    resetInactivityTimer();

    try {
      const endpoint = pendingPunch.type === 'in' ? '/attendance/punch-in' : '/attendance/punch-out';
      const res = await apiRequest(endpoint, {
        method: 'POST',
        body: {
          latitude: pendingPunch.lat,
          longitude: pendingPunch.lon,
          accuracy: pendingPunch.acc,
          location_name: pendingPunch.location,
          punch_time: pendingPunch.punchTime,
          punch_date: pendingPunch.punchDate
        }
      });

      const successText = language === 'hi'
        ? `🎉 **${pendingPunch.type === 'in' ? 'पंच-इन' : 'पंच-आउट'} सफलतापूर्वक दर्ज हुआ!**\n\n• समय: **${pendingPunch.displayTime}**\n• स्थान: **${pendingPunch.location}**\n• GPS: \`${pendingPunch.lat.toFixed(4)}, ${pendingPunch.lon.toFixed(4)}\`\n\n${res.message || 'रिकॉर्ड सुरक्षित रूप से सिंक हो गया है।'}`
        : `🎉 **${pendingPunch.type === 'in' ? 'Punch-In' : 'Punch-Out'} Recorded Successfully!**\n\n• Time: **${pendingPunch.displayTime}**\n• Location: **${pendingPunch.location}**\n• GPS: \`${pendingPunch.lat.toFixed(4)}, ${pendingPunch.lon.toFixed(4)}\`\n\n${res.message || 'Attendance record synchronized securely.'}`;

      setMessages(prev => [
        ...prev,
        {
          id: `punch-success-${Date.now()}`,
          sender: 'pihu',
          text: successText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);

      speakVoice(language === 'hi' ? "आपका पंच सफलतापूर्वक दर्ज हो गया है।" : "Punch recorded successfully.");
      setPendingPunch(null);

      // Trigger auto-refresh event across panel
      window.dispatchEvent(new CustomEvent('master-refresh', { detail: { source: 'pihu-punch' } }));
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `punch-fail-${Date.now()}`,
          sender: 'pihu',
          text: `⚠️ Punch failed: ${err.message}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

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
          conversationState,
          language
        }
      });

      const pihuReply = res?.reply || (language === 'hi' ? 'मैं समझ रही हूँ, कृपया थोड़ा और विस्तार से बताएं।' : 'I understand, please tell me a bit more.');
      const newAction = res?.action || null;
      const nextState = res?.conversationState || {};
      const leaveDetails = res?.leaveDetails || null;
      const ticketDetails = res?.ticketDetails || null;

      setConversationState(nextState);

      // Check if user requested punch prompt
      if (newAction === 'PROMPT_PUNCH_IN') {
        triggerInChatPunchPrompt('in');
        return;
      }
      if (newAction === 'PROMPT_PUNCH_OUT') {
        triggerInChatPunchPrompt('out');
        return;
      }

      const pihuMsg = {
        id: `pihu-${Date.now()}`,
        sender: 'pihu',
        text: pihuReply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        action: newAction,
        leaveDetails,
        ticketDetails
      };

      setMessages(prev => [...prev, pihuMsg]);

      // Speak action summaries
      if (newAction === 'LEAVE_SUBMITTED') {
        speakVoice(language === 'hi' ? "आपकी लीव रिक्वेस्ट सफलतापूर्वक सबमिट हो गई है।" : "Your leave request was submitted successfully.");
      } else if (newAction === 'TICKET_SUBMITTED') {
        speakVoice(language === 'hi' ? "आपका सपोर्ट टिकट बन गया है।" : "Support ticket created successfully.");
      } else if (newAction === 'CORRECTION_SUBMITTED') {
        speakVoice(language === 'hi' ? "अटेंडेंस करेक्शन रिक्वेस्ट सबमिट हो गई है।" : "Attendance correction submitted successfully.");
      } else if (['LEAVE_APPLICATION', 'TICKET_CREATION', 'CORRECTION_FLOW'].includes(newAction)) {
        speakVoice(pihuReply);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `pihu-err-${Date.now()}`,
          sender: 'pihu',
          text: `⚠️ Error: ${err.message}`,
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

  // Suggestion chips by Role and Language
  const getSuggestions = () => {
    if (language === 'hi') {
      if (role === 'employee') {
        return [
          { label: '⏱️ पंच-इन करें', action: () => triggerInChatPunchPrompt('in') },
          { label: '⏱️ पंच-आउट करें', action: () => triggerInChatPunchPrompt('out') },
          { label: '📅 छुट्टी अप्लाई करें', query: 'Apply my leave' },
          { label: '🎫 सपोर्ट टिकट बनाएं', query: 'Create support ticket' },
          { label: '✏️ पंच सुधार अनुरोध', query: 'Attendance correction' },
          { label: '📊 मासिक रिपोर्ट विश्लेषण', query: 'Monthly report analysis' },
          { label: '🏖️ छुट्टी बैलेंस', query: 'Mera leave balance kitna hai?' },
          { label: '🎉 आगामी छुट्टियां', query: 'Upcoming holidays' }
        ];
      }
      if (role === 'manager') {
        return [
          { label: '👥 आज कौन अनुपस्थित है?', query: 'Who is absent today in my team?' },
          { label: '⏳ लंबित लीव स्वीकृतियां', query: 'Pending leave approvals' },
          { label: '📊 टीम उपस्थिति रिपोर्ट', query: 'Team attendance report analysis' },
          { label: '🎫 सपोर्ट टिकट बनाएं', query: 'Create support ticket' },
          { label: '🎉 आगामी छुट्टियां', query: 'Upcoming holidays' }
        ];
      }
      if (role === 'company_admin') {
        return [
          { label: '🏢 आज की कंपनी उपस्थिति', query: 'Today company attendance overview' },
          { label: '⏳ कंपनी लंबित स्वीकृतियां', query: 'Company pending approvals' },
          { label: '📊 डेटा रिपोर्ट विश्लेषण', query: 'Monthly attendance report analysis' },
          { label: '🎉 आगामी छुट्टियां', query: 'Upcoming holidays' }
        ];
      }
      return [
        { label: '🌐 ग्लोबल सिस्टम स्थिति', query: 'Platform system overview' },
        { label: '🏢 पंजीकृत कंपनियां', query: 'Registered companies overview' }
      ];
    }

    // English suggestions
    if (role === 'employee') {
      return [
        { label: '⏱️ Punch In', action: () => triggerInChatPunchPrompt('in') },
        { label: '⏱️ Punch Out', action: () => triggerInChatPunchPrompt('out') },
        { label: '📅 Apply My Leave', query: 'Apply my leave' },
        { label: '🎫 Create Ticket', query: 'Create support ticket' },
        { label: '✏️ Attendance Correction', query: 'Attendance correction' },
        { label: '📊 Monthly Report Analysis', query: 'Monthly report analysis' },
        { label: '⏰ My Punch Status', query: 'Today punch status' },
        { label: '🏖️ Leave Balance', query: 'My leave balance' }
      ];
    }
    if (role === 'manager') {
      return [
        { label: '👥 Who is Absent Today?', query: 'Who is absent in my team today?' },
        { label: '⏳ Pending Leave Approvals', query: 'Pending leave approvals' },
        { label: '📊 Team Attendance Report', query: 'Team attendance data analysis' },
        { label: '🎫 Create Support Ticket', query: 'Create support ticket' },
        { label: '🎉 Upcoming Holidays', query: 'Upcoming holidays list' }
      ];
    }
    if (role === 'company_admin') {
      return [
        { label: '🏢 Today Attendance Rate', query: 'Today company attendance overview' },
        { label: '⏳ Pending Approvals', query: 'Company pending leave approvals' },
        { label: '📊 Attendance Report Analysis', query: 'Monthly attendance report analysis' },
        { label: '🎉 Upcoming Holidays', query: 'Upcoming holidays' }
      ];
    }
    return [
      { label: '🌐 Platform Status', query: 'Platform system overview' },
      { label: '🏢 Companies Count', query: 'Registered companies overview' }
    ];
  };

  const suggestions = getSuggestions();

  return (
    <>
      {/* Floating Action Button at Bottom Right with Circular AI Girl Avatar */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 select-none">
          {inactivityNotice && (
            <div className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-xl border border-slate-700 flex items-center gap-1.5 animate-fade-in">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{language === 'hi' ? '5 मिनट निष्क्रियता के बाद चैट क्लियर हो गई' : 'Chat closed & cleared after 5 min idle'}</span>
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
            className="group relative flex items-center gap-2.5 p-1.5 pr-4 bg-gradient-to-r from-pink-600 via-rose-600 to-indigo-600 text-white font-semibold rounded-full shadow-2xl hover:shadow-pink-500/40 hover:scale-105 active:scale-95 transition-all duration-300 border-2 border-white/40"
            title="Chat with PIHU AI Assistant"
          >
            {/* Circular AI Girl Avatar inside */}
            <div className="relative">
              <AiGirlAvatar size="w-11 h-11" border={false} />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-400 border-2 border-pink-700"></span>
              </span>
            </div>

            <div className="flex flex-col items-start text-left">
              <div className="flex items-center gap-1">
                <span className="text-sm font-extrabold tracking-wide">PIHU AI</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              </div>
              <span className="text-[10px] text-pink-100 font-medium">
                {language === 'hi' ? 'सहायक AI' : 'Smart Assistant'}
              </span>
            </div>

            {/* Hover Tooltip */}
            <span className="absolute -top-9 right-0 bg-slate-900 text-white text-[11px] font-medium px-2.5 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              {language === 'hi' ? 'नमस्ते! क्या मैं मदद करूँ?' : 'Hi! May I help you?'}
            </span>
          </button>
        </div>
      )}

      {/* PIHU Chat Window Modal/Drawer */}
      {isOpen && (
        <div
          className="fixed bottom-4 right-4 z-50 w-[95vw] sm:w-[420px] h-[600px] max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200"
          onClick={resetInactivityTimer}
          onMouseMove={resetInactivityTimer}
          onKeyDown={resetInactivityTimer}
        >
          {/* Header with Circular AI Girl Avatar, Language Toggle, Audio & Close */}
          <div className="px-4 py-3 bg-gradient-to-r from-pink-600 via-rose-600 to-indigo-600 text-white flex items-center justify-between shadow-md select-none">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <AiGirlAvatar size="w-10 h-10" border={true} />
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-pink-700 rounded-full"></span>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm leading-tight tracking-wide">PIHU AI</h3>
                  <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded font-medium">Assistant</span>
                </div>
                <p className="text-[11px] text-pink-100 leading-tight flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  {language === 'hi' ? 'ऑनलाइन • 5m ऑटो-क्लियर' : 'Online • 5m Auto-Clear'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Language Switcher [ ENG | हिंदी ] */}
              <div className="flex items-center bg-black/20 p-0.5 rounded-full border border-white/25 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => handleSwitchLanguage('en')}
                  className={`px-2 py-0.5 rounded-full transition-all ${language === 'en' ? 'bg-white text-pink-700 shadow-xs' : 'text-white/80 hover:text-white'}`}
                >
                  ENG
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchLanguage('hi')}
                  className={`px-2 py-0.5 rounded-full transition-all ${language === 'hi' ? 'bg-white text-pink-700 shadow-xs' : 'text-white/80 hover:text-white'}`}
                >
                  हिंदी
                </button>
              </div>

              {/* Voice Mute / Unmute */}
              <button
                type="button"
                onClick={toggleVoice}
                className={`p-1.5 rounded-lg transition-colors ${voiceEnabled ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}
                title={voiceEnabled ? 'Voice Active (Click to Mute)' : 'Voice Muted (Click to Enable)'}
              >
                {voiceEnabled ? <Volume2 className="w-4 h-4 text-emerald-300" /> : <VolumeX className="w-4 h-4 text-white/50" />}
              </button>

              {/* Close Button */}
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
                onClick={() => {
                  if (s.action) {
                    s.action();
                  } else {
                    handleSendMessage(s.query);
                  }
                }}
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
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white rounded-br-none'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                  }`}
                >
                  <div className="whitespace-pre-wrap">
                    {m.text}
                  </div>

                  {/* Interactive Punch Confirmation Card */}
                  {m.isPunchCard && pendingPunch && (
                    <div className="mt-3 p-3 bg-pink-50/80 border border-pink-200 rounded-xl space-y-2 text-[11px] text-pink-950">
                      <div className="flex items-center gap-1.5 font-bold text-pink-700">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{language === 'hi' ? 'जीपीएस स्थान सत्यापन' : 'GPS Location Verified'}</span>
                      </div>
                      <div className="text-slate-700">
                        • {language === 'hi' ? 'स्थान' : 'Location'}: <b>{pendingPunch.location}</b>
                      </div>
                      <div className="text-slate-700">
                        • GPS: <code className="bg-white px-1 rounded border border-slate-200">{pendingPunch.lat.toFixed(4)}, {pendingPunch.lon.toFixed(4)}</code>
                      </div>
                      <div className="text-slate-700">
                        • {language === 'hi' ? 'समय' : 'Time'}: <b>{pendingPunch.displayTime}</b>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={handleConfirmPunch}
                          className="flex-1 py-1.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg font-bold shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {language === 'hi' ? 'कन्फर्म करें' : 'Confirm Punch'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingPunch(null)}
                          className="py-1.5 px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-all"
                        >
                          {language === 'hi' ? 'रद्द' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Leave Submitted Card */}
                  {m.leaveDetails && (
                    <div className="mt-2.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{language === 'hi' ? 'छुट्टी आवेदन सबमिट हुआ' : 'Leave Request Created'}</span>
                      </div>
                      <div>• {language === 'hi' ? 'प्रकार' : 'Type'}: <b>{m.leaveDetails.leaveType}</b></div>
                      <div>• {language === 'hi' ? 'अवधि' : 'Duration'}: <b>{m.leaveDetails.startDate}</b> to <b>{m.leaveDetails.endDate}</b> ({m.leaveDetails.workingDays} {language === 'hi' ? 'कार्य दिवस' : 'working days'})</div>
                      <div>• {language === 'hi' ? 'कारण' : 'Reason'}: <i>{m.leaveDetails.reason}</i></div>
                    </div>
                  )}

                  {/* Ticket Submitted Card */}
                  {m.ticketDetails && (
                    <div className="mt-2.5 p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-[11px] text-indigo-900 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-indigo-700">
                        <Ticket className="w-3.5 h-3.5" />
                        <span>{language === 'hi' ? 'सपोर्ट टिकट बना दिया गया' : 'Support Ticket Raised'}</span>
                      </div>
                      <div>• ID: <b>#TKT-{m.ticketDetails.id}</b></div>
                      <div>• {language === 'hi' ? 'टाइटल' : 'Title'}: <b>{m.ticketDetails.title}</b></div>
                    </div>
                  )}

                  {/* Action Link button */}
                  {m.action === 'VIEW_APPROVALS' && onSelectTab && (
                    <button
                      type="button"
                      onClick={() => onSelectTab('approvals')}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-pink-700 bg-pink-50 hover:bg-pink-100 px-2.5 py-1 rounded-lg border border-pink-200 transition-colors"
                    >
                      {language === 'hi' ? 'स्वीकृति (Approvals) टैब खोलें' : 'Open Approvals Tab'} <ArrowRight className="w-3 h-3" />
                    </button>
                  )}

                  {m.action === 'VIEW_PUNCH' && onSelectTab && (
                    <button
                      type="button"
                      onClick={() => onSelectTab('punch')}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-pink-700 bg-pink-50 hover:bg-pink-100 px-2.5 py-1 rounded-lg border border-pink-200 transition-colors"
                    >
                      {language === 'hi' ? 'पंच स्क्रीन पर जाएं' : 'Go to Punch Screen'} <ArrowRight className="w-3 h-3" />
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
                  <span className="text-[11px] text-slate-400 ml-1 font-medium">
                    {language === 'hi' ? 'पिहू विश्लेषण कर रही है...' : 'PIHU is analyzing...'}
                  </span>
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
                    ? (language === 'hi' ? 'जैसे: 2026-09-22 to 2026-09-23...' : 'e.g. 2026-09-22 to 2026-09-23...')
                    : conversationState.actionState === 'AWAITING_LEAVE_REASON'
                    ? (language === 'hi' ? 'छुट्टी का कारण बताएं...' : 'Enter reason for leave...')
                    : conversationState.actionState === 'AWAITING_TICKET_TITLE'
                    ? (language === 'hi' ? 'समस्या का टाइटल लिखें...' : 'Enter issue title...')
                    : conversationState.actionState === 'AWAITING_TICKET_DESC'
                    ? (language === 'hi' ? 'समस्या का विवरण लिखें...' : 'Describe issue in detail...')
                    : conversationState.actionState === 'AWAITING_CORRECTION_DATE'
                    ? (language === 'hi' ? 'करेक्शन की तारीख (जैसे 2026-09-15)...' : 'Correction date (e.g. 2026-09-15)...')
                    : conversationState.actionState === 'AWAITING_CORRECTION_TIMES'
                    ? (language === 'hi' ? 'सही पंच समय (09:30 AM to 06:30 PM)...' : 'Correct times (09:30 AM to 06:30 PM)...')
                    : (language === 'hi' ? 'पिहू से कुछ भी पूछें (जैसे Punch In, Apply leave)...' : 'Ask PIHU anything (e.g. Punch In, Apply leave)...')
                }
                className="flex-1 text-xs px-3.5 py-2.5 bg-slate-100 border border-slate-300 rounded-full focus:outline-none focus:border-pink-500 focus:bg-white text-slate-900 transition-all placeholder:text-slate-400"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || loading}
                className="p-2.5 rounded-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-md active:scale-95 transition-all cursor-pointer"
                title={language === 'hi' ? 'भेजें' : 'Send message'}
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            <div className="flex items-center justify-between text-[10px] text-slate-400 px-2 pt-1">
              <span>{language === 'hi' ? '🔒 100% डेटा गोपनीयता सुरक्षित' : '🔒 100% Data Confidentiality'}</span>
              <span>{language === 'hi' ? '5m निष्क्रियता पर ऑटो-क्लियर' : 'Auto-clears in 5m idle'}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
