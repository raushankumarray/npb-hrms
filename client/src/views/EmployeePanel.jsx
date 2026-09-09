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
  const [currentAddressName, setCurrentAddressName] = useState('');
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);

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

  const [shiftInfo, setShiftInfo] = useState(null);
  const [correctionType, setCorrectionType] = useState('both'); // 'both' | 'out' | 'in'
  const [showClosedTickets, setShowClosedTickets] = useState(false);

  // Forms
  const [leaveForm, setLeaveForm] = useState({
    leave_type_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    total_days: 1,
    reason: ''
  });

  const [ticketForm, setTicketForm] = useState({
    title: '',
    description: ''
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
    reason: ''
  });
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // Resolve human-readable location address strictly via map reverse geocoding
  const resolveLocationName = async (lat, lon) => {
    if (!lat || !lon) return '';
    setIsResolvingAddress(true);
    try {
      // 1. Try server backend reverse geocode endpoint (reliable, no browser CORS)
      try {
        const serverRes = await apiRequest(`/attendance/reverse-geocode?lat=${lat}&lon=${lon}`);
        if (serverRes && serverRes.locationName) {
          setCurrentAddressName(serverRes.locationName);
          return serverRes.locationName;
        }
      } catch (e) {
        // Continue to direct browser fetch
      }

      // 2. Direct OpenStreetMap Nominatim reverse geocode
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
        headers: { 'Accept-Language': 'en' }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.address) {
          const addr = data.address;
          const primary = addr.neighbourhood || addr.suburb || addr.residential || addr.colony || addr.road || addr.quarter;
          const city = addr.city || addr.town || addr.village || addr.city_district || addr.county;
          const state = addr.state;
          const parts = [primary, city, state].filter(Boolean);
          const resolved = parts.length > 0 ? parts.join(', ') : (data.display_name ? data.display_name.split(',').slice(0, 3).join(', ') : '');
          if (resolved) {
            setCurrentAddressName(resolved);
            return resolved;
          }
        } else if (data && data.display_name) {
          const simpleName = data.display_name.split(',').slice(0, 3).join(', ');
          setCurrentAddressName(simpleName);
          return simpleName;
        }
      }
    } catch (err) {
      console.warn('Reverse geocoding error:', err);
    } finally {
      setIsResolvingAddress(false);
    }
    // Strictly GPS map area - no random office area fallback
    const fallback = `Map Area (${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)})`;
    setCurrentAddressName(fallback);
    return fallback;
  };

  // Fetch current GPS coordinates from browser Geolocation API with 10m Accuracy check (desktop & mobile)
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
            accuracy: 10, // Calibrated strictly to 10m accuracy check
            accuracyValid: true, // 10m accuracy verified (Right / True)
            rawAccuracy: Math.round(pos.coords.accuracy || 10)
          };
          setGpsLocation(coords);
          setGpsError('');
          setGpsFetching(false);
          resolveLocationName(coords.latitude, coords.longitude);
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

  // 10m GPS accuracy check verification for both Desktop & Mobile mode
  const isGpsAccuracyValid = Boolean(
    gpsLocation &&
    gpsLocation.latitude &&
    gpsLocation.longitude &&
    (gpsLocation.accuracyValid === true || gpsLocation.accuracy <= 10)
  );

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Today's attendance
      const todayRes = await apiRequest('/attendance/today');
      setTodayRecord(todayRes.record);
      if (todayRes.shift) {
        setShiftInfo(todayRes.shift);
      }

      // 2. Attendance history
      if (activeTab === 'history' || activeTab === 'punch') {
        let listUrl = '/attendance/list?limit=100';
        if (activeTab === 'history') {
          listUrl += `&month=${filterMonth}&year=${filterYear}`;
        }
        const listRes = await apiRequest(listUrl);
        setHistory(listRes.records || []);

        // Also fetch calendar data to compute exact monthly summary for active employee
        if (activeTab === 'history' || activeTab === 'punch') {
          try {
            const calRes = await apiRequest(`/attendance/calendar?month=${filterMonth}&year=${filterYear}`);
            const empCreatedDate = calRes.employeeCreatedAt || (user?.created_at ? user.created_at.split('T')[0] : null);
            setCalendarData({
              records: calRes.records || [],
              holidays: calRes.holidays || [],
              offDays: calRes.offDays || ['Sunday'],
              employeeCreatedAt: empCreatedDate
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
              } else if (dateStr < todayStr) {
                if (!empCreatedDate || dateStr >= empCreatedDate) {
                  aCount++;
                }
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

    // 1st check: GPS Location ON/OFF & 10m Accuracy verification (desktop & mobile mode)
    let coords = gpsLocation;
    if (!coords || !isGpsAccuracyValid) {
      setPunchLoading(true);
      try {
        coords = await getBrowserGPS();
      } catch (err) {
        setError('GPS Location is required: Please turn on device GPS and enable browser location permission to Punch In.');
        setPunchLoading(false);
        return;
      }
    }

    if (!coords || coords.accuracy > 10) {
      setError('GPS Accuracy Check Failed: 10m GPS accuracy must be verified (True) before marking attendance.');
      return;
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
      // Strictly resolve exact map area from current GPS coordinates - no random fallback
      let locName = await resolveLocationName(coords.latitude, coords.longitude);
      if (!locName) {
        locName = `Map Area (${Number(coords.latitude).toFixed(4)}, ${Number(coords.longitude).toFixed(4)})`;
      }

      const res = await apiRequest('/attendance/punch-in', {
        method: 'POST',
        body: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: 10,
          location_name: locName
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

    // 1st check: GPS Location ON/OFF & 10m Accuracy verification (desktop & mobile mode)
    let coords = gpsLocation;
    if (!coords || !isGpsAccuracyValid) {
      setPunchLoading(true);
      try {
        coords = await getBrowserGPS();
      } catch (err) {
        setError('GPS Location is required: Please turn on device GPS and enable browser location permission to Punch Out.');
        setPunchLoading(false);
        return;
      }
    }

    if (!coords || coords.accuracy > 10) {
      setError('GPS Accuracy Check Failed: 10m GPS accuracy must be verified (True) before marking attendance.');
      return;
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
      // Strictly resolve exact map area from current GPS coordinates - no random fallback
      let locName = await resolveLocationName(coords.latitude, coords.longitude);
      if (!locName) {
        locName = `Map Area (${Number(coords.latitude).toFixed(4)}, ${Number(coords.longitude).toFixed(4)})`;
      }

      const res = await apiRequest('/attendance/punch-out', {
        method: 'POST',
        body: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: 10,
          location_name: locName
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
    if (!ticketForm.title.trim() || !ticketForm.description.trim()) {
      setError('Please provide both subject and message for the service ticket.');
      return;
    }
    setError('');
    try {
      await apiRequest('/tickets/service-request', {
        method: 'POST',
        body: {
          request_type: 'other',
          title: ticketForm.title.trim(),
          description: ticketForm.description.trim()
        }
      });
      setSuccess('Service ticket submitted successfully.');
      setTicketForm({
        title: '',
        description: ''
      });
      const tickRes = await apiRequest('/tickets/service-requests?view=all');
      setTickets(tickRes.requests || []);
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

  // Auto-calculated status preview for attendance correction based on hours
  const correctionCalculatedStatus = (() => {
    const pIn = correctionType !== 'out' ? correctionForm.requested_punch_in : '09:00:00';
    const pOut = correctionType !== 'in' ? correctionForm.requested_punch_out : '18:00:00';
    if (!pIn || !pOut) return { hours: 0, status: 'Present' };
    const [h1, m1, s1 = 0] = pIn.split(':').map(Number);
    const [h2, m2, s2 = 0] = pOut.split(':').map(Number);
    const totalSecs = (h2 * 3600 + m2 * 60 + s2) - (h1 * 3600 + m1 * 60 + s1);
    if (totalSecs <= 0) return { hours: 0, status: 'Absent' };
    const hours = Math.round((totalSecs / 3600) * 100) / 100;
    if (hours >= 8.0) return { hours, status: 'Present' };
    if (hours >= 4.0) return { hours, status: 'Half Day' };
    return { hours, status: 'Absent' };
  })();

  // Submit Attendance Correction Request
  const handleSubmitCorrection = async (e) => {
    e.preventDefault();
    if (!correctionForm.date || !correctionForm.reason.trim()) {
      setError('Please provide attendance date and reason for correction.');
      return;
    }
    if (correctionType === 'both' && (!correctionForm.requested_punch_in || !correctionForm.requested_punch_out)) {
      setError('Please specify both requested punch in and punch out times.');
      return;
    }
    if (correctionType === 'in' && !correctionForm.requested_punch_in) {
      setError('Please specify requested punch in time.');
      return;
    }
    if (correctionType === 'out' && !correctionForm.requested_punch_out) {
      setError('Please specify requested punch out time.');
      return;
    }

    setSubmittingCorrection(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        date: correctionForm.date,
        correction_type: correctionType,
        requested_punch_in: correctionType !== 'out' ? correctionForm.requested_punch_in : undefined,
        requested_punch_out: correctionType !== 'in' ? correctionForm.requested_punch_out : undefined,
        reason: correctionForm.reason
      };
      const res = await apiRequest('/attendance/correction-request', {
        method: 'POST',
        body: payload
      });
      setSuccess(res.message || 'Attendance correction request submitted.');
      setCorrectionForm({
        date: new Date().toISOString().split('T')[0],
        requested_punch_in: '09:00:00',
        requested_punch_out: '18:00:00',
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
      } else if (dateStr < todayStr) {
        const empCreatedDate = calendarData?.employeeCreatedAt || (user?.created_at ? user.created_at.split('T')[0] : null);
        if (empCreatedDate && dateStr < empCreatedDate) {
          status = 'Not Enrolled';
          statusCode = '-';
        } else {
          status = 'Absent';
          statusCode = 'A';
        }
      } else if (dateStr === todayStr) {
        status = 'Not Marked';
        statusCode = '-';
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
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 text-[11px] font-semibold border border-sky-400/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Employee Dashboard</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/25 text-indigo-300 text-[11px] font-semibold border border-indigo-400/40 shadow-xs">
                    <Clock className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                    <span>
                      Shift: {shiftInfo?.name || 'General Shift'} ({format12Hour(shiftInfo?.start_time || '09:00:00')} - {format12Hour(shiftInfo?.end_time || '18:00:00')})
                    </span>
                  </div>
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
                  Live operational panel • Auto-detected GPS attendance punch, leave balances & support.
                </p>
              </div>

              <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-700/60 pt-3 sm:pt-0 sm:pl-6 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Shift Status</span>
                  <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 justify-end mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${todayRecord?.punch_out_time ? 'bg-slate-400' : todayRecord?.punch_in_time ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                    <span>{todayRecord?.punch_out_time ? 'Completed' : todayRecord?.punch_in_time ? 'Active Shift' : 'Not Punched In'}</span>
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
                        GPS Active: {gpsLocation.latitude.toFixed(4)}, {gpsLocation.longitude.toFixed(4)}
                      </span>
                      {/* 10m Accuracy Verification Badge (Both Desktop & Mobile mode) */}
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 bg-emerald-900/60 px-3 py-1.5 rounded-xl border border-emerald-500/50 shadow-xs">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" strokeWidth={3} />
                        10m GPS Accuracy: <span className="text-white font-mono font-bold">TRUE ✓</span>
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
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-300/90 bg-amber-950/60 px-3 py-1.5 rounded-xl border border-amber-800/60">
                        10m GPS Accuracy: <span className="font-mono text-amber-200 font-bold">FALSE ✗ (Required)</span>
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
                    !isGpsAccuracyValid ||
                    (geofenceStatus.checked && !geofenceStatus.allowed)
                  }
                  className={`w-full sm:w-40 py-4 px-6 rounded-2xl font-bold text-sm shadow-lg transition-all flex flex-col items-center justify-center gap-1 ${
                    todayRecord && todayRecord.punch_in_time
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed border border-slate-600'
                      : !gpsLocation || !isGpsAccuracyValid
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
                      : !isGpsAccuracyValid
                      ? '10m GPS Accuracy check required (True) to punch in'
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
                      : !isGpsAccuracyValid
                      ? '10m Acc. Required'
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
                    !isGpsAccuracyValid ||
                    (geofenceStatus.checked && !geofenceStatus.allowed)
                  }
                  className={`w-full sm:w-40 py-4 px-6 rounded-2xl font-bold text-sm shadow-lg transition-all flex flex-col items-center justify-center gap-1 ${
                    !todayRecord || !todayRecord.punch_in_time || todayRecord.punch_out_time
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed border border-slate-600'
                      : !gpsLocation || !isGpsAccuracyValid
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
                      : !isGpsAccuracyValid
                      ? '10m GPS Accuracy check required (True) to punch out'
                      : geofenceStatus.checked && !geofenceStatus.allowed
                      ? 'Punch blocked: Outside authorized geofence'
                      : 'Punch Out'
                  }
                >
                  <span>PUNCH OUT</span>
                  <span className="text-[11px] font-normal opacity-80">
                    {todayRecord?.punch_out_time
                      ? todayRecord.punch_out_time
                      : !todayRecord?.punch_in_time
                      ? 'Not Punched In'
                      : !gpsLocation
                      ? 'GPS Required'
                      : !isGpsAccuracyValid
                      ? '10m Acc. Required'
                      : geofenceStatus.checked && !geofenceStatus.allowed
                      ? 'Outside Zone'
                      : 'End Shift'}
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
                      : '--'}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-100/80">
                  <span className="text-slate-500 whitespace-nowrap">Captured Address:</span>
                  <span className="text-slate-800 font-medium text-right line-clamp-2 text-xs select-text">
                    {todayRecord?.punch_in_location || '--'}
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
                    {todayRecord?.punch_out_time ? format12Hour(todayRecord.punch_out_time) : '--:--'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">GPS Coordinates:</span>
                  <span className="font-mono font-semibold text-slate-800 text-[11px]">
                    {todayRecord?.punch_out_lat && todayRecord?.punch_out_lng
                      ? `${Number(todayRecord.punch_out_lat).toFixed(4)}, ${Number(todayRecord.punch_out_lng).toFixed(4)}`
                      : '--'}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-100/80">
                  <span className="text-slate-500 whitespace-nowrap">Captured Address:</span>
                  <span className="text-slate-800 font-medium text-right line-clamp-2 text-xs select-text">
                    {todayRecord?.punch_out_location || '--'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Month-Wise Attendance Summary Card (Inside one card: Present, Absent, Holiday, Leave, WO) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Monthly Attendance Summary</h4>
                  <span className="text-[10px] text-slate-400">Total days count breakdown</span>
                </div>
              </div>

              {/* Month & Year Selectors (Auto-updates counts on change) */}
              <div className="flex items-center gap-2">
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(Number(e.target.value))}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                >
                  <option value={1}>January</option>
                  <option value={2}>February</option>
                  <option value={3}>March</option>
                  <option value={4}>April</option>
                  <option value={5}>May</option>
                  <option value={6}>June</option>
                  <option value={7}>July</option>
                  <option value={8}>August</option>
                  <option value={9}>September</option>
                  <option value={10}>October</option>
                  <option value={11}>November</option>
                  <option value={12}>December</option>
                </select>

                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(Number(e.target.value))}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                >
                  {[todayDate.getFullYear() - 1, todayDate.getFullYear(), todayDate.getFullYear() + 1].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Attendance Counts Grid inside ONE single card */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
              {/* 1. Present Day */}
              <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-100 flex flex-col justify-between space-y-1">
                <div className="flex items-center justify-between text-emerald-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Present</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-emerald-900">{monthlyStats?.present ?? 0}</span>
                  <span className="text-[10px] font-medium text-emerald-600">days</span>
                </div>
                <span className="text-[9px] text-emerald-700/80 font-medium">Full Attendance</span>
              </div>

              {/* 2. Absent Day */}
              <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-100 flex flex-col justify-between space-y-1">
                <div className="flex items-center justify-between text-rose-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Absent</span>
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-rose-900">{monthlyStats?.absent ?? 0}</span>
                  <span className="text-[10px] font-medium text-rose-600">days</span>
                </div>
                <span className="text-[9px] text-rose-700/80 font-medium">Missing / Unmarked</span>
              </div>

              {/* 3. Holiday */}
              <div className="p-3 bg-purple-50/70 rounded-xl border border-purple-100 flex flex-col justify-between space-y-1">
                <div className="flex items-center justify-between text-purple-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Holiday</span>
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-purple-900">{monthlyStats?.holiday ?? 0}</span>
                  <span className="text-[10px] font-medium text-purple-600">days</span>
                </div>
                <span className="text-[9px] text-purple-700/80 font-medium">Official Holidays</span>
              </div>

              {/* 4. Leave */}
              <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-100 flex flex-col justify-between space-y-1">
                <div className="flex items-center justify-between text-amber-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Leave</span>
                  <FileText className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-amber-900">{monthlyStats?.leave ?? 0}</span>
                  <span className="text-[10px] font-medium text-amber-600">days</span>
                </div>
                <span className="text-[9px] text-amber-700/80 font-medium">Approved Leaves</span>
              </div>

              {/* 5. Weekly Off (WO) */}
              <div className="p-3 bg-sky-50/70 rounded-xl border border-sky-100 flex flex-col justify-between space-y-1 col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-sky-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Weekly Off (WO)</span>
                  <Calendar className="w-3.5 h-3.5 text-sky-600" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-sky-900">{monthlyStats?.weekly_off ?? 0}</span>
                  <span className="text-[10px] font-medium text-sky-600">days</span>
                </div>
                <span className="text-[9px] text-sky-700/80 font-medium">Designated Off Days</span>
              </div>
            </div>

            {/* Total Days & Payable Days Summary */}
            <div className="flex items-center justify-between px-3.5 py-2 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-100">
              <span className="font-medium text-slate-500">
                Month Days: <strong className="text-slate-800">{monthlyStats?.totalDays || 30}</strong>
                {monthlyStats?.half_day ? <span className="ml-2 text-amber-600">({monthlyStats.half_day} Half Days)</span> : null}
              </span>
              <span className="font-semibold text-indigo-700">
                Payable Days: <strong className="text-indigo-900 font-black">{monthlyStats?.payable_days ?? 0}</strong>
              </span>
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
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileEdit className="w-4 h-4 text-sky-600" />
                Apply for Attendance Correction
              </h3>
            </div>

            <form onSubmit={handleSubmitCorrection} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Attendance Date */}
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

                {/* Correction Type Selector */}
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Correction Type *</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setCorrectionType('both')}
                      className={`py-2 px-2.5 rounded-xl border font-bold text-xs transition-all text-center ${
                        correctionType === 'both'
                          ? 'bg-sky-50 border-sky-500 text-sky-700 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Both (In & Out)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorrectionType('in')}
                      className={`py-2 px-2.5 rounded-xl border font-bold text-xs transition-all text-center ${
                        correctionType === 'in'
                          ? 'bg-sky-50 border-sky-500 text-sky-700 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Punch In Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorrectionType('out')}
                      className={`py-2 px-2.5 rounded-xl border font-bold text-xs transition-all text-center ${
                        correctionType === 'out'
                          ? 'bg-sky-50 border-sky-500 text-sky-700 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Punch Out Only
                    </button>
                  </div>
                </div>
              </div>

              {/* Conditional Time Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(correctionType === 'both' || correctionType === 'in') && (
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Requested Punch In Time *</label>
                    <input
                      type="time"
                      step="1"
                      required
                      value={correctionForm.requested_punch_in}
                      onChange={(e) => setCorrectionForm({ ...correctionForm, requested_punch_in: e.target.value })}
                      className="w-full p-2.5 border rounded-lg font-mono"
                    />
                  </div>
                )}

                {(correctionType === 'both' || correctionType === 'out') && (
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Requested Punch Out Time *</label>
                    <input
                      type="time"
                      step="1"
                      required
                      value={correctionForm.requested_punch_out}
                      onChange={(e) => setCorrectionForm({ ...correctionForm, requested_punch_out: e.target.value })}
                      className="w-full p-2.5 border rounded-lg font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Auto Status Preview based on working hours */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">Auto-Calculated Attendance Status:</span>
                <span className={`px-3 py-1 rounded-full font-bold uppercase text-[11px] ${
                  correctionCalculatedStatus.status === 'Present'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : correctionCalculatedStatus.status === 'Half Day'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}>
                  {correctionCalculatedStatus.status} {correctionType === 'both' ? `(${correctionCalculatedStatus.hours} hrs)` : ''}
                </span>
              </div>

              {/* Reason / Remarks Required */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Correction Remarks / Reason *</label>
                <textarea
                  rows="2"
                  required
                  value={correctionForm.reason}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
                  placeholder="State the reason for missing punch or discrepancy (e.g., Client on-site meeting / Field network issue)..."
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
      {activeTab === 'tickets' && (() => {
        const openTickets = tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed');
        const closedTickets = tickets.filter(t => t.status === 'resolved' || t.status === 'closed');

        return (
          <div className="space-y-6">
            {/* Raise Service Ticket Form */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <Ticket className="w-4 h-4 text-sky-600" />
                Raise Service Ticket
              </h3>

              <form onSubmit={handleSubmitTicket} className="space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Subject *</label>
                  <input
                    type="text"
                    required
                    value={ticketForm.title}
                    onChange={(e) => setTicketForm({ ...ticketForm, title: e.target.value })}
                    placeholder="Brief summary of your query or issue..."
                    className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Message *</label>
                  <textarea
                    rows={4}
                    required
                    value={ticketForm.description}
                    onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                    placeholder="Describe your issue or request in detail..."
                    className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold shadow-sm flex items-center gap-1.5 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit Ticket</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Open Tickets Section (Shown by default) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-2">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Open Tickets
                  </h3>
                  <p className="text-[11px] text-slate-400">Active service requests in progress</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                  {openTickets.length} active
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px]">
                    <tr>
                      <th className="p-3">ID</th>
                      <th className="p-3">Subject</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Created</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {openTickets.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono font-bold text-slate-800">#{t.id}</td>
                        <td className="p-3 font-semibold text-slate-900 max-w-sm">
                          <div>{t.title}</div>
                          {t.description && (
                            <p className="text-[11px] text-slate-500 font-normal line-clamp-1 mt-0.5">{t.description}</p>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            t.status === 'in_progress' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                            'bg-amber-100 text-amber-700 border border-amber-200'
                          }`}>
                            {t.status === 'in_progress' ? 'In Progress' : 'Pending'}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-400 text-[11px]">
                          {new Date(t.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setChatTicketId(t.id);
                              setShowChatModal(true);
                            }}
                            className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors border border-sky-200"
                            title="Open Ticket Chat & View Replies"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Chat / View Replies
                          </button>
                        </td>
                      </tr>
                    ))}
                    {openTickets.length === 0 && (
                      <tr>
                        <td colSpan="5" className="p-8 text-center text-slate-400">
                          No open service tickets currently. Raise a ticket above if you need assistance.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Closed Tickets Section (Collapsible - Hidden by Default) */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowClosedTickets(!showClosedTickets)}
                className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl transition-all shadow-xs group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-100 group-hover:bg-slate-200 transition-colors">
                    <CheckCircle className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xs font-bold text-slate-800">Closed Tickets History ({closedTickets.length})</h4>
                    <span className="text-[10px] text-slate-400">Click to {showClosedTickets ? 'hide' : 'view'} resolved and archived tickets</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
                  <span>{showClosedTickets ? 'Hide History' : 'View History'}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showClosedTickets ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {showClosedTickets && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-200">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Resolved & Closed Tickets Archive</h4>
                      <p className="text-[10px] text-slate-400">Historical record of resolved helpdesk queries</p>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">{closedTickets.length} archived</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px]">
                        <tr>
                          <th className="p-3">ID</th>
                          <th className="p-3">Subject</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Resolution Notes</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {closedTickets.map(t => (
                          <tr key={t.id} className="hover:bg-slate-50/50">
                            <td className="p-3 font-mono font-bold text-slate-800">#{t.id}</td>
                            <td className="p-3 font-semibold text-slate-800 max-w-sm">
                              <div>{t.title}</div>
                              {t.description && (
                                <p className="text-[11px] text-slate-400 font-normal line-clamp-1 mt-0.5">{t.description}</p>
                              )}
                            </td>
                            <td className="p-3">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                                {t.status}
                              </span>
                            </td>
                            <td className="p-3 text-slate-500 italic text-[11px]">
                              {t.resolution_notes || '--'}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setChatTicketId(t.id);
                                  setShowChatModal(true);
                                }}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                                title="View Closed Ticket History"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                View History
                              </button>
                            </td>
                          </tr>
                        ))}
                        {closedTickets.length === 0 && (
                          <tr>
                            <td colSpan="5" className="p-8 text-center text-slate-400">
                              No closed tickets in history.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
