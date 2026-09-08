import React, { useState, useEffect } from 'react';
import {
  MapPin, Clock, Calendar, ShieldCheck, AlertCircle, CheckCircle2,
  Ticket, KeyRound, User, Smartphone, RefreshCw, Send, ArrowUpRight,
  ShieldAlert, CheckCircle, Navigation, MessageSquare, Edit3, Sparkles, FileEdit, Check, X, Globe,
  FileText, Download, SlidersHorizontal, Printer, ChevronDown, CheckSquare, Square,
  LogOut, ChevronLeft, ChevronRight, Filter
} from 'lucide-react';
import { apiRequest } from '../api';
import UnifiedCalendar from '../components/UnifiedCalendar';
import TicketChatModal from '../components/TicketChatModal';

const ALL_DAILY_REPORT_COLUMNS = [
  { id: 'Date', label: 'Attendance Date' },
  { id: 'Punch In', label: 'Punch In Time' },
  { id: 'GPS Lat/Long (Punch In)', label: 'Punch In GPS (Lat/Long)' },
  { id: 'Address (Punch In)', label: 'Punch In Location Address' },
  { id: 'Punch Out', label: 'Punch Out Time' },
  { id: 'GPS Lat/Long (Punch Out)', label: 'Punch Out GPS (Lat/Long)' },
  { id: 'Address (Punch Out)', label: 'Punch Out Location Address' },
  { id: 'Working Hours', label: 'Total Working Hours' },
  { id: 'Status', label: 'Attendance Status' }
];

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function format12Hour(timeStr) {
  if (!timeStr || timeStr === '-' || timeStr === '--:--') return '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  return `${h < 10 ? '0' + h : h}:${m} ${ampm}`;
}

