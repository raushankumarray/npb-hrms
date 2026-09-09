import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock,
  CheckCircle, AlertCircle, Sparkles, User, RefreshCw, X, Filter
} from 'lucide-react';
import { apiRequest } from '../api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function UnifiedCalendar({ companyId, employeeId = null, role = 'employee' }) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1); // 1-12
  const [calendarData, setCalendarData] = useState({
    holidays: [],
    offDays: ['Sunday'],
    isCustomWeeklyOff: false,
    weeklyOffName: 'Weekly Off',
    records: []
  });
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [filterEmpId, setFilterEmpId] = useState(employeeId);
  const [employeesList, setEmployeesList] = useState([]);

  useEffect(() => {
    if (employeeId) {
      setFilterEmpId(employeeId);
    }
  }, [employeeId]);

  const fetchCalendar = async () => {
    setLoading(true);
    try {
      let endpoint = `/attendance/calendar?year=${currentYear}&month=${currentMonth}`;
      if (filterEmpId) {
        endpoint += `&employee_id=${filterEmpId}`;
      }
      const data = await apiRequest(endpoint);
      setCalendarData({
        holidays: data.holidays || [],
        offDays: data.offDays || ['Sunday'],
        isCustomWeeklyOff: !!data.isCustomWeeklyOff,
        weeklyOffName: data.weeklyOffName || (data.isCustomWeeklyOff ? 'Custom Assigned Weekly Off' : 'Company Scheduled Weekly Off'),
        records: data.records || []
      });
    } catch (err) {
      console.error('Failed to load calendar data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar();
  }, [currentYear, currentMonth, filterEmpId]);

  useEffect(() => {
    // If Admin/HR/Manager, load employee list for filtering
    if (role !== 'employee') {
      apiRequest('/employees?limit=100').then(res => {
        setEmployeesList(res.employees || []);
      }).catch(() => {});
    }
  }, [role]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const handleToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth() + 1);
  };

  // Generate day cells
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

  const daysGrid = [];
  // Empty slots before 1st of month
  for (let i = 0; i < firstDayOfWeek; i++) {
    daysGrid.push(null);
  }
  // Days 1..daysInMonth
  for (let d = 1; d <= daysInMonth; d++) {
    daysGrid.push(d);
  }

  // Format date key: YYYY-MM-DD
  const getDateKey = (day) => {
    const mStr = String(currentMonth).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    return `${currentYear}-${mStr}-${dStr}`;
  };

  // Check if date is weekly off
  const isWeeklyOff = (day) => {
    const dayOfWeek = new Date(currentYear, currentMonth - 1, day).getDay();
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
    return calendarData.offDays.includes(dayName);
  };

  // Get holidays for date
  const getHolidaysForDay = (day) => {
    const dateKey = getDateKey(day);
    return calendarData.holidays.filter(h => h.holiday_date === dateKey);
  };

  // Get attendance records for date
  const getRecordsForDay = (day) => {
    const dateKey = getDateKey(day);
    return calendarData.records.filter(r => r.date === dateKey);
  };

  const isCurrentToday = (day) => {
    return (
      day === today.getDate() &&
      currentMonth === (today.getMonth() + 1) &&
      currentYear === today.getFullYear()
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </h3>
            <p className="text-xs text-slate-500">Official Holidays, Weekly Offs & Attendance Records</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Employee Filter for Admin/HR/Manager */}
          {role !== 'employee' && employeesList.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={filterEmpId || ''}
                onChange={(e) => setFilterEmpId(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none"
              >
                <option value="">All Staff (Aggregate)</option>
                {employeesList.map(e => (
                  <option key={e.id} value={e.id}>{e.full_name} ({e.employee_id})</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleToday}
            className="px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors"
          >
            Today
          </button>

          <div className="flex items-center rounded-lg border border-slate-200 bg-white">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-l-lg"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="w-px h-4 bg-slate-200" />
            <button
              onClick={handleNextMonth}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-r-lg"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={fetchCalendar}
            disabled={loading}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 font-medium pt-1 pb-1">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-600 ring-2 ring-emerald-300 inline-block" />
          <span>Present (P)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500 ring-2 ring-amber-300 inline-block" />
          <span>Half Day (HD)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-rose-600 ring-2 ring-rose-300 inline-block" />
          <span>Absent (A)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-purple-600 ring-2 ring-purple-300 inline-block" />
          <span>Leave (L)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-orange-500 ring-2 ring-orange-300 inline-block" />
          <span>Holiday (HO)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-rose-100 border border-rose-400 inline-block" />
          <span>Weekly Off (WO)</span>
        </div>

        <div className="sm:ml-auto flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500">Official Weekly Off:</span>
          <div className="flex items-center gap-1">
            {calendarData.offDays.map(d => (
              <span key={d} className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                calendarData.isCustomWeeklyOff
                  ? 'bg-purple-100 text-purple-700 border border-purple-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}>
                {d}
              </span>
            ))}
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
              calendarData.isCustomWeeklyOff
                ? 'bg-purple-50 text-purple-600 border border-purple-200'
                : 'bg-slate-50 text-slate-500 border border-slate-200'
            }`}>
              {calendarData.isCustomWeeklyOff ? 'Custom Staff' : 'Master'}
            </span>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200">
        {/* Day of Week Headers */}
        {DAY_NAMES.map((name, i) => (
          <div
            key={name}
            className={`py-2 text-center text-xs font-bold ${
              i === 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'
            }`}
          >
            {name}
          </div>
        ))}

        {/* Day Cells */}
        {daysGrid.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} className="bg-slate-50/50 aspect-square sm:aspect-auto sm:min-h-[95px] rounded-md" />;
          }

          const dayHolidays = getHolidaysForDay(day);
          const dayRecords = getRecordsForDay(day);
          const weeklyOff = isWeeklyOff(day);
          const isToday = isCurrentToday(day);

          // Determine primary attendance status for this day (when employee view)
          const primaryRec = dayRecords[0];
          const hasRecord = !!primaryRec;
          const status = primaryRec?.status;

          // Color calculation for date circle & cell background
          let dateCircleStyle = 'text-slate-800 hover:bg-slate-100';
          let cellBgStyle = 'bg-white';

          if (role === 'employee' || filterEmpId) {
            if (status === 'Present') {
              dateCircleStyle = 'bg-emerald-600 text-white font-black shadow-sm ring-2 ring-emerald-300';
              cellBgStyle = 'bg-emerald-50/40 border-emerald-200/80';
            } else if (status === 'Half Day') {
              dateCircleStyle = 'bg-amber-500 text-white font-black shadow-sm ring-2 ring-amber-300';
              cellBgStyle = 'bg-amber-50/40 border-amber-200/80';
            } else if (status === 'Absent') {
              dateCircleStyle = 'bg-rose-600 text-white font-black shadow-sm ring-2 ring-rose-300';
              cellBgStyle = 'bg-rose-50/40 border-rose-200/80';
            } else if (status === 'Leave') {
              dateCircleStyle = 'bg-purple-600 text-white font-black shadow-sm ring-2 ring-purple-300';
              cellBgStyle = 'bg-purple-50/40 border-purple-200/80';
            } else if (dayHolidays.length > 0) {
              dateCircleStyle = 'bg-orange-500 text-white font-black shadow-sm ring-2 ring-orange-300';
              cellBgStyle = 'bg-orange-50/40 border-orange-200/80';
            } else if (weeklyOff) {
              dateCircleStyle = 'bg-rose-100 text-rose-700 font-bold border border-rose-200';
              cellBgStyle = 'bg-slate-50/70 border-slate-200/80';
            } else if (isToday) {
              dateCircleStyle = 'bg-sky-600 text-white shadow-sm ring-2 ring-sky-300 font-bold';
              cellBgStyle = 'bg-sky-50/30';
            }
          } else {
            // Aggregate view
            if (dayHolidays.length > 0) {
              dateCircleStyle = 'bg-orange-500 text-white font-black shadow-sm';
              cellBgStyle = 'bg-orange-50/40 border-orange-200/80';
            } else if (weeklyOff) {
              dateCircleStyle = 'bg-rose-100 text-rose-700 font-bold';
              cellBgStyle = 'bg-slate-50/70 border-slate-200/80';
            } else if (isToday) {
              dateCircleStyle = 'bg-sky-600 text-white shadow-sm ring-2 ring-sky-300 font-bold';
              cellBgStyle = 'bg-sky-50/30';
            }
          }

          return (
            <div
              key={`day-${day}`}
              onClick={() => setSelectedDay({ day, dateKey: getDateKey(day), dayHolidays, dayRecords, weeklyOff })}
              className={`aspect-square sm:aspect-auto sm:min-h-[95px] p-1 sm:p-2 flex flex-col justify-between cursor-pointer hover:opacity-90 transition-all relative group border border-slate-100 rounded-md ${cellBgStyle} ${
                isToday && !status ? 'ring-2 ring-sky-500 ring-inset' : ''
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] sm:text-xs rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center transition-transform group-hover:scale-105 ${dateCircleStyle}`}
                  title={
                    status ? `Status: ${status}` :
                    dayHolidays.length ? `Holiday: ${dayHolidays[0].name}` :
                    weeklyOff ? 'Weekly Off' :
                    isToday ? 'Today' : `Day ${day}`
                  }
                >
                  {day}
                </span>

                {dayHolidays.length > 0 && (
                  <span className="hidden sm:inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 truncate max-w-[80px]" title={dayHolidays[0].name}>
                    {dayHolidays[0].name}
                  </span>
                )}
              </div>

              {/* Mobile View: Compact square status indicator */}
              <div className="sm:hidden flex items-center justify-center flex-1 my-0.5">
                {hasRecord ? (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                    status === 'Present' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                    status === 'Half Day' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                    status === 'Leave' ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                    'bg-rose-100 text-rose-800 border border-rose-300'
                  }`}>
                    {status === 'Present' ? 'P' : status === 'Half Day' ? 'HD' : status === 'Leave' ? 'L' : 'A'}
                  </span>
                ) : dayHolidays.length > 0 ? (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-300">
                    HO
                  </span>
                ) : weeklyOff ? (
                  <span className="text-[9px] font-black px-1 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                    WO
                  </span>
                ) : null}
              </div>

              {/* Desktop View: Full Day Content Badges */}
              <div className="hidden sm:block mt-1.5 space-y-1 flex-1">
                {weeklyOff && (
                  <span className="inline-block text-[10px] font-bold text-rose-700 bg-rose-100/90 px-1.5 py-0.5 rounded border border-rose-200/80">
                    Weekly Off
                  </span>
                )}

                {/* Individual Employee View */}
                {role === 'employee' || filterEmpId ? (
                  dayRecords.map(rec => (
                    <div
                      key={rec.id}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center justify-between shadow-xs ${
                        rec.status === 'Present'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : rec.status === 'Half Day'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : rec.status === 'Leave'
                          ? 'bg-purple-100 text-purple-900 border border-purple-300'
                          : 'bg-rose-100 text-rose-900 border border-rose-300'
                      }`}
                    >
                      <span className="truncate">{rec.status}</span>
                      {rec.punch_in_time && (
                        <span className="text-[9px] font-mono opacity-80">{rec.punch_in_time.slice(0, 5)}</span>
                      )}
                    </div>
                  ))
                ) : (
                  /* Aggregate Team View */
                  dayRecords.length > 0 && (
                    <div className="text-[10px] bg-sky-50 text-sky-800 font-semibold px-1.5 py-0.5 rounded border border-sky-100">
                      {dayRecords.length} Punched In
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Date Details Modal */}
      {selectedDay && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-base font-bold text-slate-900">
                  {selectedDay.dateKey}
                </h4>
                <p className="text-xs text-slate-500">Day Details & Attendance Log</p>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Holiday notice */}
            {selectedDay.dayHolidays.length > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                <span className="text-xs font-bold text-rose-800 uppercase tracking-wider block">Official Holiday</span>
                <p className="text-sm font-semibold text-rose-900 mt-0.5">
                  {selectedDay.dayHolidays.map(h => h.name).join(', ')}
                </p>
              </div>
            )}

            {/* Weekly off notice */}
            {selectedDay.weeklyOff && (
              <div className={`p-3 rounded-xl border ${
                calendarData.isCustomWeeklyOff
                  ? 'bg-purple-50 border-purple-200 text-purple-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <span className="text-xs font-bold block">
                  {calendarData.isCustomWeeklyOff ? 'Custom Individual Weekly Off' : 'Company Scheduled Master Weekly Off'}
                </span>
                <p className="text-[11px] mt-0.5 opacity-90">
                  {calendarData.isCustomWeeklyOff
                    ? `This day is officially assigned as custom weekly off for this staff member (${calendarData.offDays.join(', ')}).`
                    : `Official company-wide scheduled weekly off day (${calendarData.offDays.join(', ')}).`}
                </p>
              </div>
            )}

            {/* Records */}
            <div className="space-y-2">
              <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Attendance Records ({selectedDay.dayRecords.length})
              </h5>

              {selectedDay.dayRecords.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">No attendance punches logged for this date.</p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {selectedDay.dayRecords.map(rec => (
                    <div
                      key={rec.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{rec.employee_name || 'Staff Member'}</div>
                        <div className="text-[11px] text-slate-500">{rec.department} &bull; {rec.employee_code}</div>
                        <div className="text-[11px] text-slate-600 mt-1">
                          Punch: <span className="font-semibold text-slate-800">{rec.punch_in_time || '--:--'}</span> to <span className="font-semibold text-slate-800">{rec.punch_out_time || '--:--'}</span>
                          {rec.total_hours > 0 && ` (${rec.total_hours} hrs)`}
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${
                          rec.status === 'Present'
                            ? 'bg-emerald-100 text-emerald-800'
                            : rec.status === 'Half Day'
                            ? 'bg-amber-100 text-amber-800'
                            : rec.status === 'Leave'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {rec.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedDay(null)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
