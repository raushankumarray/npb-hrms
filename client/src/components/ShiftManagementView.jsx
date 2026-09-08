import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock, Plus, Edit3, Trash2, Users, Search, Filter,
  CheckCircle2, AlertCircle, RefreshCw, Calendar, Sparkles,
  ChevronRight, ArrowRight, ShieldCheck, UserCheck, Building2,
  Check, X
} from 'lucide-react';
import { apiRequest } from '../api';

export default function ShiftManagementView({ company, role = 'company_admin' }) {
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Shift Modal (Add / Edit)
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [shiftForm, setShiftForm] = useState({
    name: '',
    start_time: '09:00',
    end_time: '18:00',
    grace_time_mins: 15,
    working_hours: 8.0,
    break_time_mins: 60,
    is_rotational: false
  });
  const [shiftSubmitting, setShiftSubmitting] = useState(false);

  // Workforce Assignment Hub State
  const [selectedEmpIds, setSelectedEmpIds] = useState([]);
  const [targetShiftId, setTargetShiftId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [assigningShift, setAssigningShift] = useState(false);

  // Filter & Search Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'employee' | 'manager' | 'hr' | 'admin_reports'
  const [assignmentFilter, setAssignmentFilter] = useState('all'); // 'all' | 'assigned' | 'unassigned'
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');

  // Single Employee Quick Assign Modal
  const [quickAssignEmp, setQuickAssignEmp] = useState(null);
  const [quickShiftId, setQuickShiftId] = useState('');
  const [quickEffectiveDate, setQuickEffectiveDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest('/shifts');
      setShifts(res.shifts || []);
      setEmployees(res.employees || []);
    } catch (err) {
      setError(err.message || 'Failed to load shifts and workforce data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Unique departments and cities for filters
  const departments = useMemo(() => {
    const set = new Set(employees.map(e => e.department).filter(Boolean));
    return Array.from(set);
  }, [employees]);

  const cities = useMemo(() => {
    const set = new Set(employees.map(e => e.city).filter(Boolean));
    return Array.from(set);
  }, [employees]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          emp.full_name?.toLowerCase().includes(q) ||
          emp.employee_id?.toLowerCase().includes(q) ||
          emp.department?.toLowerCase().includes(q) ||
          emp.city?.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // 2. Role Filter
      if (roleFilter === 'admin_reports') {
        if (!emp.reports_to_admin) return false;
      } else if (roleFilter !== 'all') {
        if (emp.role_name !== roleFilter) return false;
      }

      // 3. Assignment Filter
      if (assignmentFilter === 'assigned' && !emp.shift_id) return false;
      if (assignmentFilter === 'unassigned' && emp.shift_id) return false;

      // 4. Department Filter
      if (departmentFilter !== 'all' && emp.department !== departmentFilter) return false;

      // 5. City Filter
      if (cityFilter !== 'all' && emp.city !== cityFilter) return false;

      return true;
    });
  }, [employees, searchQuery, roleFilter, assignmentFilter, departmentFilter, cityFilter]);

  // Open modal to add shift
  const openAddShift = () => {
    setEditingShiftId(null);
    setShiftForm({
      name: '',
      start_time: '09:00',
      end_time: '18:00',
      grace_time_mins: 15,
      working_hours: 8.0,
      break_time_mins: 60,
      is_rotational: false
    });
    setShowShiftModal(true);
  };

  // Open modal to edit shift
  const openEditShift = (s) => {
    setEditingShiftId(s.id);
    setShiftForm({
      name: s.name,
      start_time: s.start_time,
      end_time: s.end_time,
      grace_time_mins: s.grace_time_mins ?? 15,
      working_hours: s.working_hours ?? 8.0,
      break_time_mins: s.break_time_mins ?? 60,
      is_rotational: !!s.is_rotational
    });
    setShowShiftModal(true);
  };

  // Save Shift (Create or Update)
  const handleSaveShift = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setShiftSubmitting(true);

    try {
      if (editingShiftId) {
        await apiRequest(`/shifts/${editingShiftId}`, {
          method: 'PUT',
          body: shiftForm
        });
        setSuccess(`Shift "${shiftForm.name}" updated successfully.`);
      } else {
        await apiRequest('/shifts', {
          method: 'POST',
          body: shiftForm
        });
        setSuccess(`New Shift "${shiftForm.name}" created successfully.`);
      }
      setShowShiftModal(false);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to save shift.');
    } finally {
      setShiftSubmitting(false);
    }
  };

  // Delete Shift
  const handleDeleteShift = async (shift) => {
    if (!window.confirm(`Are you sure you want to delete shift "${shift.name}"? Any employees assigned to it will be unassigned.`)) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/shifts/${shift.id}`, { method: 'DELETE' });
      setSuccess(`Shift "${shift.name}" deleted successfully.`);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to delete shift.');
    }
  };

  // Master Shift Assignment
  const handleMasterAssign = async () => {
    if (selectedEmpIds.length === 0) {
      setError('Please select at least one employee from the list.');
      return;
    }

    const shiftIdVal = targetShiftId === 'unassign' ? null : (targetShiftId ? parseInt(targetShiftId, 10) : null);
    if (targetShiftId === '') {
      setError('Please select a target shift or choose "Clear / Unassign".');
      return;
    }

    setAssigningShift(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiRequest('/shifts/assign', {
        method: 'POST',
        body: {
          employee_ids: selectedEmpIds,
          shift_id: shiftIdVal,
          effective_date: effectiveDate
        }
      });
      setSuccess(res.message || 'Shift assigned successfully.');
      setSelectedEmpIds([]);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to assign shift.');
    } finally {
      setAssigningShift(false);
    }
  };

  // Quick Single Employee Assign
  const handleQuickAssign = async (e) => {
    e.preventDefault();
    if (!quickAssignEmp) return;

    const shiftIdVal = quickShiftId === 'unassign' ? null : (quickShiftId ? parseInt(quickShiftId, 10) : null);

    setAssigningShift(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiRequest('/shifts/assign', {
        method: 'POST',
        body: {
          employee_ids: [quickAssignEmp.id],
          shift_id: shiftIdVal,
          effective_date: quickEffectiveDate
        }
      });
      setSuccess(`Shift updated for ${quickAssignEmp.full_name} (Effective: ${quickEffectiveDate}).`);
      setQuickAssignEmp(null);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to update shift.');
    } finally {
      setAssigningShift(false);
    }
  };

  // Toggle select all filtered employees
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
      {/* Top Banner & Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Clock className="w-6 h-6 text-sky-600" />
            Shift & Rotational Management
          </h2>
          <p className="text-xs text-slate-500">
            Configure work shift timings, grace periods, rotational rosters, and assign shifts with custom effective dates and notifications
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAddShift}
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all hover:scale-105 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add New Shift
          </button>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors shadow-sm"
            title="Refresh Shift Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-600' : ''}`} />
          </button>
        </div>
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

      {/* SECTION 1: CONFIGURED SHIFTS OVERVIEW CARDS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-600" />
              Company Shift Schedules ({shifts.length})
            </h3>
            <p className="text-xs text-slate-500">Working hours, start & end timings, and gracing buffer periods</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shifts.map(shift => (
            <div
              key={shift.id}
              className="p-4 rounded-xl border border-slate-200 hover:border-sky-300 hover:shadow-md transition-all bg-gradient-to-br from-white to-slate-50/60 flex flex-col justify-between gap-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{shift.name}</h4>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      shift.is_rotational ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'
                    }`}>
                      {shift.is_rotational ? 'Rotational Roster' : 'Fixed Standard'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditShift(shift)}
                      className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                      title="Edit Shift Timings & Gracing"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteShift(shift)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete Shift"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="pt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-slate-400 block">Timing</span>
                    <span className="font-mono font-bold text-slate-800">{shift.start_time} - {shift.end_time}</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-slate-400 block">Gracing Time</span>
                    <span className="font-mono font-bold text-emerald-600">{shift.grace_time_mins || 15} mins</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-slate-400 block">Work Hours</span>
                    <span className="font-medium text-slate-700">{shift.working_hours || 8.0} hrs/day</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-slate-400 block">Assigned Staff</span>
                    <span className="font-bold text-sky-600">{shift.assigned_employees_count || 0} employees</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {shifts.length === 0 && (
            <div className="col-span-full p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">
              <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-semibold">No shifts configured yet.</p>
              <p className="text-[11px] text-slate-400 mt-1">Click "Add New Shift" above to create Day, Night, or Evening shift schedules.</p>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: WORKFORCE SHIFT ASSIGNMENT HUB (MASTER & MANUAL) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
        <div className="p-5 border-b border-slate-100 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-600" />
                Workforce Shift Assignment Hub (Manual or Master)
              </h3>
              <p className="text-xs text-slate-500">
                Filter by Role, Department, City, or Status; select multiple staff to apply shift in one go with Effective Date & Notifications
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1 text-xs">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Name or Code..."
                className="w-full pl-8 pr-3 py-2 border rounded-xl bg-slate-50 focus:bg-white focus:ring-1 focus:ring-sky-500 text-xs"
              />
            </div>

            {/* Role Filter */}
            <div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full p-2 border rounded-xl bg-slate-50 text-xs"
              >
                <option value="all">All Roles (Staff, Mgr, HR)</option>
                <option value="employee">Employees Only</option>
                <option value="manager">Managers Only</option>
                <option value="hr">HR Personnel Only</option>
                <option value="admin_reports">Direct Admin Reports</option>
              </select>
            </div>

            {/* Assignment Status Filter */}
            <div>
              <select
                value={assignmentFilter}
                onChange={(e) => setAssignmentFilter(e.target.value)}
                className="w-full p-2 border rounded-xl bg-slate-50 text-xs"
              >
                <option value="all">All Assignment Status</option>
                <option value="assigned">Assigned to a Shift</option>
                <option value="unassigned">Not Assigned / Default</option>
              </select>
            </div>

            {/* Department Filter */}
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

            {/* City Filter */}
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

          {/* Master Assignment Action Bar */}
          <div className="p-4 bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-100 rounded-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">
                Master Action ({selectedEmpIds.length} Selected):
              </span>
              <span className="text-[11px] text-slate-500">
                Showing {filteredEmployees.length} of {employees.length} personnel
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Target Shift Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-700">Target Shift:</span>
                <select
                  value={targetShiftId}
                  onChange={(e) => setTargetShiftId(e.target.value)}
                  className="p-2 border rounded-xl bg-white text-xs font-semibold text-slate-800 shadow-sm focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">-- Choose Shift --</option>
                  <option value="unassign">🚫 Clear / Reset to Default</option>
                  {shifts.map(s => (
                    <option key={s.id} value={s.id}>
                      🕒 {s.name} ({s.start_time} - {s.end_time}, Grace: {s.grace_time_mins}m)
                    </option>
                  ))}
                </select>
              </div>

              {/* Effective Date */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-700">Effective Date:</span>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="p-1.5 border rounded-xl bg-white text-xs font-mono font-semibold text-slate-800 shadow-sm"
                />
              </div>

              {/* Master Apply Button */}
              <button
                type="button"
                onClick={handleMasterAssign}
                disabled={assigningShift || selectedEmpIds.length === 0}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
              >
                {assigningShift ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Applying...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>⚡ Apply Master Shift ({selectedEmpIds.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Workforce Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-y border-slate-200">
              <tr>
                <th className="p-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleToggleSelectAll}
                    className="rounded text-sky-600 focus:ring-sky-500"
                    title="Select All Filtered"
                  />
                </th>
                <th className="p-3">Personnel</th>
                <th className="p-3">Role & Dept</th>
                <th className="p-3">City</th>
                <th className="p-3">Reporting To</th>
                <th className="p-3">Current Work Shift</th>
                <th className="p-3">Effective Date</th>
                <th className="p-3 text-right">Manual Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.map(emp => {
                const isSelected = selectedEmpIds.includes(emp.id);
                return (
                  <tr key={emp.id} className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-sky-50/40' : ''}`}>
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
                        className="rounded text-sky-600 focus:ring-sky-500"
                      />
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{emp.full_name}</div>
                      <div className="text-[10px] font-mono text-slate-400">{emp.employee_id}</div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          emp.role_name === 'manager' ? 'bg-purple-100 text-purple-700' :
                          emp.role_name === 'hr' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {emp.role_name}
                        </span>
                        <span className="text-slate-600 font-medium">{emp.department || 'Operations'}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">{emp.designation || 'Staff'}</div>
                    </td>
                    <td className="p-3 text-slate-600">{emp.city || '—'}</td>
                    <td className="p-3">
                      {emp.reports_to_admin ? (
                        <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md">
                          Admin Direct
                        </span>
                      ) : emp.manager_name ? (
                        <div className="text-[11px]">
                          <span className="text-slate-700 font-medium">Mgr: {emp.manager_name}</span>
                          {emp.hr_name && <span className="text-slate-400 block text-[10px]">HR: {emp.hr_name}</span>}
                        </div>
                      ) : emp.hr_name ? (
                        <span className="text-slate-700 font-medium text-[11px]">HR: {emp.hr_name}</span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">None</span>
                      )}
                    </td>
                    <td className="p-3">
                      {emp.current_shift_name ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/70">
                          <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{emp.current_shift_name} ({emp.shift_start_time} - {emp.shift_end_time})</span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500">
                          Default Shift
                        </span>
                      )}
                      {emp.shift_grace_mins ? (
                        <span className="block text-[10px] text-slate-400 mt-0.5">Grace: {emp.shift_grace_mins} mins</span>
                      ) : null}
                    </td>
                    <td className="p-3 font-mono text-slate-600 text-[11px]">
                      {emp.shift_effective_date || '—'}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setQuickAssignEmp(emp);
                          setQuickShiftId(emp.shift_id ? String(emp.shift_id) : '');
                          setQuickEffectiveDate(new Date().toISOString().split('T')[0]);
                        }}
                        className="px-2.5 py-1 text-xs font-semibold text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors border border-sky-200/60 inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" />
                        Change Shift
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-400">
                    No workforce records matched the chosen filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ADD / EDIT SHIFT */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-sky-600" />
                  {editingShiftId ? 'Edit Work Shift Schedule' : 'Create New Work Shift'}
                </h3>
                <p className="text-xs text-slate-500">Specify shift work timing, gracing allowance, and shift type</p>
              </div>
              <button
                type="button"
                onClick={() => setShowShiftModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShift} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Shift Name *</label>
                <input
                  type="text"
                  required
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                  placeholder="e.g. Morning Day Shift / Night Shift / General 9-6"
                  className="w-full p-2.5 border rounded-xl font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Start Time (24h) *</label>
                  <input
                    type="time"
                    required
                    value={shiftForm.start_time}
                    onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">End Time (24h) *</label>
                  <input
                    type="time"
                    required
                    value={shiftForm.end_time}
                    onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Gracing Time (Mins) *</label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    required
                    value={shiftForm.grace_time_mins}
                    onChange={(e) => setShiftForm({ ...shiftForm, grace_time_mins: parseInt(e.target.value, 10) })}
                    className="w-full p-2.5 border rounded-xl font-mono font-bold text-emerald-700"
                  />
                  <span className="text-[10px] text-slate-400">Late mark grace period</span>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Daily Work Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="24"
                    value={shiftForm.working_hours}
                    onChange={(e) => setShiftForm({ ...shiftForm, working_hours: parseFloat(e.target.value) })}
                    className="w-full p-2.5 border rounded-xl font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Standard hours/day</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-semibold">
                  <input
                    type="checkbox"
                    checked={shiftForm.is_rotational}
                    onChange={(e) => setShiftForm({ ...shiftForm, is_rotational: e.target.checked })}
                    className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                  />
                  <span>Mark as Rotational Shift Schedule</span>
                </label>
                <p className="text-[10px] text-slate-400 ml-6 mt-0.5">
                  Check if this shift rotates across day, night, or evening cycles.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowShiftModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={shiftSubmitting}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  {shiftSubmitting ? 'Saving...' : editingShiftId ? 'Update Shift' : 'Create Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: QUICK SINGLE EMPLOYEE SHIFT ASSIGNMENT */}
      {quickAssignEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Update Shift: {quickAssignEmp.full_name}
                </h3>
                <p className="text-xs text-slate-500">ID: {quickAssignEmp.employee_id} • {quickAssignEmp.department}</p>
              </div>
              <button
                type="button"
                onClick={() => setQuickAssignEmp(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickAssign} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Select Shift *</label>
                <select
                  required
                  value={quickShiftId}
                  onChange={(e) => setQuickShiftId(e.target.value)}
                  className="w-full p-2.5 border rounded-xl bg-white font-semibold text-slate-800"
                >
                  <option value="">-- Choose Shift --</option>
                  <option value="unassign">🚫 Clear / Reset to Default Shift</option>
                  {shifts.map(s => (
                    <option key={s.id} value={s.id}>
                      🕒 {s.name} ({s.start_time} - {s.end_time}, Grace: {s.grace_time_mins}m)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Effective Date *</label>
                <input
                  type="date"
                  required
                  value={quickEffectiveDate}
                  onChange={(e) => setQuickEffectiveDate(e.target.value)}
                  className="w-full p-2.5 border rounded-xl font-mono text-sm"
                />
                <span className="text-[10px] text-slate-400">Date from which this new shift timing applies</span>
              </div>

              <div className="p-3 bg-sky-50 rounded-xl border border-sky-100 text-[11px] text-sky-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
                <span>An instant notification with the new timing and effective date will be sent to the employee.</span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQuickAssignEmp(null)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigningShift}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  {assigningShift ? 'Updating...' : 'Confirm Shift Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