export default function EmployeePanel({ user, company, activeTab, onLogout }) {
  // Live Current Time Clock State (ticks continuously every 1 sec)
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  const [todayRecord, setTodayRecord] = useState(null);
  const [history, setHistory] = useState([]);
  const [calendarData, setCalendarData] = useState({ records: [], holidays: [], offDays: ['Sunday'] });
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [chatTicketId, setChatTicketId] = useState(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [geofences, setGeofences] = useState([]);
  const [myGeofence, setMyGeofence] = useState(null);
  const [allowedAnywhere, setAllowedAnywhere] = useState(false);
  const [loading, setLoading] = useState(false);
  const [punchLoading, setPunchLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // GPS State
  const [gpsLocation, setGpsLocation] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const [gpsFetching, setGpsFetching] = useState(false);

  // Monthly Filtering, Pagination & PDF Reports State
  const todayDate = new Date();
  const [filterMonth, setFilterMonth] = useState(todayDate.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(todayDate.getFullYear());
  const [monthlyStats, setMonthlyStats] = useState(null);
  const [showDailyReportModal, setShowDailyReportModal] = useState(false);

  // Attendance Logs Pagination & Filter State
  const [logsPageSize, setLogsPageSize] = useState(10); // 10, 25, 50, 'all'
  const [logsCurrentPage, setLogsCurrentPage] = useState(1);
  const [logsStatusFilter, setLogsStatusFilter] = useState('all');

  const handleSignOut = () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem('token');
      window.location.reload();
    }
  };
  const [selectedExportColumns, setSelectedExportColumns] = useState([
    'Date', 'Punch In', 'GPS Lat/Long (Punch In)', 'Address (Punch In)',
    'Punch Out', 'GPS Lat/Long (Punch Out)', 'Address (Punch Out)',
    'Working Hours', 'Status'
  ]);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Forms
  const [leaveForm, setLeaveForm] = useState({
    leave_type_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    total_days: 1,
    reason: ''
  });

  const [ticketForm, setTicketForm] = useState({
    request_type: 'missing_punch',
    title: '',
    description: '',
    punch_date: new Date().toISOString().split('T')[0],
    suggested_punch_in: '09:00:00',
    suggested_punch_out: '18:00:00'
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Live Work Timer State
  const [elapsedTime, setElapsedTime] = useState('00h 00m 00s');

  // Month-wise Accrual History for Earned Leave
  const [accrualHistory, setAccrualHistory] = useState([]);

  // Attendance Correction Requests State
  const [correctionRequests, setCorrectionRequests] = useState([]);
  const [correctionForm, setCorrectionForm] = useState({
    date: new Date().toISOString().split('T')[0],
    requested_punch_in: '09:00:00',
    requested_punch_out: '18:00:00',
    requested_status: 'Present',
    reason: ''
  });
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // Fetch current GPS coordinates from browser Geolocation API
  const getBrowserGPS = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser or device.'));
        return;
      }
      setGpsFetching(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy)
          };
          setGpsLocation(coords);
          setGpsError('');
          setGpsFetching(false);
          resolve(coords);
        },
        (err) => {
          setGpsFetching(false);
          let msg = 'Failed to obtain GPS coordinates.';
          if (err.code === 1) msg = 'Location access permission was DENIED. GPS permission is strictly mandatory to Punch In/Out.';
          else if (err.code === 2) msg = 'Location position unavailable. Please check your device GPS.';
          else if (err.code === 3) msg = 'Location request timed out. Please try again.';
          setGpsError(msg);
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });
  };

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Today's attendance
      const todayRes = await apiRequest('/attendance/today');
      setTodayRecord(todayRes.record);

      // 2. Attendance history
      if (activeTab === 'history' || activeTab === 'punch') {
        let listUrl = '/attendance/list?limit=100';
        if (activeTab === 'history') {
          listUrl += `&month=${filterMonth}&year=${filterYear}`;
        }
        const listRes = await apiRequest(listUrl);
        setHistory(listRes.records || []);

        // Also fetch calendar data to compute exact monthly summary for active employee
        if (activeTab === 'history') {
          try {
            const calRes = await apiRequest(`/attendance/calendar?month=${filterMonth}&year=${filterYear}`);
            setCalendarData({
              records: calRes.records || [],
              holidays: calRes.holidays || [],
              offDays: calRes.offDays || ['Sunday']
            });
            const daysInMonth = new Date(filterYear, filterMonth, 0).getDate();
            const dayNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const todayStr = new Date().toISOString().split('T')[0];
            const mStr = String(filterMonth).padStart(2, '0');

            const attMap = {};
            (calRes.records || []).forEach(r => { attMap[r.date] = r; });
            const holMap = {};
            (calRes.holidays || []).forEach(h => { holMap[h.holiday_date] = h; });
            const offDays = calRes.offDays || ['Sunday'];

            let pCount = 0, hdCount = 0, woCount = 0, hoCount = 0, lCount = 0, aCount = 0;

            for (let d = 1; d <= daysInMonth; d++) {
              const dStr = String(d).padStart(2, '0');
              const dateStr = `${filterYear}-${mStr}-${dStr}`;
              const dayName = dayNamesFull[new Date(filterYear, filterMonth - 1, d).getDay()];

              const att = attMap[dateStr];
              const hol = holMap[dateStr];
              const isWO = offDays.includes(dayName);

              if (att) {
                if (att.status === 'Present') pCount++;
                else if (att.status === 'Half Day') hdCount++;
                else if (att.status === 'Leave') lCount++;
                else if (att.status === 'Absent') aCount++;
                else if (att.status === 'Holiday') hoCount++;
                else if (att.status === 'Weekly Off') woCount++;
                else pCount++;
              } else if (hol) {
                hoCount++;
              } else if (isWO) {
                woCount++;
              } else if (dateStr <= todayStr) {
                aCount++;
              }
            }

            const payableDays = Math.round((pCount + (hdCount * 0.5) + woCount + hoCount + lCount) * 100) / 100;
            setMonthlyStats({
              totalDays: daysInMonth,
              present: pCount,
              half_day: hdCount,
              weekly_off: woCount,
              holiday: hoCount,
              leave: lCount,
              absent: aCount,
              payable_days: payableDays
            });
          } catch (e) {
            console.error('Failed to compute monthly stats:', e);
          }
        }
      }

      // 3. Leave balances and history (strictly CL and EL with month-wise accruals)
      if (activeTab === 'leave' || activeTab === 'punch') {
        const balRes = await apiRequest('/leave/balances');
        setLeaveBalances(balRes.balances || []);
        setAccrualHistory(balRes.accrualHistory || []);
        if (balRes.balances && balRes.balances[0]) {
          setLeaveForm(prev => ({ ...prev, leave_type_id: balRes.balances[0].leave_type_id }));
        }
        const reqRes = await apiRequest('/leave/requests');
        setLeaveRequests(reqRes.requests || []);
      }

      // 4. Attendance Correction Requests
      if (activeTab === 'correction' || activeTab === 'history') {
        const corrRes = await apiRequest('/attendance/correction-requests');
        setCorrectionRequests(corrRes.requests || []);
      }

      // 5. Service tickets
      if (activeTab === 'tickets') {
        const tickRes = await apiRequest('/tickets/service-requests?view=all');
        setTickets(tickRes.requests || []);
      }

      // 6. Active Geofences for validation
      const gfRes = await apiRequest('/geofences');
      setGeofences(gfRes.geofences || []);
      setMyGeofence(gfRes.my_geofence || null);
      setAllowedAnywhere(!!gfRes.allowed_anywhere);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Warm up GPS silently
    getBrowserGPS().catch(() => {});

    // Real-time Master Auto-Sync & Header Refresh listener
    const handleMasterRefresh = () => {
      fetchData();
    };
    window.addEventListener('master-refresh', handleMasterRefresh);
    return () => window.removeEventListener('master-refresh', handleMasterRefresh);
  }, [activeTab, filterMonth, filterYear]);

  // Export Daily Detailed PDF with customizable columns
  const handleExportDailyPdf = async () => {
    setExportingPdf(true);
    setError('');
    try {
      const res = await apiRequest('/attendance/export', {
        method: 'POST',
        body: {
          format: 'pdf',
          month: filterMonth,
          year: filterYear,
          selected_columns: selectedExportColumns
        }
      });

      if (res.isHtmlReport) {
        const win = window.open('', '_blank');
        win.document.write(res.htmlText);
        win.document.close();
        setSuccess('Opened Daily Detailed Attendance PDF report in new tab.');
        setShowDailyReportModal(false);
      } else if (res.isBlob) {
        const url = window.URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Daily_Attendance_${filterYear}_${filterMonth}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setSuccess('Downloaded Daily Attendance report.');
        setShowDailyReportModal(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to export Daily PDF report.');
    } finally {
      setExportingPdf(false);
    }
  };

  // Export Monthly Master Attendance Matrix Sheet (1..31 days + Payable Days)
  const handleExportMonthlyMatrixPdf = async () => {
    setExportingPdf(true);
    setError('');
    try {
      const res = await apiRequest('/attendance/monthly-matrix-pdf', {
        method: 'POST',
        body: {
          month: filterMonth,
          year: filterYear
        }
      });

      if (res.isHtmlReport) {
        const win = window.open('', '_blank');
        win.document.write(res.htmlText);
        win.document.close();
        setSuccess('Opened Monthly Master Sheet (1..31 Matrix) in new tab.');
      }
    } catch (err) {
      setError(err.message || 'Failed to export Monthly Master Sheet PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  // Refresh live GPS coordinates
  const handleRefreshGPS = async () => {
    setError('');
    try {
      await getBrowserGPS();
    } catch (err) {
      setError(err.message || 'Failed to acquire GPS coordinates.');
    }
  };

  // Compute live geofence verification status
  const geofenceStatus = (() => {
    // 1st Check: GPS ON/OFF Status
    if (!gpsLocation || gpsError) {
      return {
        checked: false,
        gpsOff: true,
        allowed: false,
        text: gpsError || 'GPS Location is OFF. Turn on device GPS and enable browser location permission to punch attendance.'
      };
    }

    // 2nd Check: Anywhere Attendance / Unassigned Mode
    // If company policy is anywhere, or employee is not assigned a restricted office zone
    if (allowedAnywhere || !myGeofence) {
      return {
        checked: true,
        gpsOff: false,
        allowed: true,
        isAnywhere: true,
        text: '🌐 Anywhere Attendance Allowed: No geofence restrictions assigned. You can punch from any location.'
      };
    }

    // 3rd Check: Assigned Office Geofence Validation
    const dist = calculateDistanceMeters(
      gpsLocation.latitude,
      gpsLocation.longitude,
      myGeofence.latitude,
      myGeofence.longitude
    );

    if (dist <= myGeofence.radius) {
      return {
        checked: true,
        gpsOff: false,
        allowed: true,
        isAnywhere: false,
        distance: dist,
        radius: myGeofence.radius,
        name: myGeofence.location_name,
        text: `Inside Zone: ${myGeofence.location_name} (${dist}m away / ${myGeofence.radius}m allowed)`
      };
    } else {
      return {
        checked: true,
        gpsOff: false,
        allowed: false,
        isAnywhere: false,
        distance: dist,
        radius: myGeofence.radius,
        name: myGeofence.location_name,
        text: `Outside Zone: ${myGeofence.location_name} (${dist}m away / ${myGeofence.radius}m allowed) - Punch Blocked`
      };
    }
  })();

  const handlePunchIn = async () => {
    setError('');
    setSuccess('');

    // 1st check: GPS Location ON/OFF
    let coords = gpsLocation;
    if (!coords) {
      setPunchLoading(true);
      try {
        coords = await getBrowserGPS();
      } catch (err) {
        setError('GPS Location is required: Please turn on device GPS and enable browser location permission to Punch In.');
        setPunchLoading(false);
        return;
      }
    }

    // 2nd check: Geofencing validation if office zone is assigned
    if (myGeofence && !allowedAnywhere) {
      const dist = calculateDistanceMeters(coords.latitude, coords.longitude, myGeofence.latitude, myGeofence.longitude);
      if (dist > myGeofence.radius) {
        setError(`Punch Blocked: Outside authorized geofence for ${myGeofence.location_name} (${dist}m away / ${myGeofence.radius}m allowed). You can only punch inside the designated office area.`);
        return;
      }
    }

    setPunchLoading(true);
    try {
      const res = await apiRequest('/attendance/punch-in', {
        method: 'POST',
        body: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          location_name: myGeofence ? myGeofence.location_name : 'Employee Device Location'
        }
      });
      setSuccess(res.message);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setPunchLoading(false);
    }
  };

  const handlePunchOut = async () => {
    setError('');
    setSuccess('');

    // 1st check: GPS Location ON/OFF
    let coords = gpsLocation;
    if (!coords) {
      setPunchLoading(true);
      try {
        coords = await getBrowserGPS();
      } catch (err) {
        setError('GPS Location is required: Please turn on device GPS and enable browser location permission to Punch Out.');
        setPunchLoading(false);
        return;
      }
    }

    // 2nd check: Geofencing validation if office zone is assigned
    if (myGeofence && !allowedAnywhere) {
      const dist = calculateDistanceMeters(coords.latitude, coords.longitude, myGeofence.latitude, myGeofence.longitude);
      if (dist > myGeofence.radius) {
        setError(`Punch Blocked: Outside authorized geofence for ${myGeofence.location_name} (${dist}m away / ${myGeofence.radius}m allowed). You can only punch inside the designated office area.`);
        return;
      }
    }

    setPunchLoading(true);
    try {
      const res = await apiRequest('/attendance/punch-out', {
        method: 'POST',
        body: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          location_name: myGeofence ? myGeofence.location_name : 'Employee Device Location'
        }
      });
      setSuccess(res.message);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setPunchLoading(false);
    }
  };

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/leave/requests', {
        method: 'POST',
        body: leaveForm
      });
      setSuccess('Leave application submitted for approval.');
      setLeaveForm({
        leave_type_id: leaveBalances[0]?.leave_type_id || '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        total_days: 1,
        reason: ''
      });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmitTicket = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/tickets/service-request', {
        method: 'POST',
        body: ticketForm
      });
      setSuccess('Service ticket submitted successfully.');
      setTicketForm({
        request_type: 'missing_punch',
        title: '',
        description: '',
        punch_date: new Date().toISOString().split('T')[0],
        suggested_punch_in: '09:00:00',
        suggested_punch_out: '18:00:00'
      });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        }
      });
      setSuccess('Password updated successfully.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setError(err.message);
    }
  };

  // Live Working Hours Timer Effect (ticks continuously every 1 sec during active punch in)
  useEffect(() => {
    if (!todayRecord || !todayRecord.punch_in_time) {
      setElapsedTime('00h 00m 00s');
      return;
    }
    if (todayRecord.punch_out_time) {
      if (todayRecord.total_hours) {
        setElapsedTime(`${todayRecord.total_hours} hrs`);
      }
      return;
    }

    const updateTimer = () => {
      try {
        const [h, m, s = 0] = todayRecord.punch_in_time.split(':').map(Number);
        const punchDate = new Date();
        if (todayRecord.date) {
          const [yr, mo, dy] = todayRecord.date.split('-').map(Number);
          punchDate.setFullYear(yr, mo - 1, dy);
        }
        punchDate.setHours(h, m, s, 0);
        const now = new Date();
        let diffMs = now.getTime() - punchDate.getTime();
        if (diffMs < 0) diffMs = 0;
        const totalSecs = Math.floor(diffMs / 1000);
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        const pad = n => String(n).padStart(2, '0');
        setElapsedTime(`${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`);
      } catch (e) {
        setElapsedTime('00h 00m 00s');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [todayRecord]);

  // Submit Attendance Correction Request
  const handleSubmitCorrection = async (e) => {
    e.preventDefault();
    if (!correctionForm.date || !correctionForm.requested_punch_in || !correctionForm.requested_punch_out || !correctionForm.reason.trim()) {
      setError('Please provide date, requested punch in/out, and valid justification.');
      return;
    }

    setSubmittingCorrection(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiRequest('/attendance/correction-request', {
        method: 'POST',
        body: correctionForm
      });
      setSuccess(res.message || 'Attendance correction request submitted.');
      setCorrectionForm({
        date: new Date().toISOString().split('T')[0],
        requested_punch_in: '09:00:00',
        requested_punch_out: '18:00:00',
        requested_status: 'Present',
        reason: ''
      });
      const corrRes = await apiRequest('/attendance/correction-requests');
      setCorrectionRequests(corrRes.requests || []);
    } catch (err) {
      setError(err.message || 'Failed to submit correction request.');
    } finally {
      setSubmittingCorrection(false);
    }
  };

  // Compute Full Month Day-wise Attendance Logs (1..daysInMonth)
  const fullMonthDailyLogs = React.useMemo(() => {
    const daysInMonth = new Date(filterYear, filterMonth, 0).getDate();
    const dayNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayStr = new Date().toISOString().split('T')[0];
    const mStr = String(filterMonth).padStart(2, '0');

    const attMap = {};
    (calendarData.records || []).forEach(r => { attMap[r.date] = r; });
    (history || []).forEach(r => { if (!attMap[r.date]) attMap[r.date] = r; });

    const holMap = {};
    (calendarData.holidays || []).forEach(h => { holMap[h.holiday_date] = h; });
    const offDays = calendarData.offDays || ['Sunday'];

    const logs = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = String(d).padStart(2, '0');
      const dateStr = `${filterYear}-${mStr}-${dStr}`;
      const dayDate = new Date(filterYear, filterMonth - 1, d);
      const dayName = dayNamesFull[dayDate.getDay()];
      const shortDay = dayName.slice(0, 3);

      const att = attMap[dateStr];
      const hol = holMap[dateStr];
      const isWO = offDays.includes(dayName);

      let status = 'Upcoming';
      let statusCode = '-';
      let punchIn = '--:--';
      let punchInLatLong = '-';
      let punchInLocation = '-';
      let punchOut = '--:--';
      let punchOutLatLong = '-';
      let punchOutLocation = '-';
      let totalHours = '-';

      if (att) {
        status = att.status || 'Present';
        statusCode = status === 'Present' ? 'P' :
                     status === 'Half Day' ? 'HD' :
                     status === 'Weekly Off' ? 'WO' :
                     status === 'Holiday' ? 'HO' :
                     status === 'Leave' ? 'L' :
                     status === 'Absent' ? 'A' : 'P';
        punchIn = att.punch_in_time ? format12Hour(att.punch_in_time) : '--:--';
        punchInLatLong = (att.punch_in_lat && att.punch_in_lng) ? `${Number(att.punch_in_lat).toFixed(4)}, ${Number(att.punch_in_lng).toFixed(4)}` : '-';
        punchInLocation = att.punch_in_location || '-';
        punchOut = att.punch_out_time ? format12Hour(att.punch_out_time) : '--:--';
        punchOutLatLong = (att.punch_out_lat && att.punch_out_lng) ? `${Number(att.punch_out_lat).toFixed(4)}, ${Number(att.punch_out_lng).toFixed(4)}` : '-';
        punchOutLocation = att.punch_out_location || '-';
        totalHours = att.total_hours ? `${att.total_hours} hrs` : (att.punch_in_time && !att.punch_out_time ? 'In Progress' : '-');
      } else if (hol) {
        status = `Holiday (${hol.name})`;
        statusCode = 'HO';
      } else if (isWO) {
        status = 'Weekly Off';
        statusCode = 'WO';
      } else if (dateStr <= todayStr) {
        status = 'Absent';
        statusCode = 'A';
      } else {
        status = 'Upcoming';
        statusCode = '-';
      }

      logs.push({
        day: d,
        date: dateStr,
        dayName: shortDay,
        name: user?.fullName || user?.username || 'Employee',
        status,
        statusCode,
        punchIn,
        punchInLatLong,
        punchInLocation,
        punchOut,
        punchOutLatLong,
        punchOutLocation,
        totalHours
      });
    }

    return logs;
  }, [filterYear, filterMonth, calendarData, history, user]);

  // Filtered Daily Logs according to optional status filter
  const filteredDailyLogs = React.useMemo(() => {
    if (logsStatusFilter === 'all') return fullMonthDailyLogs;
    return fullMonthDailyLogs.filter(log => log.statusCode === logsStatusFilter);
  }, [fullMonthDailyLogs, logsStatusFilter]);

  // Dynamic Pagination Calculation (10, 25, 50, all)
  const totalLogItems = filteredDailyLogs.length;
  const isAllPageSize = logsPageSize === 'all';
  const effectivePageSize = isAllPageSize ? totalLogItems || 1 : Number(logsPageSize);
  const totalLogPages = Math.max(1, Math.ceil(totalLogItems / effectivePageSize));
  const safeLogPage = Math.min(Math.max(1, logsCurrentPage), totalLogPages);

  const paginatedLogs = isAllPageSize
    ? filteredDailyLogs
    : filteredDailyLogs.slice((safeLogPage - 1) * effectivePageSize, safeLogPage * effectivePageSize);

  return (
    <div className="relative space-y-6 max-w-5xl mx-auto">
      {/* Decorative Ambient Glowing Graphics in Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10 opacity-35">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-gradient-to-tr from-sky-400 to-indigo-500 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-28 w-96 h-96 bg-gradient-to-bl from-teal-400 to-emerald-500 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 w-96 h-96 bg-gradient-to-tr from-purple-400 to-pink-500 rounded-full blur-3xl" />
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2 shadow-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* VIEW: GPS ATTENDANCE PUNCH CARD */}
      {activeTab === 'punch' && (
        <div className="space-y-6">
          {/* Welcome & Dashboard Status Header */}
          <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-slate-700/80">
            {/* Ambient Lighting in Header */}
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 -mb-16 w-56 h-56 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute top-1/2 left-0 -ml-16 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
            
            {/* Modern Subtle Dot Grid */}
            <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 text-[11px] font-semibold border border-sky-400/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Employee Dashboard</span>
                  <span className="text-slate-500">•</span>
                  <span>Real-time Active</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Welcome, {user.fullName || user.username}
                  {user.employeeCode && (
                    <span className="ml-2 text-sm font-mono font-medium text-sky-300">
                      ({user.employeeCode})
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                  Live operational panel • GPS attendance punch, leave balances, monthly calendar, and helpdesk support.
                </p>
              </div>

              <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-700/60 pt-3 sm:pt-0 sm:pl-6 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Device Security</span>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold mt-0.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Hardware Bound</span>
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <span className="text-[10px] text-slate-400">Shift Status:</span>
                  <p className="text-xs font-bold text-white">
                    {todayRecord?.punch_out_time ? 'Completed' : todayRecord?.punch_in_time ? 'Active Shift' : 'Not Punched In'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Punch Hero Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-slate-700">
            <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center sm:text-left">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 text-xs font-semibold border border-sky-500/30">
                  <MapPin className="w-3.5 h-3.5" />
                  Mandatory GPS Attendance
                </div>
                <h3 className="text-2xl sm:text-3xl font-black font-mono tracking-tight">
                  {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </h3>
                <p className="text-xs text-slate-300">
                  {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>

                {/* GPS Accuracy Status Badge with Auto-fetch & Refresh */}
                <div className="pt-2">
                  {gpsFetching ? (
                    <span className="text-xs text-slate-300 flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" /> Auto-fetching live GPS coordinates...
                    </span>
                  ) : gpsLocation ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-300 bg-emerald-950/70 px-3 py-1.5 rounded-xl border border-emerald-800/80">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        GPS Active: {gpsLocation.latitude.toFixed(4)}, {gpsLocation.longitude.toFixed(4)} (±{gpsLocation.accuracy}m)
                      </span>
                      <button
                        type="button"
                        onClick={handleRefreshGPS}
                        disabled={gpsFetching}
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-300 hover:text-sky-200 bg-sky-950/60 hover:bg-sky-900/80 px-2.5 py-1.5 rounded-xl border border-sky-800/60 transition-colors"
                        title="Auto-fetch and refresh current GPS coordinates"
                      >
                        <RefreshCw className={`w-3 h-3 ${gpsFetching ? 'animate-spin' : ''}`} />
                        Refresh GPS
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-950/80 px-3 py-1.5 rounded-xl border border-amber-800/80 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        {gpsError || 'GPS Location is OFF: Enable device GPS to mark attendance.'}
                      </span>
                      <button
                        type="button"
                        onClick={handleRefreshGPS}
                        disabled={gpsFetching}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-300 hover:text-emerald-200 bg-emerald-950/90 hover:bg-emerald-900 px-3 py-1.5 rounded-xl border border-emerald-700 transition-colors"
                        title="Turn on device GPS and acquire coordinates"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${gpsFetching ? 'animate-spin' : ''}`} />
                        Turn On / Fetch GPS
                      </button>
                    </div>
                  )}
                </div>

                {/* Geofence Authorization Status Badge */}
                {gpsLocation && (
                  <div className="pt-1">
                    {geofenceStatus.isAnywhere ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-300 bg-sky-950/50 px-3 py-1.5 rounded-xl border border-sky-700/60">
                        <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        {geofenceStatus.text}
                      </span>
                    ) : geofenceStatus.allowed ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300 bg-emerald-950/50 px-3 py-1.5 rounded-xl border border-emerald-700/60">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        {geofenceStatus.text}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-300 bg-rose-950/70 px-3 py-1.5 rounded-xl border border-rose-700/70">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        {geofenceStatus.text}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Punch Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handlePunchIn}
                  disabled={
                    punchLoading ||
                    (todayRecord && todayRecord.punch_in_time) ||
                    !gpsLocation ||
                    (geofenceStatus.checked && !geofenceStatus.allowed)
                  }
                  className={`w-full sm:w-40 py-4 px-6 rounded-2xl font-bold text-sm shadow-lg transition-all flex flex-col items-center justify-center gap-1 ${
                    todayRecord && todayRecord.punch_in_time
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed border border-slate-600'
                      : !gpsLocation
                      ? 'bg-amber-950/60 text-amber-300 border border-amber-800/70 cursor-not-allowed opacity-80'
                      : geofenceStatus.checked && !geofenceStatus.allowed
                      ? 'bg-rose-950/70 text-rose-300 border border-rose-800/80 cursor-not-allowed opacity-80'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40 hover:scale-105 active:scale-95'
                  }`}
                  title={
                    todayRecord && todayRecord.punch_in_time
                      ? 'Already punched in today'
                      : !gpsLocation
                      ? 'Device GPS is OFF. Please turn on GPS to punch in.'
                      : geofenceStatus.checked && !geofenceStatus.allowed
                      ? 'Punch blocked: Outside authorized geofence'
                      : 'Punch In'
                  }
                >
                  <span>PUNCH IN</span>
                  <span className="text-[11px] font-normal opacity-80">
                    {todayRecord && todayRecord.punch_in_time
                      ? todayRecord.punch_in_time
                      : !gpsLocation
                      ? 'GPS Required'
                      : geofenceStatus.checked && !geofenceStatus.allowed
                      ? 'Outside Zone'
                      : 'Start Work'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handlePunchOut}
                  disabled={
                    punchLoading ||
                    !todayRecord ||
                    !todayRecord.punch_in_time ||
                    todayRecord.punch_out_time ||
                    !gpsLocation ||
                    (geofenceStatus.checked && !geofenceStatus.allowed)
                  }
                  className={`w-full sm:w-40 py-4 px-6 rounded-2xl font-bold text-sm shadow-lg transition-all flex flex-col items-center justify-center gap-1 ${
                    !todayRecord || !todayRecord.punch_in_time || todayRecord.punch_out_time
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed border border-slate-600'
                      : !gpsLocation
                      ? 'bg-amber-950/60 text-amber-300 border border-amber-800/70 cursor-not-allowed opacity-80'
                      : geofenceStatus.checked && !geofenceStatus.allowed
                      ? 'bg-rose-950/70 text-rose-300 border border-rose-800/80 cursor-not-allowed opacity-80'
                      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40 hover:scale-105 active:scale-95'
                  }`}
                  title={
                    !todayRecord || !todayRecord.punch_in_time || todayRecord.punch_out_time
                      ? 'Punch out unavailable'
                      : !gpsLocation
                      ? 'Device GPS is OFF. Please turn on GPS to punch out.'
                      : geofenceStatus.checked && !geofenceStatus.allowed
                      ? 'Punch blocked: Outside authorized geofence'
                      : 'Punch Out'
                  }
                >
                  <span>PUNCH OUT</span>
                  <span className="text-[11px] font-normal opacity-80">
                    {todayRecord && todayRecord.punch_out_time
                      ? todayRecord.punch_out_time
                      : !gpsLocation
                      ? 'GPS Required'
                      : geofenceStatus.checked && !geofenceStatus.allowed
                      ? 'Outside Zone'
                      : 'End Work'}
                  </span>
                </button>
              </div>
            </div>

            {/* Background Accent Gradients */}
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          </div>

          {/* Live Work Session Timer (While Punched In) */}
          {todayRecord?.punch_in_time && !todayRecord?.punch_out_time && (
            <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white p-5 rounded-2xl border border-emerald-600/50 shadow-lg flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <span className="relative flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                </span>
                <div>
                  <span className="text-[11px] uppercase font-bold text-emerald-300 tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Live Working Timer (Punch In Active)
                  </span>
                  <div className="text-3xl font-black font-mono tracking-tight text-white mt-0.5">
                    {elapsedTime}
                  </div>
                </div>
              </div>

              <div className="text-right text-xs space-y-1">
                <div className="text-emerald-200 font-semibold flex items-center gap-1.5 justify-end">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Work Session in Progress</span>
                </div>
                <div className="text-[11px] text-slate-300 font-mono">
                  Started at: <span className="text-white font-bold">{format12Hour(todayRecord.punch_in_time)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Shift Completed Summary */}
          {todayRecord?.punch_out_time && (
            <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 shadow-md flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle className="w-4 h-4" />
                <span>Today's Work Shift Completed ({todayRecord.total_hours} Hours)</span>
              </div>
              <div className="text-slate-400 font-mono">
                {format12Hour(todayRecord.punch_in_time)} &rarr; {format12Hour(todayRecord.punch_out_time)}
              </div>
            </div>
          )}

          {/* Dedicated Punch In & Punch Out Captured Details Cards (Below Punching) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Punch In Card */}
            <div className={`p-5 rounded-2xl border shadow-sm space-y-3 transition-all ${
              todayRecord?.punch_in_time
                ? 'bg-emerald-50/50 border-emerald-200'
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl ${todayRecord?.punch_in_time ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Punch In Details</h4>
                    <span className="text-[10px] text-slate-400">Recorded entry timestamp & GPS</span>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                  todayRecord?.punch_in_time
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {todayRecord?.punch_in_time ? 'Punch In Recorded' : 'Not Punched In'}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Punch In Time:</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {todayRecord?.punch_in_time ? format12Hour(todayRecord.punch_in_time) : '--:--'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">GPS Coordinates:</span>
                  <span className="font-mono font-semibold text-slate-800 text-[11px]">
                    {todayRecord?.punch_in_lat && todayRecord?.punch_in_lng
                      ? `${Number(todayRecord.punch_in_lat).toFixed(4)}, ${Number(todayRecord.punch_in_lng).toFixed(4)}`
                      : (todayRecord?.punch_in_time ? 'Office Boundary Coordinates' : '--')}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-100/80">
                  <span className="text-slate-500 whitespace-nowrap">Captured Address:</span>
                  <span className="text-slate-800 font-medium text-right line-clamp-2">
                    {todayRecord?.punch_in_location || (todayRecord?.punch_in_time ? 'Authorized Site Location' : '--')}
                  </span>
                </div>
              </div>
            </div>

            {/* Punch Out Card */}
            <div className={`p-5 rounded-2xl border shadow-sm space-y-3 transition-all ${
              todayRecord?.punch_out_time
                ? 'bg-rose-50/50 border-rose-200'
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl ${todayRecord?.punch_out_time ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Punch Out Details</h4>
                    <span className="text-[10px] text-slate-400">Recorded exit timestamp & GPS</span>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                  todayRecord?.punch_out_time
                    ? 'bg-rose-100 text-rose-800'
                    : todayRecord?.punch_in_time
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {todayRecord?.punch_out_time
                    ? 'Punch Out Recorded'
                    : todayRecord?.punch_in_time
                    ? 'Punch Out Pending'
                    : 'Not Started'}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Punch Out Time:</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {todayRecord?.punch_out_time
                      ? format12Hour(todayRecord.punch_out_time)
                      : (todayRecord?.punch_in_time ? 'Currently Working' : '--:--')}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">GPS Coordinates:</span>
                  <span className="font-mono font-semibold text-slate-800 text-[11px]">
                    {todayRecord?.punch_out_lat && todayRecord?.punch_out_lng
                      ? `${Number(todayRecord.punch_out_lat).toFixed(4)}, ${Number(todayRecord.punch_out_lng).toFixed(4)}`
                      : (todayRecord?.punch_out_time ? 'Office Boundary Coordinates' : '--')}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-100/80">
                  <span className="text-slate-500 whitespace-nowrap">Captured Address:</span>
                  <span className="text-slate-800 font-medium text-right line-clamp-2">
                    {todayRecord?.punch_out_location || (todayRecord?.punch_out_time ? 'Authorized Site Location' : '--')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Leave Balances Quick Summary (Only CL and EL) */}
          <div className="grid grid-cols-2 gap-4">
            {leaveBalances.filter(b => !b.leave_type_name?.includes('Paid Leave')).map(b => (
              <div key={b.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{b.leave_type_name}</span>
                  <Calendar className="w-4 h-4 text-sky-600" />
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black text-slate-900">{b.balance}</p>
                  <span className="text-xs text-slate-400">days available</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>Used: {b.used} days</span>
                  <span className="font-medium text-sky-600">
                    {b.leave_type_name?.includes('Casual') ? '12.0 days / year' : '+1.25 days / month'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* SECTION 4: MY CALENDAR & ATTENDANCE ON DASHBOARD */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-600" />
                  My Monthly Attendance & Holiday Calendar
                </h4>
                <p className="text-[11px] text-slate-500">Official weekly offs, company holidays, and color-coded attendance records</p>
              </div>
            </div>
            <UnifiedCalendar companyId={company?.id} employeeId={user.employeeId} role="employee" />
          </div>
        </div>
      )}

      {/* VIEW: INTERACTIVE CALENDAR */}
      {activeTab === 'calendar' && (
        <div className="space-y-3">
          <UnifiedCalendar companyId={company?.id} employeeId={user.employeeId} role="employee" />
        </div>
      )}

      {/* VIEW: ATTENDANCE LOGS & MONTHLY REPORTS */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Top Control Bar with Month Filter & PDF Export Buttons */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-sky-600" />
                Attendance Logs & Monthly Reports
              </h3>
              <p className="text-xs text-slate-500">
                View day-wise punch logs, GPS locations, and download employee monthly attendance reports
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              {/* Month Selector */}
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(parseInt(e.target.value, 10))}
                className="text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-700"
              >
                {[
                  'January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'
                ].map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>{name}</option>
                ))}
              </select>

              {/* Year Selector */}
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(parseInt(e.target.value, 10))}
                className="text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-700"
              >
                {[2024, 2025, 2026, 2027, 2028].map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>

              {/* Button 1: Daily Detailed Log (PDF) with Header/Column Customizer */}
              <button
                type="button"
                onClick={() => setShowDailyReportModal(true)}
                disabled={exportingPdf}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
                title="Download daily attendance record in PDF with custom columns"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Daily Log (PDF)</span>
              </button>

              {/* Button 2: Monthly Master Attendance Sheet (PDF) */}
              <button
                type="button"
                onClick={handleExportMonthlyMatrixPdf}
                disabled={exportingPdf}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
                title="Download 1..31 day-wise matrix report with P/A/WO/HD/HO and Final Payable Days"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Monthly Sheet (PDF)</span>
              </button>
            </div>
          </div>

          {/* Monthly Attendance Summary Metrics Bar */}
          {monthlyStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center shadow-xs">
                <div className="text-xl font-black text-emerald-600">{monthlyStats.present}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Present (P)</div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center shadow-xs">
                <div className="text-xl font-black text-amber-600">{monthlyStats.half_day}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Half Day (HD)</div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center shadow-xs">
                <div className="text-xl font-black text-rose-600">{monthlyStats.weekly_off}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Weekly Off (WO)</div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center shadow-xs">
                <div className="text-xl font-black text-orange-600">{monthlyStats.holiday}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Holidays (HO)</div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center shadow-xs">
                <div className="text-xl font-black text-purple-600">{monthlyStats.leave}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Leaves (L)</div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center shadow-xs">
                <div className="text-xl font-black text-rose-700">{monthlyStats.absent}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Absent (A)</div>
              </div>
              <div className="bg-emerald-50 p-3.5 rounded-xl border-2 border-emerald-300 text-center shadow-xs col-span-2 sm:col-span-1 md:col-span-1">
                <div className="text-2xl font-black text-emerald-800">{monthlyStats.payable_days}</div>
                <div className="text-[10px] font-black text-emerald-900 uppercase tracking-wider mt-0.5">Payable Days</div>
              </div>
            </div>
          )}

          {/* Daily Records Full Month Table with Dynamic Pagination */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Daily Attendance Logs — Full Month</span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 font-semibold font-mono">
                    {new Date(filterYear, filterMonth - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Full month comprehensive day-by-day logs (1 to {fullMonthDailyLogs.length}) with timestamps, GPS lat/long, hours, and status
                </p>
              </div>

              {/* Page Size & Status Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-500 font-medium">Filter:</span>
                  <select
                    value={logsStatusFilter}
                    onChange={(e) => {
                      setLogsStatusFilter(e.target.value);
                      setLogsCurrentPage(1);
                    }}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="all">All Days ({fullMonthDailyLogs.length})</option>
                    <option value="P">Present (P)</option>
                    <option value="A">Absent (A)</option>
                    <option value="WO">Weekly Off (WO)</option>
                    <option value="HO">Holidays (HO)</option>
                    <option value="HD">Half Day (HD)</option>
                    <option value="L">Leaves (L)</option>
                  </select>
                </div>

                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-500 font-medium">Show:</span>
                  <select
                    value={logsPageSize}
                    onChange={(e) => {
                      const val = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
                      setLogsPageSize(val);
                      setLogsCurrentPage(1);
                    }}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value={10}>10 rows</option>
                    <option value={25}>25 rows</option>
                    <option value={50}>50 rows</option>
                    <option value="all">All ({fullMonthDailyLogs.length})</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Date</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3">Punch In</th>
                    <th className="p-3">GPS Lat/Long (In)</th>
                    <th className="p-3">Punch Out</th>
                    <th className="p-3">GPS Lat/Long (Out)</th>
                    <th className="p-3 text-right">Working Hrs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedLogs.map((log) => (
                    <tr key={log.date} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 font-semibold text-slate-800 whitespace-nowrap">
                        {log.name}
                      </td>
                      <td className="p-3 font-mono text-slate-700 whitespace-nowrap">
                        <span className="font-bold">{log.date}</span>
                        <span className="text-[10px] text-slate-400 ml-1.5 font-sans uppercase">({log.dayName})</span>
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          log.statusCode === 'P' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                          log.statusCode === 'HD' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                          log.statusCode === 'L' ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                          log.statusCode === 'HO' ? 'bg-orange-100 text-orange-800 border border-orange-300' :
                          log.statusCode === 'WO' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                          log.statusCode === 'A' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                          'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-emerald-700 whitespace-nowrap">
                        {log.punchIn}
                      </td>
                      <td className="p-3 font-mono text-[10px] text-slate-600 whitespace-nowrap" title={log.punchInLocation}>
                        {log.punchInLatLong !== '-' ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                            {log.punchInLatLong}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-3 font-mono font-bold text-rose-700 whitespace-nowrap">
                        {log.punchOut}
                      </td>
                      <td className="p-3 font-mono text-[10px] text-slate-600 whitespace-nowrap" title={log.punchOutLocation}>
                        {log.punchOutLatLong !== '-' ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                            {log.punchOutLatLong}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-3 text-right font-medium text-slate-900 font-mono whitespace-nowrap">
                        {log.totalHours}
                      </td>
                    </tr>
                  ))}
                  {paginatedLogs.length === 0 && (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-slate-400">
                        No attendance records match the selected filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-slate-500">
                {totalLogItems > 0 ? (
                  <span>
                    Showing <strong className="text-slate-700">{((safeLogPage - 1) * effectivePageSize) + 1}</strong> to{' '}
                    <strong className="text-slate-700">{Math.min(safeLogPage * effectivePageSize, totalLogItems)}</strong> of{' '}
                    <strong className="text-slate-700">{totalLogItems}</strong> days
                  </span>
                ) : (
                  <span>0 days to show</span>
                )}
              </div>

              {!isAllPageSize && totalLogPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLogsCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safeLogPage <= 1}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 flex items-center gap-1 font-medium"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>

                  {Array.from({ length: totalLogPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setLogsCurrentPage(page)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        safeLogPage === page
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setLogsCurrentPage(p => Math.min(totalLogPages, p + 1))}
                    disabled={safeLogPage >= totalLogPages}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 flex items-center gap-1 font-medium"
                    title="Next Page"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Daily Detailed Report Column Selection Modal */}
          {showDailyReportModal && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-sky-600" />
                      Customize Daily PDF Report Columns
                    </h3>
                    <p className="text-[11px] text-slate-500">Select which sections to include in your downloaded PDF</p>
                  </div>
                  <button
                    onClick={() => setShowDailyReportModal(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs pb-1">
                  <span className="text-slate-500">Selected: {selectedExportColumns.length} of {ALL_DAILY_REPORT_COLUMNS.length}</span>
                  <div className="space-x-2">
                    <button
                      type="button"
                      onClick={() => setSelectedExportColumns(ALL_DAILY_REPORT_COLUMNS.map(c => c.id))}
                      className="text-sky-600 hover:text-sky-700 font-semibold"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedExportColumns(['Date', 'Status'])}
                      className="text-slate-500 hover:text-slate-700 font-semibold"
                    >
                      Minimal
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {ALL_DAILY_REPORT_COLUMNS.map(col => {
                    const isChecked = selectedExportColumns.includes(col.id);
                    return (
                      <label
                        key={col.id}
                        className={`flex items-center gap-2.5 p-2 rounded-xl text-xs cursor-pointer border transition-colors ${
                          isChecked ? 'bg-sky-50/60 border-sky-200 text-slate-900 font-semibold' : 'bg-slate-50/40 border-slate-200 text-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              if (selectedExportColumns.length <= 1) return;
                              setSelectedExportColumns(prev => prev.filter(c => c !== col.id));
                            } else {
                              setSelectedExportColumns(prev => [...prev, col.id]);
                            }
                          }}
                          className="rounded text-sky-600 focus:ring-sky-500"
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowDailyReportModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExportDailyPdf}
                    disabled={exportingPdf || selectedExportColumns.length === 0}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>{exportingPdf ? 'Generating PDF...' : 'Download & Print PDF'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW: LEAVE & BALANCES */}
      {activeTab === 'leave' && (
        <div className="space-y-6">
          {/* Balances Cards (Strictly Casual Leave [12/yr] and Earned Leave [1.25/mo]) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {leaveBalances.filter(b => !b.leave_type_name?.includes('Paid Leave')).map(b => (
              <div key={b.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">{b.leave_type_name}</span>
                  <Calendar className="w-4 h-4 text-sky-600" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-slate-900">{b.balance}</span>
                  <span className="text-xs text-slate-400">/ {b.default_yearly_quota || (b.leave_type_name?.includes('Casual') ? 12 : 15)} total</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                  <span>Used: {b.used} days</span>
                  <span className="font-semibold text-sky-600">
                    {b.leave_type_name?.includes('Casual') ? '12.0 days / year' : '+1.25 days / month'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Month-Wise Earned Leave Accrual Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-2">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Earned Leave (EL) Month-Wise Accrual History
                </h4>
                <p className="text-[11px] text-slate-500">Statutory accrual rate: +1.25 Earned Leave days per active month</p>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                Rate: +1.25 Days / Month
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Leave Type</th>
                    <th className="p-3">Monthly Credit</th>
                    <th className="p-3">EL Balance After</th>
                    <th className="p-3">Reason / Reference</th>
                    <th className="p-3 text-right">Date Applied</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accrualHistory.map(ah => (
                    <tr key={ah.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-800">{ah.leave_type_name || 'Earned Leave (EL)'}</td>
                      <td className="p-3 font-mono font-bold text-emerald-600">+{ah.amount} days</td>
                      <td className="p-3 font-mono font-bold text-slate-900">{ah.balance_after} days</td>
                      <td className="p-3 text-slate-600">{ah.reason}</td>
                      <td className="p-3 text-right text-slate-400 font-mono">{new Date(ah.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {accrualHistory.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-6 text-center text-slate-400">
                        No monthly accruals logged yet. Earned Leave accrues at +1.25 days per month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Apply for Leave Form */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Apply for Leave
            </h3>

            <form onSubmit={handleSubmitLeave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Leave Type *</label>
                  <select
                    value={leaveForm.leave_type_id}
                    onChange={(e) => setLeaveForm({ ...leaveForm, leave_type_id: e.target.value })}
                    className="w-full p-2.5 border rounded-lg bg-white"
                  >
                    {leaveBalances.map(b => (
                      <option key={b.leave_type_id} value={b.leave_type_id}>
                        {b.leave_type_name} ({b.balance} days left)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                    className="w-full p-2.5 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                    className="w-full p-2.5 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Total Days *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    required
                    value={leaveForm.total_days}
                    onChange={(e) => setLeaveForm({ ...leaveForm, total_days: parseFloat(e.target.value) })}
                    className="w-full p-2.5 border rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="font-semibold text-slate-700 block mb-1">Reason for Absence *</label>
                  <input
                    type="text"
                    required
                    value={leaveForm.reason}
                    onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                    placeholder="e.g. Family function / Medical consultation"
                    className="w-full p-2.5 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>

          {/* Leave History Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">My Leave History & Status</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Leave Type</th>
                    <th className="p-3">Dates</th>
                    <th className="p-3">Days</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaveRequests.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">{r.leave_type_name}</td>
                      <td className="p-3 text-slate-700">{r.start_date} to {r.end_date}</td>
                      <td className="p-3 font-medium text-slate-800">{r.total_days}</td>
                      <td className="p-3 text-slate-600">{r.reason}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          r.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                          r.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {r.status}
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

      {/* VIEW: ATTENDANCE CORRECTION REQUESTS */}
      {activeTab === 'correction' && (
        <div className="space-y-6">
          {/* Apply for Attendance Correction Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileEdit className="w-4 h-4 text-sky-600" />
                  Apply for Attendance Correction
                </h3>
                <p className="text-xs text-slate-500">
                  Request adjustments for missing punches or discrepancies. If approved, attendance is marked Present; if cancelled/rejected, marked Absent.
                </p>
              </div>
              <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200">
                Audit Verified Workflow
              </span>
            </div>

            <form onSubmit={handleSubmitCorrection} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Attendance Date *</label>
                  <input
                    type="date"
                    required
                    value={correctionForm.date}
                    onChange={(e) => setCorrectionForm({ ...correctionForm, date: e.target.value })}
                    className="w-full p-2.5 border rounded-lg bg-white font-medium"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Requested Punch In *</label>
                  <input
                    type="time"
                    step="1"
                    required
                    value={correctionForm.requested_punch_in}
                    onChange={(e) => setCorrectionForm({ ...correctionForm, requested_punch_in: e.target.value })}
                    className="w-full p-2.5 border rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Requested Punch Out *</label>
                  <input
                    type="time"
                    step="1"
                    required
                    value={correctionForm.requested_punch_out}
                    onChange={(e) => setCorrectionForm({ ...correctionForm, requested_punch_out: e.target.value })}
                    className="w-full p-2.5 border rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Requested Status *</label>
                  <select
                    value={correctionForm.requested_status}
                    onChange={(e) => setCorrectionForm({ ...correctionForm, requested_status: e.target.value })}
                    className="w-full p-2.5 border rounded-lg bg-white font-semibold text-slate-800"
                  >
                    <option value="Present">Present (Full Day)</option>
                    <option value="Half Day">Half Day</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Reason / Justification for Correction *</label>
                <textarea
                  rows="2"
                  required
                  value={correctionForm.reason}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
                  placeholder="Explain why punch was missed or discrepancy occurred (e.g. Field client meeting / GPS device connectivity issue)..."
                  className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={submittingCorrection}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingCorrection ? 'Submitting...' : 'Submit Correction Request'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* My Attendance Correction Requests Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-2">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">My Correction Application History</h3>
                <p className="text-[11px] text-slate-400">Track approvals, rejections, and supervisor review notes</p>
              </div>
              <span className="text-xs text-slate-500 font-medium">{correctionRequests.length} applications</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Current Status</th>
                    <th className="p-3">Requested In / Out</th>
                    <th className="p-3">Requested Status</th>
                    <th className="p-3">Justification</th>
                    <th className="p-3">Approval Status</th>
                    <th className="p-3">Reviewer Notes</th>
                    <th className="p-3 text-right">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {correctionRequests.map(cr => (
                    <tr key={cr.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900 font-mono">{cr.date}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                          {cr.current_status || 'Absent'}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-700">
                        <span className="text-emerald-700 font-bold">{format12Hour(cr.requested_punch_in)}</span>
                        <span className="mx-1 text-slate-400">&rarr;</span>
                        <span className="text-rose-700 font-bold">{format12Hour(cr.requested_punch_out)}</span>
                      </td>
                      <td className="p-3 font-bold text-sky-700">{cr.requested_status}</td>
                      <td className="p-3 text-slate-600 max-w-xs">{cr.reason}</td>
                      <td className="p-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          cr.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                          cr.status === 'rejected' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                          'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}>
                          {cr.status === 'approved' ? 'Approved (Present)' : cr.status === 'rejected' ? 'Rejected (Absent)' : 'Pending Review'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 italic text-[11px]">
                        {cr.review_notes || '--'}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-400 text-[11px]">
                        {new Date(cr.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {correctionRequests.length === 0 && (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-slate-400">
                        No attendance correction requests submitted yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: SERVICE REQUESTS / TICKETS */}
      {activeTab === 'tickets' && (
        <div className="space-y-6">
          {/* Ticket Governance Notice */}
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2.5 shadow-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <span className="font-bold">Ticket Resolution Governance: </span>
              Once a ticket is marked resolved or closed by Company Admin or Support, it cannot be reopened or replied to. If you require further assistance with an issue, please raise a new ticket below.
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <Ticket className="w-4 h-4 text-sky-600" />
              Raise Service Ticket (Missing Punch / Device / Support)
            </h3>

            <form onSubmit={handleSubmitTicket} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Issue Category *</label>
                  <select
                    value={ticketForm.request_type}
                    onChange={(e) => setTicketForm({ ...ticketForm, request_type: e.target.value })}
                    className="w-full p-2.5 border rounded-lg bg-white"
                  >
                    <option value="missing_punch">Missing Punch In / Out</option>
                    <option value="device_change">Device Change / Unlock</option>
                    <option value="attendance_correction">Attendance Correction</option>
                    <option value="password_reset">Password Support</option>
                    <option value="other">Other HR Support Query</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Subject / Summary *</label>
                  <input
                    type="text"
                    required
                    value={ticketForm.title}
                    onChange={(e) => setTicketForm({ ...ticketForm, title: e.target.value })}
                    placeholder="e.g. Forgot to punch out on Friday due to client meeting"
                    className="w-full p-2.5 border rounded-lg"
                  />
                </div>
              </div>

              {ticketForm.request_type === 'missing_punch' && (
                <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Date</label>
                    <input
                      type="date"
                      value={ticketForm.punch_date}
                      onChange={(e) => setTicketForm({ ...ticketForm, punch_date: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Actual Punch In</label>
                    <input
                      type="time"
                      value={ticketForm.suggested_punch_in}
                      onChange={(e) => setTicketForm({ ...ticketForm, suggested_punch_in: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Actual Punch Out</label>
                    <input
                      type="time"
                      value={ticketForm.suggested_punch_out}
                      onChange={(e) => setTicketForm({ ...ticketForm, suggested_punch_out: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Detailed Explanation</label>
                <textarea
                  rows={3}
                  value={ticketForm.description}
                  onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                  placeholder="Provide supporting context for your manager / HR..."
                  className="w-full p-2.5 border rounded-lg"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>

          {/* Ticket History */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">My Raised Service Requests</h3>
              <span className="text-xs text-slate-400">Closed requests archived automatically</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="p-3">ID</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Resolution Notes</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono font-bold">#{t.id}</td>
                      <td className="p-3 font-semibold text-sky-700 uppercase text-[10px]">
                        {t.request_type.replace('_', ' ')}
                      </td>
                      <td className="p-3 font-medium text-slate-900">{t.title}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          t.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                          t.status === 'in_progress' ? 'bg-purple-100 text-purple-700' :
                          t.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">{t.resolution_notes || '-'}</td>
                      <td className="p-3 text-right">
                        {(t.status === 'resolved' || t.status === 'closed') ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              Closed
                            </span>
                            <button
                              onClick={() => {
                                setChatTicketId(t.id);
                                setShowChatModal(true);
                              }}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                              title="View Archived Ticket History (Reopening not permitted)"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              View
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setChatTicketId(t.id);
                              setShowChatModal(true);
                            }}
                            className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                            title="Open Ticket Chat & View Replies"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Chat / View Replies
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: PROFILE & SECURITY */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Profile Details */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              My Profile Details
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block">Full Name</span>
                <span className="font-semibold text-slate-800 text-sm">{user.fullName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Employee ID</span>
                <span className="font-mono font-bold text-sky-600">{user.employeeCode}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Username</span>
                <span className="font-mono text-slate-700">{user.username}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Company Portal</span>
                <span className="font-semibold text-slate-800">{company?.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Bound Device Status</span>
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md mt-1">
                  <Smartphone className="w-3.5 h-3.5" /> Registered & Bound
                </span>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-sky-600" />
              Change Password
            </h3>

            <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Current Password *</label>
                <input
                  type="password"
                  required
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  className="w-full p-2.5 border rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">New Password *</label>
                <input
                  type="password"
                  required
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className="w-full p-2.5 border rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Confirm New Password *</label>
                <input
                  type="password"
                  required
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  className="w-full p-2.5 border rounded-lg"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium shadow-sm"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>

          {/* Dedicated Sign Out Account Card for Employee */}
          <div className="bg-rose-50/60 p-5 rounded-2xl border border-rose-200 shadow-sm sm:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-rose-900 flex items-center gap-2">
                <LogOut className="w-4 h-4 text-rose-600" />
                Sign Out of Employee Session
              </h4>
              <p className="text-xs text-rose-700/80 mt-0.5">
                Sign out of this hardware-bound account. You will need your credentials to log in again.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 shrink-0 hover:scale-105 active:scale-95"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out Account</span>
            </button>
          </div>
        </div>
      )}

      {/* TICKET CHAT MODAL */}
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
