import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  MapPin, Navigation, Compass, Calendar, RefreshCw, Clock,
  Eye, EyeOff, Layers, Activity, ChevronDown, ChevronUp, LocateFixed
} from 'lucide-react';
import { apiRequest } from '../api';

// Fix Leaflet default icon asset paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

// Custom live employee marker
const createEmployeeIcon = (color = '#0284c7', label = '') => {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px; border: 2.5px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.35);">
        ${label ? label.slice(0, 2).toUpperCase() : '•'}
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15]
  });
};

// Custom waiting time stop icon (> 10 mins)
const createWaitingStopIcon = (durationMins, stopNumber) => {
  return L.divIcon({
    className: 'custom-stop-marker',
    html: `
      <div style="background-color: #f59e0b; color: white; font-weight: 800; font-size: 10px; padding: 2px 6px; border-radius: 9999px; border: 2px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.35); display: flex; align-items: center; gap: 3px; white-space: nowrap;">
        <span>⏱️</span>
        <span>${durationMins}m</span>
      </div>
    `,
    iconSize: [52, 22],
    iconAnchor: [26, 11],
    popupAnchor: [0, -11]
  });
};

// Custom assigned reporting location icon
const createOfficeIcon = (label = 'Reporting Office') => {
  return L.divIcon({
    className: 'custom-office-marker',
    html: `
      <div style="background-color: #0284c7; color: white; font-weight: bold; font-size: 10px; padding: 2px 7px; border-radius: 8px; border: 2px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 3px; white-space: nowrap;">
        <span>🏢</span>
        <span>${label.slice(0, 14)}</span>
      </div>
    `,
    iconSize: [90, 22],
    iconAnchor: [45, 11],
    popupAnchor: [0, -11]
  });
};

