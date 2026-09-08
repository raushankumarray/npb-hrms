import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, UserCheck, Shield, MapPin, Search, Filter, CheckSquare, Square,
  CheckCircle, AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Trash2,
  Settings2, ArrowRight, UserPlus, SlidersHorizontal, Check, X
} from 'lucide-react';
import { apiRequest } from '../api';

export default function EmployeeMappingView({ role = 'company_admin' }) {
  // Data state
  const [employees, setEmployees] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [citiesList, setCitiesList] = useState([]);
  const [managersList, setManagersList] = useState([]);
  const [hrsList, setHrsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Pagination & limits (Strictly defaults to 10 as requested)
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [customLimit, setCustomLimit] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [mappingStatus, setMappingStatus] = useState('all'); // 'all' | 'mapped' | 'unmapped'
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedPosition, setSelectedPosition] = useState('all'); // 'all' | 'employee' | 'manager' | 'hr'
  const [selectedManager, setSelectedManager] = useState('all'); // 'all' | 'none' | managerId
  const [selectedHr, setSelectedHr] = useState('all'); // 'all' | 'none' | hrId
  const [selectedAdminReport, setSelectedAdminReport] = useState('all'); // 'all' | '1' | '0'

  // Selection state for bulk operations
  const [selectedIds, setSelectedIds] = useState([]);

  // Bulk Mapping Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTargetStaff, setModalTargetStaff] = useState([]); // array of employee objects
  const [modalManagerId, setModalManagerId] = useState('unchanged');
  const [modalHrId, setModalHrId] = useState('unchanged');
  const [modalAdminReport, setModalAdminReport] = useState('unchanged');
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // Fetch employees when filters, pagination or limit changes
  const fetchEmployees = async () => {
    setLoading(true);
    setError('');
    try {
      const offset = (page - 1) * limit;
      const params = new URLSearchParams();
      params.append('limit', limit);
      params.append('offset', offset);

      if (search.trim()) params.append('search', search.trim());
      if (mappingStatus !== 'all') params.append('mapping_status', mappingStatus);
      if (selectedCity !== 'all') params.append('city', selectedCity);
      if (selectedPosition !== 'all') params.append('role', selectedPosition);
      if (selectedManager !== 'all') params.append('manager_id', selectedManager);
      if (selectedHr !== 'all') params.append('hr_id', selectedHr);
      if (selectedAdminReport !== 'all') params.append('reports_to_admin', selectedAdminReport);

      const res = await apiRequest(`/employees?${params.toString()}`);
      setEmployees(res.employees || []);
      setTotalCount(res.total || 0);
      if (res.cities) setCitiesList(res.cities);
      if (res.managers) setManagersList(res.managers);
      if (res.hrs) setHrsList(res.hrs);
    } catch (err) {
      setError(err.message || 'Failed to load employee directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [page, limit, mappingStatus, selectedCity, selectedPosition, selectedManager, selectedHr, selectedAdminReport]);

  // Handle Search Debounce / Trigger
  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1);
      fetchEmployees();
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Reset page when filter changes
  const handleFilterChange = (setter, value) => {
    setter(value);
    setPage(1);
    setSelectedIds([]);
  };

  // Page limit changer handlers
  const handleLimitChange = (newLimit) => {
    const parsed = parseInt(newLimit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setLimit(parsed);
      setPage(1);
      setShowCustomInput(false);
    }
  };

  const handleApplyCustomLimit = (e) => {
    e.preventDefault();
    const parsed = parseInt(customLimit, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 500) {
      setLimit(parsed);
      setPage(1);
      setShowCustomInput(false);
    } else {
      setError('Please enter a valid limit between 1 and 500.');
    }
  };

  // Selection handlers
  const isAllOnPageSelected = employees.length > 0 && employees.every(e => selectedIds.includes(e.id));

  const toggleSelectAllOnPage = () => {
    if (isAllOnPageSelected) {
      setSelectedIds(prev => prev.filter(id => !employees.some(e => e.id === id)));
    } else {
      const newIds = employees.map(e => e.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...newIds])));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Open Bulk Mapping Modal for selected
  const handleOpenBulkModal = () => {
    if (selectedIds.length === 0) return;
    const targets = employees.filter(e => selectedIds.includes(e.id));
    setModalTargetStaff(targets);
    setModalManagerId('unchanged');
    setModalHrId('unchanged');
    setModalAdminReport('unchanged');
    setModalOpen(true);
  };

  // Open Quick Map Modal for single employee
  const handleOpenQuickMap = (emp) => {
    setModalTargetStaff([emp]);
    setModalManagerId(emp.manager_id || 'none');
    setModalHrId(emp.hr_id || 'none');
    setModalAdminReport(emp.reports_to_admin ? '1' : '0');
    setModalOpen(true);
  };

  // Submit Mapping Modal
  const handleSaveModalMapping = async (e) => {
    e.preventDefault();
    setModalSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const empIds = modalTargetStaff.map(e => e.id);
      await apiRequest('/employees/bulk-mapping', {
        method: 'POST',
        body: {
          employee_ids: empIds,
          manager_id: modalManagerId === 'none' ? null : modalManagerId,
          hr_id: modalHrId === 'none' ? null : modalHrId,
          reports_to_admin: modalAdminReport === 'unchanged' ? 'unchanged' : (modalAdminReport === '1' ? 1 : 0)
        }
      });

      setSuccess(`Reporting hierarchy updated successfully for ${empIds.length} staff member(s).`);
      setModalOpen(false);
      setSelectedIds([]);
      fetchEmployees();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to update employee mapping.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Quick Unmap / Clear Mapping for single or selected
  const handleClearMappings = async (targetIds, label = 'selected staff') => {
    if (!window.confirm(`Are you sure you want to clear/unmap reporting hierarchy for ${label}?`)) {
      return;
    }
    setError('');
    try {
      await apiRequest('/employees/bulk-mapping', {
        method: 'POST',
        body: {
          employee_ids: targetIds,
          manager_id: null,
          hr_id: null,
          reports_to_admin: 0
        }
      });
      setSuccess(`Cleared reporting hierarchy for ${targetIds.length} staff member(s).`);
      setSelectedIds(prev => prev.filter(id => !targetIds.includes(id)));
      fetchEmployees();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to clear employee mapping.');
    }
  };

  // Derived stats
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const mappedCount = useMemo(() => {
    return employees.filter(e => (e.manager_id || e.hr_id || e.reports_to_admin)).length;
  }, [employees]);

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {role === 'manager' ? 'Team Member Mapping' : 'Employee Mapping & Hierarchy Master'}
                </h2>
                <p className="text-xs text-slate-500">
                  One-time multiple mapping: Filter, select, and assign reporting hierarchy (Manager, HR Lead, Admin) in bulk
                </p>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchEmployees()}
              disabled={loading}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors text-xs font-semibold flex items-center gap-1.5"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            {selectedIds.length > 0 && (
              <button
                onClick={handleOpenBulkModal}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all shadow-md shadow-purple-200 text-xs font-bold flex items-center gap-2"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Assign Mapping ({selectedIds.length})
              </button>
            )}
          </div>
        </div>

        {/* Feedback Toasts */}
        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{success}</span>
          </div>
        )}

        {/* Stats Strip */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100 text-xs">
          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/60">
            <div className="text-slate-400 text-[11px] font-medium">Total Staff on Record</div>
            <div className="text-base font-bold text-slate-800 mt-0.5">{totalCount}</div>
          </div>
          <div className="bg-emerald-50/80 rounded-xl p-3 border border-emerald-200/60">
            <div className="text-emerald-700 text-[11px] font-medium">Mapped on Current Page</div>
            <div className="text-base font-bold text-emerald-800 mt-0.5">{mappedCount} / {employees.length}</div>
          </div>
          <div className="bg-purple-50/80 rounded-xl p-3 border border-purple-200/60">
            <div className="text-purple-700 text-[11px] font-medium">Active Managers</div>
            <div className="text-base font-bold text-purple-800 mt-0.5">{managersList.length}</div>
          </div>
          <div className="bg-indigo-50/80 rounded-xl p-3 border border-indigo-200/60">
            <div className="text-indigo-700 text-[11px] font-medium">Active HR Leads</div>
            <div className="text-base font-bold text-indigo-800 mt-0.5">{hrsList.length}</div>
          </div>
        </div>
      </div>

      {/* Advanced Filter Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            Advanced Mapping Filters
          </span>
          <div className="flex items-center gap-2">
            {/* Page Size Controls */}
            <span className="text-[11px] text-slate-400 font-medium">Show Rows:</span>
            <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
              {[10, 25, 50].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => handleLimitChange(size)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    limit === size && !showCustomInput
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {size}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCustomInput(!showCustomInput)}
                className={`px-2 py-1 rounded-lg transition-all ${
                  showCustomInput || ![10, 25, 50].includes(limit)
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Custom limit"
              >
                Custom {![10, 25, 50].includes(limit) ? `(${limit})` : ''}
              </button>
            </div>
          </div>
        </div>

        {/* Custom Limit Input Bar */}
        {showCustomInput && (
          <form onSubmit={handleApplyCustomLimit} className="flex items-center gap-2 p-2 bg-purple-50/60 rounded-xl border border-purple-200 text-xs">
            <span className="text-purple-800 font-medium">Enter custom page size:</span>
            <input
              type="number"
              min="1"
              max="500"
              value={customLimit}
              onChange={(e) => setCustomLimit(e.target.value)}
              placeholder="e.g. 15, 30, 100"
              className="w-28 px-2 py-1 bg-white border border-purple-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <button
              type="submit"
              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold shadow-sm"
            >
              Apply Limit
            </button>
            <button
              type="button"
              onClick={() => setShowCustomInput(false)}
              className="p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff / code..."
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Mapping Status */}
          <div>
            <select
              value={mappingStatus}
              onChange={(e) => handleFilterChange(setMappingStatus, e.target.value)}
              className="w-full py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
            >
              <option value="all">Status: All Staff</option>
              <option value="mapped">Status: Mapped (Assigned)</option>
              <option value="unmapped">Status: Not Mapped (Unassigned)</option>
            </select>
          </div>

          {/* City Filter */}
          <div>
            <select
              value={selectedCity}
              onChange={(e) => handleFilterChange(setSelectedCity, e.target.value)}
              className="w-full py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
            >
              <option value="all">City: All Cities</option>
              {citiesList.map((city) => (
                <option key={city} value={city}>City: {city}</option>
              ))}
            </select>
          </div>

          {/* Position Filter */}
          <div>
            <select
              value={selectedPosition}
              onChange={(e) => handleFilterChange(setSelectedPosition, e.target.value)}
              className="w-full py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
            >
              <option value="all">Position: All Roles</option>
              <option value="employee">Position: Employee</option>
              <option value="manager">Position: Manager</option>
              <option value="hr">Position: HR Lead</option>
            </select>
          </div>

          {/* Manager Filter */}
          <div>
            <select
              value={selectedManager}
              onChange={(e) => handleFilterChange(setSelectedManager, e.target.value)}
              className="w-full py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
            >
              <option value="all">Manager: All</option>
              <option value="none">Manager: Unassigned</option>
              {managersList.map((m) => (
                <option key={m.id} value={m.id}>Manager: {m.full_name}</option>
              ))}
            </select>
          </div>

          {/* HR Lead Filter */}
          <div>
            <select
              value={selectedHr}
              onChange={(e) => handleFilterChange(setSelectedHr, e.target.value)}
              className="w-full py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
            >
              <option value="all">HR Lead: All</option>
              <option value="none">HR Lead: Unassigned</option>
              {hrsList.map((h) => (
                <option key={h.id} value={h.id}>HR: {h.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2 Admin Report Filter */}
        <div className="flex items-center gap-3 pt-1 text-xs">
          <span className="text-[11px] font-semibold text-slate-500">Admin Direct Report:</span>
          <div className="flex gap-2">
            {[
              { id: 'all', label: 'All' },
              { id: '1', label: 'Reports to Admin (Yes)' },
              { id: '0', label: 'No Direct Admin' }
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleFilterChange(setSelectedAdminReport, opt.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  selectedAdminReport === opt.id
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk Action Sticky Toolbar */}
      {selectedIds.length > 0 && (
        <div className="p-3 bg-purple-900 text-white rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 animate-fade-in text-xs">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-purple-800 rounded-lg">
              <CheckSquare className="w-4 h-4 text-purple-300" />
            </span>
            <span className="font-bold">
              {selectedIds.length} staff member{selectedIds.length > 1 ? 's' : ''} selected
            </span>
            <span className="text-purple-300 text-[11px] hidden sm:inline">
              (Choose an action below to apply across all selected records)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenBulkModal}
              className="px-3.5 py-1.5 bg-white hover:bg-purple-50 text-purple-900 rounded-xl font-bold transition-colors shadow-sm flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              ⚡ One-Time Bulk Mapping
            </button>
            <button
              onClick={() => handleClearMappings(selectedIds, `${selectedIds.length} selected staff`)}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-colors shadow-sm flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Unmap Selected
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 bg-purple-800 hover:bg-purple-700 text-purple-200 rounded-xl transition-colors font-medium"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllOnPageSelected}
                    onChange={toggleSelectAllOnPage}
                    className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                    title="Select all on this page"
                  />
                </th>
                <th className="p-3">Staff Member</th>
                <th className="p-3">Position</th>
                <th className="p-3">City</th>
                <th className="p-3">Reporting Manager</th>
                <th className="p-3">Reporting HR</th>
                <th className="p-3">Admin Direct Report</th>
                <th className="p-3">Mapping Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-500 mb-2" />
                    Loading employee directory and hierarchy mappings...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400">
                    <AlertTriangle className="w-6 h-6 mx-auto text-slate-300 mb-2" />
                    No employees found matching the selected filters.
                  </td>
                </tr>
              ) : (
                employees.map((emp) => {
                  const isSelected = selectedIds.includes(emp.id);
                  const isMapped = !!(emp.manager_id || emp.hr_id || emp.reports_to_admin);

                  return (
                    <tr
                      key={emp.id}
                      className={`hover:bg-purple-50/30 transition-colors ${
                        isSelected ? 'bg-purple-50/50 font-medium' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(emp.id)}
                          className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                      </td>

                      {/* Staff Member */}
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
                            {emp.full_name?.charAt(0) || 'E'}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 leading-snug">{emp.full_name}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {emp.employee_id} &bull; <span className="text-slate-400">@{emp.username}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">{emp.department || 'General'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Position */}
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            emp.role_name === 'manager'
                              ? 'bg-purple-100 text-purple-800'
                              : emp.role_name === 'hr'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-sky-100 text-sky-800'
                          }`}
                        >
                          {emp.role_name === 'hr' ? 'HR Lead' : emp.role_name}
                        </span>
                      </td>

                      {/* City */}
                      <td className="p-3">
                        {emp.city ? (
                          <span className="inline-flex items-center gap-1 text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg text-[11px] font-medium">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {emp.city}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic text-[11px]">—</span>
                        )}
                      </td>

                      {/* Manager */}
                      <td className="p-3">
                        {emp.role_name === 'hr' ? (
                          <span className="text-[11px] text-slate-400 italic">Not Applicable (HR)</span>
                        ) : emp.manager_name ? (
                          <div>
                            <div className="font-semibold text-slate-900">{emp.manager_name}</div>
                            <div className="text-[10px] font-mono text-purple-600">{emp.manager_code}</div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* HR Lead */}
                      <td className="p-3">
                        {emp.role_name === 'hr' ? (
                          <span className="text-[11px] text-slate-400 italic">Self (HR)</span>
                        ) : emp.hr_name ? (
                          <div>
                            <div className="font-semibold text-slate-900">{emp.hr_name}</div>
                            <div className="text-[10px] font-mono text-emerald-600">{emp.hr_code}</div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Admin Report */}
                      <td className="p-3">
                        {emp.reports_to_admin ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                            <Shield className="w-3 h-3 text-indigo-600" />
                            Direct Admin
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">No</span>
                        )}
                      </td>

                      {/* Mapping Status */}
                      <td className="p-3">
                        {isMapped ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <Check className="w-3 h-3 text-emerald-600" />
                            Mapped
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            Not Mapped
                          </span>
                        )}
                      </td>

                      {/* Row Actions */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenQuickMap(emp)}
                            className="p-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors"
                            title="Edit / Assign Mapping"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                          {isMapped && (
                            <button
                              type="button"
                              onClick={() => handleClearMappings([emp.id], emp.full_name)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors"
                              title="Clear Mapping"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500">
            Showing <span className="font-bold text-slate-800">{employees.length > 0 ? (page - 1) * limit + 1 : 0}</span> to{' '}
            <span className="font-bold text-slate-800">{Math.min(page * limit, totalCount)}</span> of{' '}
            <span className="font-bold text-slate-800">{totalCount}</span> staff members
            {limit !== 10 && <span className="ml-1 text-purple-700">({limit} per page)</span>}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev</span>
            </button>

            {/* Page number buttons */}
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1))
                .map((p, idx, arr) => (
                  <React.Fragment key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span className="px-1 text-slate-400">...</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setPage(p)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                        page === p
                          ? 'bg-purple-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  </React.Fragment>
                ))}
            </div>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk & Quick Mapping Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {modalTargetStaff.length === 1
                      ? `Assign Mapping: ${modalTargetStaff[0].full_name}`
                      : `One-Time Bulk Mapping (${modalTargetStaff.length} Selected)`}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Assign multi-level hierarchy (Manager, HR Lead, Direct Admin) in one transaction
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Staff Summary Pills */}
            <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100 text-xs space-y-1.5">
              <div className="font-semibold text-purple-900">Selected Staff Members ({modalTargetStaff.length}):</div>
              <div className="max-h-20 overflow-y-auto flex flex-wrap gap-1">
                {modalTargetStaff.map(s => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-purple-200 text-purple-800 text-[10px] font-medium"
                  >
                    {s.full_name} ({s.employee_id})
                  </span>
                ))}
              </div>
            </div>

            {/* Position Hierarchy Guidance Notice */}
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-0.5">
              <div className="font-semibold text-slate-800">&bull; Multi-level Mapping Rules:</div>
              <div>- <strong>Employees</strong> can report to a Manager, an HR Lead, and/or directly to Company Admin.</div>
              <div>- <strong>Managers</strong> can report to an HR Lead and/or directly to Company Admin.</div>
              <div>- <strong>HR Leads</strong> report directly to the Company Administrator.</div>
            </div>

            {/* Mapping Form */}
            <form onSubmit={handleSaveModalMapping} className="space-y-4 text-xs">
              {/* Assign Manager */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reporting Manager:
                </label>
                <select
                  value={modalManagerId}
                  onChange={(e) => setModalManagerId(e.target.value)}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
                >
                  <option value="unchanged">-- Keep Current Manager (No Change) --</option>
                  <option value="none">-- Remove / Unassigned (No Manager) --</option>
                  {managersList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.employee_id}) - {m.department} {m.city ? `[${m.city}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assign HR Lead */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reporting HR Lead:
                </label>
                <select
                  value={modalHrId}
                  onChange={(e) => setModalHrId(e.target.value)}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
                >
                  <option value="unchanged">-- Keep Current HR Lead (No Change) --</option>
                  <option value="none">-- Remove / Unassigned (No HR Lead) --</option>
                  {hrsList.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.full_name} ({h.employee_id}) - {h.department} {h.city ? `[${h.city}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Direct Admin Report */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Direct Company Admin Report:
                </label>
                <select
                  value={modalAdminReport}
                  onChange={(e) => setModalAdminReport(e.target.value)}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
                >
                  <option value="unchanged">-- Keep Current Admin Reporting --</option>
                  <option value="1">Yes - Report Directly to Admin</option>
                  <option value="0">No - Standard Hierarchy (No Direct Admin)</option>
                </select>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-md shadow-purple-200 transition-colors flex items-center gap-1.5"
                >
                  {modalSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Apply Mapping to {modalTargetStaff.length} Staff
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
