import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Navigation, Compass, Calendar, RefreshCw } from 'lucide-react';
import { apiRequest } from '../api';

// Fix Leaflet default icon asset paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

// Custom icon creator
const createCustomIcon = (color = '#0284c7', label = '') => {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; display: flex; items-center; justify-content: center; color: white; font-weight: bold; font-size: 11px; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3);">
        ${label ? label.slice(0, 2).toUpperCase() : '•'}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
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
  const [geofences, setGeofences] = useState([]);
  const [routeWaypoints, setRouteWaypoints] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(selectedEmployeeId);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState([28.4950, 77.0890]); // Default NCR / Delhi center
  const [mapZoom, setMapZoom] = useState(13);

  const fetchLiveData = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/tracking/live${companyId ? '?company_id=' + companyId : ''}`);
      setPositions(res.positions || []);
      setGeofences(res.geofences || []);

      if (res.geofences && res.geofences.length > 0) {
        setMapCenter([res.geofences[0].latitude, res.geofences[0].longitude]);
      } else if (res.positions && res.positions.length > 0) {
        setMapCenter([res.positions[0].latitude, res.positions[0].longitude]);
      }
    } catch (err) {
      console.error('Failed to load tracking data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRouteData = async (empId, date) => {
    if (!empId) return;
    try {
      const res = await apiRequest(`/tracking/route?employee_id=${empId}&date=${date}`);
      const waypoints = (res.waypoints || []).map(w => [w.latitude, w.longitude]);
      setRouteWaypoints(waypoints);
      if (waypoints.length > 0) {
        setMapCenter(waypoints[waypoints.length - 1]);
        setMapZoom(14);
      }
    } catch (err) {
      console.error('Failed to load route data:', err);
    }
  };

  useEffect(() => {
    fetchLiveData();
    const interval = setInterval(fetchLiveData, 20000); // Poll live pings every 20s
    return () => clearInterval(interval);
  }, [companyId]);

  useEffect(() => {
    if (selectedEmp) {
      fetchRouteData(selectedEmp, selectedDate);
    } else {
      setRouteWaypoints([]);
    }
  }, [selectedEmp, selectedDate]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-sky-600" />
          <h3 className="text-base font-bold text-slate-900">Live Employee & Geofence Map</h3>
          <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-semibold">
            {positions.length} Active Positions
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Employee Filter */}
          <select
            value={selectedEmp || ''}
            onChange={(e) => setSelectedEmp(e.target.value || null)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="">All Employees (Live Pins)</option>
            {positions.map(p => (
              <option key={p.employee_id} value={p.employee_id}>
                {p.full_name} ({p.employee_code})
              </option>
            ))}
          </select>

          {/* Date for Route Trace */}
          {selectedEmp && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700"
            />
          )}

          <button
            onClick={fetchLiveData}
            disabled={loading}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh Map Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Map Display */}
      <div className="h-[460px] w-full rounded-xl overflow-hidden border border-slate-200 relative">
        <MapContainer center={mapCenter} zoom={mapZoom} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
          <ChangeView center={mapCenter} zoom={mapZoom} />
          
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Render Geofence Boundary Circles */}
          {geofences.map(gf => (
            <Circle
              key={`gf-${gf.id}`}
              center={[gf.latitude, gf.longitude]}
              radius={gf.radius}
              pathOptions={{
                color: '#0284c7',
                fillColor: '#38bdf8',
                fillOpacity: 0.18,
                weight: 2,
                dashArray: '4, 6'
              }}
            >
              <Popup>
                <div className="text-xs space-y-1">
                  <div className="font-bold text-sky-700 flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5" />
                    Authorized Geofence
                  </div>
                  <p className="font-semibold text-slate-800">{gf.location_name}</p>
                  <p className="text-slate-500">Allowed Radius: {gf.radius} meters</p>
                  <p className="text-slate-400 text-[10px]">Lat: {gf.latitude}, Lng: {gf.longitude}</p>
                </div>
              </Popup>
            </Circle>
          ))}

          {/* Render Employee Live Location Markers */}
          {positions.map(p => (
            <Marker
              key={`pos-${p.employee_id}`}
              position={[p.latitude, p.longitude]}
              icon={createCustomIcon(p.attendance_status === 'Present' ? '#10b981' : '#0284c7', p.full_name)}
            >
              <Popup>
                <div className="text-xs space-y-1 min-w-[170px]">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
                    <p className="font-bold text-slate-900">{p.full_name}</p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">
                      {p.employee_code}
                    </span>
                  </div>
                  <p className="text-slate-500">{p.department} &bull; {p.designation}</p>

                  {p.attendance_status && (
                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className="text-slate-500">Attendance:</span>
                      <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                        p.attendance_status === 'Present' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {p.attendance_status}
                      </span>
                    </div>
                  )}

                  {p.punch_in_time && (
                    <p className="text-[11px] text-slate-600">
                      In: <span className="font-semibold text-slate-800">{p.punch_in_time}</span>
                      {p.punch_out_time && <span> &bull; Out: <span className="font-semibold text-slate-800">{p.punch_out_time}</span></span>}
                    </p>
                  )}

                  <p className="text-slate-600 font-medium">Zone: {p.location_name || 'Active Zone'}</p>
                  <p className="text-slate-400 text-[10px]">
                    Captured: {p.captured_at ? String(p.captured_at).slice(0, 16) : 'Today'}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Render Route Polyline for Selected Employee */}
          {routeWaypoints.length > 1 && (
            <Polyline
              positions={routeWaypoints}
              pathOptions={{
                color: '#f59e0b',
                weight: 4,
                opacity: 0.8
              }}
            />
          )}
        </MapContainer>

        {/* Floating Legend */}
        <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-md border border-slate-200 text-[11px] space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-700">Live Employee Position</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border border-sky-500 bg-sky-100" />
            <span className="text-slate-700">Authorized Geofence Zone</span>
          </div>
          {routeWaypoints.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-amber-500" />
              <span className="text-slate-700">Movement Route ({routeWaypoints.length} waypoints)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
