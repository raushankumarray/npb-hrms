import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Clock, Plus, Edit3, Trash2, Users, Search, Filter,
  CheckCircle2, AlertCircle, RefreshCw, Sparkles, Check, X,
  CalendarDays, Tag, ShieldCheck, ArrowRight
} from 'lucide-react';
import { apiRequest } from '../api';

const ALL_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function HolidaysWeeklyOffView({ company, role = 'company_admin' }) {
  const [subTab, setSubTab] = useState('holidays'); // 'holidays' | 'weekly_off'
  const [holidays, setHolidays] = useState([]);
  const [weeklyOffs, setWeeklyOffs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Holiday Modal State (Add / Edit)
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [editingHolidayId, setEditingHolidayId] = useState(null);
  const [holidayForm, setHolidayForm] = useState({
    name: '',
    holiday_date: new Date().toISOString().split('T')[0],
    is_optional: 0,
    applies_to: 'all'
  });
  const [holidaySubmitting, setHolidaySubmitting] = useState(false);

  // Master Weekly Off Modal State
  const [showMasterWeeklyOffModal, setShowMasterWeeklyOffModal] = useState(false);
  const [masterOffDays, setMasterOffDays] = useState(['Sunday']);
  const [masterWeeklyOffSubmitting, setMasterWeeklyOffSubmitting] = useState(false);

  // Employee Weekly Off Assignment State
  const [selectedEmpIds, setSelectedEmpIds] = useState([]);
  const [customOffDays, setCustomOffDays] = useState(['Sunday']);
  const [applyingWeeklyOff, setApplyingWeeklyOff] = useState(false);

  // Filters for Workforce Weekly Off table
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');

  // Single Employee Custom Weekly Off Modal
  const [quickEmp, setQuickEmp] = useState(null);
  const [quickEmpOffDays, setQuickEmpOffDays] = useState(['Sunday']);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [holRes, shiftRes] = await Promise.all([
        apiRequest('/holidays'),
        apiRequest('/shifts')
      ]);
      setHolidays(holRes.holidays || []);
      setWeeklyOffs(shiftRes.weeklyOffs || []);
      setEmployees(shiftRes.employees || []);
    } catch (err) {
      setError(err.message || 'Failed to load holidays and weekly off data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Find the active Master Weekly Off
  const masterWeeklyOff = useMemo(() => {
    return weeklyOffs.find(w => w.is_default === 1) || weeklyOffs[0];
  }, [weeklyOffs]);

  const masterOffDaysParsed = useMemo(() => {
    if (!masterWeeklyOff?.off_days_json) return ['Sunday'];
    try {
      return JSON.parse(masterWeeklyOff.off_days_json);
    } catch (e) {
      return ['Sunday'];
    }
  }, [masterWeeklyOff]);

  // Unique departments and cities for filters
  const departments = useMemo(() => {
    const set = new Set(employees.map(e => e.department).filter(Boolean));
    return Array.from(set);
  }, [employees]);

  const cities = useMemo(() => {
    const set = new Set(employees.map(e => e.city).filter(Boolean));
    return Array.from(set);
  }, [employees]);

  // Filtered employees for weekly off table
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          emp.full_name?.toLowerCase().includes(q) ||
          emp.employee_id?.toLowerCase().includes(q) ||
          emp.department?.toLowerCase().includes(q) ||
          emp.city?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (roleFilter === 'admin_reports') {
        if (!emp.reports_to_admin) return false;
      } else if (roleFilter !== 'all') {
        if (emp.role_name !== roleFilter) return false;
      }
      if (departmentFilter !== 'all' && emp.department !== departmentFilter) return false;
      if (cityFilter !== 'all' && emp.city !== cityFilter) return false;
      return true;
    });
  }, [employees, searchQuery, roleFilter, departmentFilter, cityFilter]);

  // Holiday Add / Edit
  const openAddHoliday = () => {
    setEditingHolidayId(null);
    setHolidayForm({
      name: '',
      holiday_date: new Date().toISOString().split('T')[0],
      is_optional: 0,
      applies_to: 'all'
    });
    setShowHolidayModal(true);
  };

  const openEditHoliday = (h) => {
    setEditingHolidayId(h.id);
    setHolidayForm({
      name: h.name,
      holiday_date: h.holiday_date,
      is_optional: h.is_optional ? 1 : 0,
      applies_to: h.applies_to || 'all'
    });
    setShowHolidayModal(true);
  };

  const handleSaveHoliday = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setHolidaySubmitting(true);

    try {
      if (editingHolidayId) {
        await apiRequest(`/holidays/${editingHolidayId}`, {
          method: 'PUT',
          body: holidayForm
        });
        setSuccess(`Holiday "${holidayForm.name}" updated successfully.`);
      } else {
        await apiRequest('/holidays', {
          method: 'POST',
          body: holidayForm
        });
        setSuccess(`Holiday "${holidayForm.name}" added and reflected across company calendars.`);
      }
      setShowHolidayModal(false);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to save holiday.');
    } finally {
      setHolidaySubmitting(false);
    }
  };

  const handleDeleteHoliday = async (h) => {
    if (!window.confirm(`Delete holiday "${h.name}"?`)) return;
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/holidays/${h.id}`, { method: 'DELETE' });
      setSuccess(`Holiday "${h.name}" deleted.`);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to delete holiday.');
    }
  };

  // Open Master Weekly Off Modal
  const openMasterWeeklyOffModal = () => {
    setMasterOffDays(masterOffDaysParsed);
    setShowMasterWeeklyOffModal(true);
  };

  // Save Master Weekly Off
  const handleSaveMasterWeeklyOff = async (e) => {
    e.preventDefault();
    if (masterOffDays.length === 0) {
      setError('Please select at least one weekly off day for the Master setting.');
      return;
    }

    setMasterWeeklyOffSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiRequest('/shifts/employee-weekly-off', {
        method: 'POST',
        body: {
          employee_ids: [],
          off_days: masterOffDays,
          is_master: true
        }
      });
      setSuccess(res.message || 'Master weekly off updated and applied company-wide.');
      setShowMasterWeeklyOffModal(false);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to update Master weekly off.');
    } finally {
      setMasterWeeklyOffSubmitting(false);
    }
  };

  // Master / Bulk Custom Weekly Off to Selected Employees
  const handleApplyCustomWeeklyOff = async () => {
    if (selectedEmpIds.length === 0) {
      setError('Please select at least one employee to assign custom weekly off.');
      return;
    }
    if (customOffDays.length === 0) {
      setError('Please select at least one off day.');
      return;
    }

    setApplyingWeeklyOff(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiRequest('/shifts/employee-weekly-off', {
        method: 'POST',
        body: {
          employee_ids: selectedEmpIds,
          off_days: customOffDays,
          is_master: false
        }
      });
      setSuccess(res.message || 'Weekly off updated for selected employees.');
      setSelectedEmpIds([]);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to update weekly off.');
    } finally {
      setApplyingWeeklyOff(false);
    }
  };

  // Single Employee Quick Weekly Off Change
  const handleSaveQuickEmpWeeklyOff = async (e) => {
    e.preventDefault();
    if (!quickEmp) return;
    if (quickEmpOffDays.length === 0) {
      setError('Please select at least one off day.');
      return;
    }

    setApplyingWeeklyOff(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiRequest('/shifts/employee-weekly-off', {
        method: 'POST',
        body: {
          employee_ids: [quickEmp.id],
          off_days: quickEmpOffDays,
          is_master: false
        }
      });
      setSuccess(`Weekly off for ${quickEmp.full_name} updated to [${quickEmpOffDays.join(', ')}].`);
      setQuickEmp(null);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to update weekly off.');
    } finally {
      setApplyingWeeklyOff(false);
    }
  };

  const handleToggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedEmpIds(filteredEmployees.map(emp => emp.id));
    } else {
      setSelectedEmpIds([]);
    }
  };

  const isAllSelected = filteredEmployees.length > 0 && filteredEmployees.every(emp => selectedEmpIds.includes(emp.id));

  return (
    <div className="space-y-6">
      {/* Top Header & Tab Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-sky-600" />
            Holidays & Weekly Off Management
          </h2>
          <p className="text-xs text-slate-500">
            Configure Master and Optional company holidays, and manage company-wide master weekly off with individual employee overrides
          </p>
        </div>

        <div className="flex items-center gap-2">
          {subTab === 'holidays' ? (
            <button
              type="button"
              onClick={openAddHoliday}
              className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all hover:scale-105 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Add Holiday
            </button>
          ) : (
            <button
              type="button"
              onClick={openMasterWeeklyOffModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all hover:scale-105 active:scale-95"
            >
              <Edit3 className="w-4 h-4" />
              Change Master Weekly Off
            </button>
          )}

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors shadow-sm"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="flex border-b border-slate-200 gap-6 text-xs font-bold">
        <button
          type="button"
          onClick={() => setSubTab('holidays')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-all ${
            subTab === 'holidays'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          <span>Company Holidays ({holidays.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('weekly_off')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-all ${
            subTab === 'weekly_off'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Weekly Off Settings (Master & Custom)</span>
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2.5 shadow-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2.5 shadow-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* SUB-TAB 1: HOLIDAYS MANAGEMENT (MASTER & OPTIONAL) */}
      {subTab === 'holidays' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Official Company Holiday Calendar</h3>
              <p className="text-xs text-slate-500">
                Master mandatory holidays automatically update attendance records; optional holidays provide flexible staff entitlements
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">
                Mandatory: {holidays.filter(h => !h.is_optional).length}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">
                Optional: {holidays.filter(h => h.is_optional).length}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-y border-slate-200">
                <tr>
                  <th className="p-3">Holiday Name</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Day of Week</th>
                  <th className="p-3">Classification</th>
                  <th className="p-3">Applies To</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holidays.map(h => {
                  const dayName = new Date(h.holiday_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
                  return (
                    <tr key={h.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 font-bold text-slate-900">{h.name}</td>
                      <td className="p-3 font-mono font-bold text-sky-600">{h.holiday_date}</td>
                      <td className="p-3 text-slate-600">{dayName}</td>
                      <td className="p-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          h.is_optional ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {h.is_optional ? 'OPTIONAL / RESTRICTED' : 'MANDATORY PUBLIC'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 capitalize">
                        {h.applies_to === 'all' ? 'All Company Employees' : 'Selected Groups'}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditHoliday(h)}
                            className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                            title="Edit Holiday"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteHoliday(h)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Holiday"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {holidays.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-400">
                      No holidays declared yet. Click "Add Holiday" above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: WEEKLY OFF MANAGEMENT (MASTER & INDIVIDUAL OVERRIDES) */}
      {subTab === 'weekly_off' && (
        <div className="space-y-6">
          {/* Master Weekly Off Highlight Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white shadow-xl border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center sm:text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 text-xs font-semibold border border-sky-500/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                Company Master Default Weekly Off
              </div>
              <h3 className="text-2xl font-black tracking-tight">
                {masterOffDaysParsed.join(' & ')}
              </h3>
              <p className="text-xs text-slate-300">
                This rule applies automatically to all company employees, unless a manual individual schedule is assigned.
              </p>
            </div>

            <button
              type="button"
              onClick={openMasterWeeklyOffModal}
              className="px-5 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-sky-900/40 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shrink-0"
            >
              <Edit3 className="w-4 h-4" />
              Update Master Setting
            </button>
          </div>

          {/* Workforce Weekly Off Table & Manual Customization Hub */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
            <div className="p-5 border-b border-slate-100 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-sky-600" />
                  Employee Weekly Off Management (Manual & Master)
                </h3>
                <p className="text-xs text-slate-500">
                  Select one or multiple employees to change their weekly off to any other day (e.g. Tuesday or Sunday), with automated employee notification
                </p>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1 text-xs">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Name or Code..."
                    className="w-full pl-8 pr-3 py-2 border rounded-xl bg-slate-50 focus:bg-white text-xs"
                  />
                </div>

                <div>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="w-full p-2 border rounded-xl bg-slate-50 text-xs"
                  >
                    <option value="all">All Roles</option>
                    <option value="employee">Employees Only</option>
                    <option value="manager">Managers Only</option>
                  </select>
                </div>

                <div>
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="w-full p-2 border rounded-xl bg-slate-50 text-xs"
                  >
                    <option value="all">All Departments</option>
                    {departments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                    className="w-full p-2 border rounded-xl bg-slate-50 text-xs"
                  >
                    <option value="all">All Cities</option>
                    {cities.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bulk Weekly Off Action Bar */}
              <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 rounded-xl flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-800">
                    Assign Custom Off Days ({selectedEmpIds.length} Selected):
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Pick one or more days to assign as the official weekly off for selected staff
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Days Selector Pills */}
                  <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-xl border border-purple-200">
                    {ALL_WEEKDAYS.map(day => {
                      const isChecked = customOffDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            if (isChecked) {
                              setCustomOffDays(customOffDays.filter(d => d !== day));
                            } else {
                              setCustomOffDays([...customOffDays, day]);
                            }
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            isChecked
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleApplyCustomWeeklyOff}
                    disabled={applyingWeeklyOff || selectedEmpIds.length === 0 || customOffDays.length === 0}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                  >
                    {applyingWeeklyOff ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>⚡ Apply Weekly Off ({selectedEmpIds.length})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Workforce Weekly Off Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-y border-slate-200">
                  <tr>
                    <th className="p-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        className="rounded text-purple-600 focus:ring-purple-500"
                      />
                    </th>
                    <th className="p-3">Personnel</th>
                    <th className="p-3">Role & Dept</th>
                    <th className="p-3">City</th>
                    <th className="p-3">Active Weekly Off</th>
                    <th className="p-3">Rule Type</th>
                    <th className="p-3 text-right">Manual Override</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.map(emp => {
                    const isSelected = selectedEmpIds.includes(emp.id);
                    let offDaysArr = masterOffDaysParsed;
                    let isCustom = false;
                    if (emp.weekly_off_days) {
                      try {
                        offDaysArr = JSON.parse(emp.weekly_off_days);
                      } catch (e) {
                        if (Array.isArray(emp.weekly_off_days)) offDaysArr = emp.weekly_off_days;
                      }
                    }
                    if (emp.weekly_off_id && emp.weekly_off_is_default === 0) {
                      isCustom = true;
                    }

                    return (
                      <tr key={emp.id} className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-purple-50/40' : ''}`}>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEmpIds([...selectedEmpIds, emp.id]);
                              } else {
                                setSelectedEmpIds(selectedEmpIds.filter(id => id !== emp.id));
                              }
                            }}
                            className="rounded text-purple-600 focus:ring-purple-500"
                          />
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{emp.full_name}</div>
                          <div className="text-[10px] font-mono text-slate-400">{emp.employee_id}</div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                              {emp.role_name}
                            </span>
                            <span className="text-slate-600 font-medium">{emp.department || 'Operations'}</span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-600">{emp.city || '—'}</td>
                        <td className="p-3">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-purple-50 text-purple-800 border border-purple-200/70">
                            <Calendar className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                            <span>{offDaysArr.join(', ')}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isCustom ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {isCustom ? 'Custom Individual' : 'Company Master'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setQuickEmp(emp);
                              setQuickEmpOffDays(offDaysArr);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors border border-purple-200/60 inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            Change Off Days
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredEmployees.length === 0 && (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-slate-400">
                        No workforce records match filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT HOLIDAY */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-sky-600" />
                  {editingHolidayId ? 'Edit Official Holiday' : 'Add Official Holiday'}
                </h3>
                <p className="text-xs text-slate-500">Specify holiday name, date, and mandatory vs optional status</p>
              </div>
              <button
                type="button"
                onClick={() => setShowHolidayModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveHoliday} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Holiday Name *</label>
                <input
                  type="text"
                  required
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                  placeholder="e.g. Republic Day, Diwali, Eid, Christmas"
                  className="w-full p-2.5 border rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Holiday Date *</label>
                <input
                  type="date"
                  required
                  value={holidayForm.holiday_date}
                  onChange={(e) => setHolidayForm({ ...holidayForm, holiday_date: e.target.value })}
                  className="w-full p-2.5 border rounded-xl font-mono text-sm"
                />
              </div>

              {/* Classification Toggle */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Classification *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setHolidayForm({ ...holidayForm, is_optional: 0 })}
                    className={`py-2.5 px-3 text-xs font-bold rounded-xl border transition-all text-left flex items-center gap-2 ${
                      holidayForm.is_optional === 0
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-1 ring-emerald-500'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Check className={`w-4 h-4 ${holidayForm.is_optional === 0 ? 'text-emerald-600' : 'opacity-0'}`} />
                    <div>
                      <span className="block font-bold">Mandatory Public</span>
                      <span className="text-[10px] text-slate-400 font-normal">Applies to all staff</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHolidayForm({ ...holidayForm, is_optional: 1 })}
                    className={`py-2.5 px-3 text-xs font-bold rounded-xl border transition-all text-left flex items-center gap-2 ${
                      holidayForm.is_optional === 1
                        ? 'bg-amber-50 border-amber-500 text-amber-800 ring-1 ring-amber-500'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Check className={`w-4 h-4 ${holidayForm.is_optional === 1 ? 'text-amber-600' : 'opacity-0'}`} />
                    <div>
                      <span className="block font-bold">Optional / Restricted</span>
                      <span className="text-[10px] text-slate-400 font-normal">Staff choice list</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowHolidayModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={holidaySubmitting}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  {holidaySubmitting ? 'Saving...' : editingHolidayId ? 'Update Holiday' : 'Add Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MASTER WEEKLY OFF CONFIGURATION */}
      {showMasterWeeklyOffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-purple-600" />
                  Configure Company Master Weekly Off
                </h3>
                <p className="text-xs text-slate-500">Auto-applies to all employees who do not have custom overrides</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMasterWeeklyOffModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMasterWeeklyOff} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-2">Select Master Off Days *</label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_WEEKDAYS.map(day => {
                    const isChecked = masterOffDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          if (isChecked) {
                            setMasterOffDays(masterOffDays.filter(d => d !== day));
                          } else {
                            setMasterOffDays([...masterOffDays, day]);
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-left font-bold transition-all flex items-center justify-between ${
                          isChecked
                            ? 'bg-purple-50 border-purple-500 text-purple-800 ring-1 ring-purple-500'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span>{day}</span>
                        {isChecked && <Check className="w-4 h-4 text-purple-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 bg-purple-50 rounded-xl border border-purple-100 text-[11px] text-purple-900">
                ⚡ Updating this setting sets the new Master Default and updates all active workforce members across the company.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMasterWeeklyOffModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={masterWeeklyOffSubmitting}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  {masterWeeklyOffSubmitting ? 'Applying...' : 'Apply Master Setting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SINGLE EMPLOYEE CUSTOM WEEKLY OFF */}
      {quickEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Custom Weekly Off: {quickEmp.full_name}
                </h3>
                <p className="text-xs text-slate-500">ID: {quickEmp.employee_id} • {quickEmp.department}</p>
              </div>
              <button
                type="button"
                onClick={() => setQuickEmp(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickEmpWeeklyOff} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-2">Select Off Days for this Employee *</label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_WEEKDAYS.map(day => {
                    const isChecked = quickEmpOffDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          if (isChecked) {
                            setQuickEmpOffDays(quickEmpOffDays.filter(d => d !== day));
                          } else {
                            setQuickEmpOffDays([...quickEmpOffDays, day]);
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-left font-bold transition-all flex items-center justify-between ${
                          isChecked
                            ? 'bg-purple-50 border-purple-500 text-purple-800 ring-1 ring-purple-500'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span>{day}</span>
                        {isChecked && <Check className="w-4 h-4 text-purple-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 bg-sky-50 rounded-xl border border-sky-100 text-[11px] text-sky-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
                <span>An instant notification will be delivered to this employee informing them of their updated weekly off.</span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQuickEmp(null)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={applyingWeeklyOff}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  {applyingWeeklyOff ? 'Updating...' : 'Confirm Weekly Off'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