function ChangeView({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

export default function LiveTrackingMap({ companyId, selectedEmployeeId = null }) {
  const [positions, setPositions] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(selectedEmployeeId || 'all');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState([25.6090, 85.1343]);
  const [mapZoom, setMapZoom] = useState(13);

  // Layer toggles
  const [showReportingZones, setShowReportingZones] = useState(true);
  const [showMovementPaths, setShowMovementPaths] = useState(true);
  const [showWaitingStops, setShowWaitingStops] = useState(true);
  const [showLivePins, setShowLivePins] = useState(true);
  const [showLogDrawer, setShowLogDrawer] = useState(true);

  // Fetch live tracking data
  const fetchLiveData = async () => {
    try {
      const res = await apiRequest(`/tracking/live${companyId ? '?company_id=' + companyId : ''}`);
      const pos = res.positions || [];
      setPositions(pos);

      // Center map on first position or reporting location if center not yet set
      const firstWithCoords = pos.find(p => p.has_live_location && p.latitude && p.longitude);
      if (firstWithCoords) {
        setMapCenter([firstWithCoords.latitude, firstWithCoords.longitude]);
      } else if (pos.find(p => p.reporting_location)) {
        const rep = pos.find(p => p.reporting_location).reporting_location;
        setMapCenter([rep.latitude, rep.longitude]);
      }
    } catch (err) {
      console.error('Failed to load tracking live positions:', err);
    }
  };

  // Fetch route and dwell waiting time history
  const fetchRouteData = async () => {
    setLoading(true);
    try {
      const queryEmp = selectedEmp === 'all' ? 'all' : selectedEmp;
      const res = await apiRequest(`/tracking/route?employee_id=${queryEmp}&date=${selectedDate}`);
      const rList = res.routes || [];
      setRoutes(rList);

      // If viewing single employee and waypoints exist, auto-center
      if (selectedEmp !== 'all') {
        const currentEmpRoute = rList.find(r => String(r.employee.id) === String(selectedEmp));
        if (currentEmpRoute && currentEmpRoute.waypoints.length > 0) {
          const lastWp = currentEmpRoute.waypoints[currentEmpRoute.waypoints.length - 1];
          setMapCenter([lastWp.latitude, lastWp.longitude]);
          setMapZoom(14);
        }
      }
    } catch (err) {
      console.error('Failed to load route & waiting data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveData();
    const interval = setInterval(fetchLiveData, 20000);
    return () => clearInterval(interval);
  }, [companyId]);

  useEffect(() => {
    fetchRouteData();
  }, [selectedEmp, selectedDate, companyId]);

  // Aggregate active routes to display based on selected employee filter
  const displayedRoutes = useMemo(() => {
    if (selectedEmp === 'all') return routes;
    return routes.filter(r => String(r.employee.id) === String(selectedEmp));
  }, [routes, selectedEmp]);

  // Extract reporting locations ONLY for employees who have geofencing applied
  const reportingLocationsToDisplay = useMemo(() => {
    const locMap = new Map();
    displayedRoutes.forEach(r => {
      if (r.geofence_applied && r.reporting_location && r.reporting_location.latitude) {
        const key = `${r.reporting_location.latitude}_${r.reporting_location.longitude}`;
        if (!locMap.has(key)) {
          locMap.set(key, {
            ...r.reporting_location,
            assigned_employees: [r.employee.full_name]
          });
        } else {
          locMap.get(key).assigned_employees.push(r.employee.full_name);
        }
      }
    });
    return Array.from(locMap.values());
  }, [displayedRoutes]);

  // Aggregate all waiting stops (>10 mins) across displayed routes
  const allStops = useMemo(() => {
    const stopsList = [];
    displayedRoutes.forEach(r => {
      (r.stops || []).forEach(s => {
        stopsList.push({
          ...s,
          employee: r.employee
        });
      });
    });
    return stopsList;
  }, [displayedRoutes]);

  // Total summary statistics
  const totalKm = displayedRoutes.reduce((acc, r) => acc + parseFloat(r.total_distance_km || 0), 0).toFixed(2);
  const totalWaitMins = displayedRoutes.reduce((acc, r) => acc + (r.total_waiting_mins || 0), 0);
  const totalStopsCount = allStops.length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
      {/* Top Filter & Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-sky-600" />
          <div>
            <h3 className="text-base font-bold text-slate-900">Live Route, Geofence & Movement Path Map</h3>
            <p className="text-xs text-slate-500">
              Reporting locations, day-wise route tracing, and dwell waiting time detection (&ge; 10 min)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Day Date Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer"
            />
          </div>

          {/* Employee Filter */}
          <select
            value={selectedEmp}
            onChange={(e) => setSelectedEmp(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="all">All Assigned Employees (Multi-Trace)</option>
            {routes.map(r => (
              <option key={r.employee.id} value={r.employee.id}>
                {r.employee.full_name} ({r.employee.employee_code || 'EMP' + r.employee.id})
              </option>
            ))}
          </select>

          {/* Refresh Button */}
          <button
            onClick={() => {
              fetchLiveData();
              fetchRouteData();
            }}
            disabled={loading}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            title="Refresh Live Data & Routes"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Layer Toggles and Metrics Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200">
        {/* Layer Visibility Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-600 flex items-center gap-1 mr-1">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            Layers:
          </span>

          <button
            onClick={() => setShowReportingZones(!showReportingZones)}
            className={`px-2 py-1 rounded-md font-medium border flex items-center gap-1 transition-colors ${
              showReportingZones
                ? 'bg-sky-100 text-sky-800 border-sky-300'
                : 'bg-white text-slate-500 border-slate-200 opacity-60'
            }`}
          >
            <span>🏢 Reporting Locations</span>
            {showReportingZones ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </button>

          <button
            onClick={() => setShowMovementPaths(!showMovementPaths)}
            className={`px-2 py-1 rounded-md font-medium border flex items-center gap-1 transition-colors ${
              showMovementPaths
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-white text-slate-500 border-slate-200 opacity-60'
            }`}
          >
            <span>🛣️ Movement Paths</span>
            {showMovementPaths ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </button>

          <button
            onClick={() => setShowWaitingStops(!showWaitingStops)}
            className={`px-2 py-1 rounded-md font-medium border flex items-center gap-1 transition-colors ${
              showWaitingStops
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-white text-slate-500 border-slate-200 opacity-60'
            }`}
          >
            <span>⏱️ Waiting Stops (&ge;10m)</span>
            {showWaitingStops ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </button>

          <button
            onClick={() => setShowLivePins(!showLivePins)}
            className={`px-2 py-1 rounded-md font-medium border flex items-center gap-1 transition-colors ${
              showLivePins
                ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                : 'bg-white text-slate-500 border-slate-200 opacity-60'
            }`}
          >
            <span>📍 Live Position Pins</span>
            {showLivePins ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </button>
        </div>

        {/* Quick Day Telemetry Stats */}
        <div className="flex items-center gap-3 font-semibold text-slate-700">
          <span title="Total Movement Distance">
            🛣️ <span className="text-slate-900 font-bold">{totalKm} km</span> Traveled
          </span>
          <span title="Total Waiting Time Spent Stationary">
            ⏱️ <span className="text-amber-700 font-bold">{totalWaitMins} mins</span> Waiting
          </span>
          <span title="Total Waiting Stops Detected">
            🛑 <span className="text-rose-700 font-bold">{totalStopsCount}</span> Stops (&ge;10m)
          </span>
        </div>
      </div>

      {/* Leaflet Map Display */}
      <div className="h-[490px] w-full rounded-xl overflow-hidden border border-slate-200 relative shadow-inner">
        <MapContainer center={mapCenter} zoom={mapZoom} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
          <ChangeView center={mapCenter} zoom={mapZoom} />

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* 1. Render Assigned Reporting Location Geofences (ONLY if applied to employee) */}
          {showReportingZones && reportingLocationsToDisplay.map((rl, idx) => (
            <React.Fragment key={`rep-zone-${rl.id || idx}`}>
              <Circle
                center={[rl.latitude, rl.longitude]}
                radius={rl.radius || 100}
                pathOptions={{
                  color: '#0284c7',
                  fillColor: '#38bdf8',
                  fillOpacity: 0.18,
                  weight: 2,
                  dashArray: '5, 5'
                }}
              >
                <Popup>
                  <div className="text-xs space-y-1.5 min-w-[200px]">
                    <div className="flex items-center gap-1.5 font-bold text-sky-700 border-b border-sky-100 pb-1">
                      <Compass className="w-4 h-4 text-sky-600" />
                      Assigned Reporting Location
                    </div>
                    <p className="font-bold text-slate-900">{rl.location_name}</p>
                    <p className="text-slate-600">Allowed Perimeter: <span className="font-semibold">{rl.radius || 100} meters</span></p>
                    <div className="pt-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Assigned Staff:</span>
                      <p className="text-xs font-semibold text-slate-800">{rl.assigned_employees.join(', ')}</p>
                    </div>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Geofencing Applied
                    </span>
                  </div>
                </Popup>
              </Circle>

              <Marker
                position={[rl.latitude, rl.longitude]}
                icon={createOfficeIcon(rl.location_name)}
              />
            </React.Fragment>
          ))}

          {/* 2. Render Day-wise Movement Paths (Polylines for each employee) */}
          {showMovementPaths && displayedRoutes.map(r => {
            if (!r.waypoints || r.waypoints.length < 2) return null;
            const points = r.waypoints.map(w => [w.latitude, w.longitude]);
            return (
              <Polyline
                key={`route-poly-${r.employee.id}`}
                positions={points}
                pathOptions={{
                  color: r.employee.color || '#0284c7',
                  weight: 4.5,
                  opacity: 0.85
                }}
              >
                <Popup>
                  <div className="text-xs space-y-1">
                    <p className="font-bold text-slate-900">{r.employee.full_name} &bull; Movement Path</p>
                    <p className="text-slate-600">Total Distance: <span className="font-semibold text-slate-900">{r.total_distance_km} km</span></p>
                    <p className="text-slate-600">Waypoints Captured: <span className="font-semibold">{r.waypoints.length} pings</span></p>
                  </div>
                </Popup>
              </Polyline>
            );
          })}

          {/* 3. Render Waiting Stops (>10 mins dwell time) */}
          {showWaitingStops && displayedRoutes.map(r => (
            (r.stops || []).map(s => (
              <Marker
                key={`stop-${r.employee.id}-${s.stop_number}-${s.start_time}`}
                position={[s.latitude, s.longitude]}
                icon={createWaitingStopIcon(s.duration_mins, s.stop_number)}
              >
                <Popup>
                  <div className="text-xs space-y-1.5 min-w-[210px]">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                      <span className="font-bold text-amber-700 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Stationary Waiting Point
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                        Stop #{s.stop_number}
                      </span>
                    </div>

                    <p className="font-bold text-slate-900">{r.employee.full_name} ({r.employee.employee_code})</p>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-900">
                      <p className="font-bold text-sm text-amber-800">Stayed {s.duration_mins} mins</p>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        {String(s.start_time).slice(11, 16)} to {String(s.end_time).slice(11, 16)}
                      </p>
                    </div>

                    <p className="text-slate-600 text-[11px] font-medium">
                      Location: <span className="text-slate-800">{s.location_name}</span>
                    </p>
                    <p className="text-slate-400 text-[10px]">
                      GPS: {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))
          ))}

          {/* 4. Render Live Position Pins */}
          {showLivePins && displayedRoutes.map(r => {
            const loc = r.current_location;
            if (!loc || !loc.latitude || !loc.longitude) return null;

            return (
              <Marker
                key={`live-pos-${r.employee.id}`}
                position={[loc.latitude, loc.longitude]}
                icon={createEmployeeIcon(r.employee.color || '#10b981', r.employee.full_name)}
              >
                <Popup>
                  <div className="text-xs space-y-1.5 min-w-[210px]">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
                      <p className="font-bold text-slate-900">{r.employee.full_name}</p>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">
                        {r.employee.employee_code}
                      </span>
                    </div>

                    <p className="text-slate-500">{r.employee.department} &bull; {r.employee.designation}</p>

                    {/* Reporting Geofence Status */}
                    <div className="pt-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Reporting Location:</span>
                      {r.geofence_applied && r.reporting_location ? (
                        <span className="text-xs font-semibold text-sky-700 flex items-center gap-1">
                          🏢 {r.reporting_location.location_name} (Geofence Applied)
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-slate-600">
                          Not Geofenced &bull; Only Live Location Shown
                        </span>
                      )}
                    </div>

                    {/* Attendance punch details */}
                    {r.attendance && (
                      <div className="pt-1 text-[11px] text-slate-700">
                        {r.attendance.punch_in_time && (
                          <p>Punch In: <span className="font-semibold text-emerald-700">{r.attendance.punch_in_time}</span></p>
                        )}
                        {r.attendance.punch_out_time && (
                          <p>Punch Out: <span className="font-semibold text-rose-700">{r.attendance.punch_out_time}</span></p>
                        )}
                      </div>
                    )}

                    <p className="text-slate-600 text-[11px] pt-1">
                      Current Area: <span className="font-semibold text-slate-800">{loc.location_name || 'Active GPS'}</span>
                    </p>
                    <p className="text-slate-400 text-[10px]">
                      Captured: {loc.captured_at ? String(loc.captured_at).slice(0, 16) : 'Live'}
                    </p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Floating Map Legend */}
        <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-md border border-slate-200 text-[11px] space-y-1.5 max-w-xs">
          <p className="font-bold text-slate-800 uppercase text-[10px] tracking-wider border-b border-slate-100 pb-0.5">
            Map Legend
          </p>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-slate-700">Current Live Position</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border border-sky-500 bg-sky-100 shrink-0" />
            <span className="text-slate-700">Assigned Reporting Geofence (if applied)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-1 bg-sky-500 rounded shrink-0" />
            <span className="text-slate-700">Movement Path Trace</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-1 py-0.2 rounded bg-amber-500 text-white font-bold text-[9px] shrink-0">⏱️ Stop</span>
            <span className="text-slate-700">Waiting Time (&ge;10 min dwell point)</span>
          </div>
        </div>
      </div>

      {/* Day-Wise Movement & Waiting Activity Log Drawer */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
        <button
          type="button"
          onClick={() => setShowLogDrawer(!showLogDrawer)}
          className="w-full px-4 py-3 bg-slate-100/80 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-600" />
            <span>Day Movement & Waiting Log &bull; {selectedDate}</span>
            <span className="bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
              {allStops.length} Waiting Stops Detected
            </span>
          </div>
          {showLogDrawer ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {showLogDrawer && (
          <div className="p-4 space-y-4">
            {/* Employee Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayedRoutes.map(r => (
                <div
                  key={`card-${r.employee.id}`}
                  className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-2 hover:border-sky-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: r.employee.color || '#0284c7' }}
                      />
                      <span className="font-bold text-slate-900 text-xs">{r.employee.full_name}</span>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {r.employee.employee_code}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-600 space-y-1">
                    <p>
                      Reporting Geofence:{' '}
                      {r.geofence_applied && r.reporting_location ? (
                        <span className="font-bold text-sky-700">🏢 {r.reporting_location.location_name}</span>
                      ) : (
                        <span className="font-medium text-slate-400">None (Only Live GPS)</span>
                      )}
                    </p>
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span>Travel: <strong className="text-slate-900">{r.total_distance_km} km</strong></span>
                      <span>Waiting: <strong className="text-amber-700">{r.total_waiting_mins} mins</strong></span>
                      <span>Stops: <strong className="text-rose-700">{(r.stops || []).length}</strong></span>
                    </div>
                  </div>

                  {/* Button to focus map on this employee */}
                  {r.current_location && (
                    <button
                      type="button"
                      onClick={() => {
                        setMapCenter([r.current_location.latitude, r.current_location.longitude]);
                        setMapZoom(16);
                      }}
                      className="w-full mt-2 py-1 px-2 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg flex items-center justify-center gap-1 transition-colors"
                    >
                      <LocateFixed className="w-3 h-3" />
                      Focus on Live Pin
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Waiting Stops Table */}
            {allStops.length > 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    Detected Stationary Waiting Stops (&ge; 10 Minutes Stay)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Calculated from GPS coordinates & cluster dwell time
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                      <tr>
                        <th className="p-2.5">Staff</th>
                        <th className="p-2.5">Stop #</th>
                        <th className="p-2.5">Waiting Duration</th>
                        <th className="p-2.5">Time Interval</th>
                        <th className="p-2.5">Location / Area</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allStops.map((s, idx) => (
                        <tr key={`stop-row-${idx}`} className="hover:bg-slate-50/60">
                          <td className="p-2.5 font-semibold text-slate-900 flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: s.employee.color || '#0284c7' }}
                            />
                            {s.employee.full_name} ({s.employee.employee_code})
                          </td>
                          <td className="p-2.5 font-bold text-amber-700">Stop #{s.stop_number}</td>
                          <td className="p-2.5">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                              ⏱️ {s.duration_mins} mins
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-600 font-mono">
                            {String(s.start_time).slice(11, 16)} &ndash; {String(s.end_time).slice(11, 16)}
                          </td>
                          <td className="p-2.5 text-slate-700 max-w-xs truncate">{s.location_name}</td>
                          <td className="p-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setMapCenter([s.latitude, s.longitude]);
                                setMapZoom(16);
                              }}
                              className="px-2 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-50 rounded-lg border border-sky-200"
                            >
                              Focus Stop
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
                No stationary waiting stops (&gt;10 min dwell time) detected on {selectedDate}.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

