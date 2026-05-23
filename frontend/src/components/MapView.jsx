import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap } from "react-leaflet";

const WORLD_BOUNDS = [
  [-85, -180],
  [85, 180],
];

const AUTO_FOLLOW_PAUSE_MS = 3000;
const MIN_FOLLOW_ZOOM = 3.5;

// Map tile URLs
const TILE_URLS = {
  light: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};

const TILE_ATTRIBUTIONS = {
  light: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  dark: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
};

function MapBinder({ onMap }) {
  const map = useMap();

  useEffect(() => {
    onMap(map);
  }, [map, onMap]);

  return null;
}

// Sun icon for light mode
function SunIcon() {
  return (
    <svg className="mapThemeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

// Moon icon for dark mode
function MoonIcon() {
  return (
    <svg className="mapThemeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export default function MapView({ active, activeChange, markers, onSelect }) {
  const [map, setMap] = useState(null);
  const [autoFollowPaused, setAutoFollowPaused] = useState(false);
  const [mapTheme, setMapTheme] = useState("light"); // Default to light
  const pausedUntilRef = useRef(0);

  useEffect(() => {
    if (!map) return;
    const handleUserInteract = () => {
      pausedUntilRef.current = Date.now() + AUTO_FOLLOW_PAUSE_MS;
      setAutoFollowPaused(true);
    };

    map.on("dragstart", handleUserInteract);
    map.on("zoomstart", handleUserInteract);
    map.on("mousedown", handleUserInteract);
    map.on("touchstart", handleUserInteract);

    const resizeTimer = setTimeout(() => map.invalidateSize(true), 0);

    return () => {
      clearTimeout(resizeTimer);
      map.off("dragstart", handleUserInteract);
      map.off("zoomstart", handleUserInteract);
      map.off("mousedown", handleUserInteract);
      map.off("touchstart", handleUserInteract);
    };
  }, [map]);

  useEffect(() => {
    if (!autoFollowPaused) return;
    const remaining = pausedUntilRef.current - Date.now();
    const timer = setTimeout(() => setAutoFollowPaused(false), Math.max(remaining, 0));
    return () => clearTimeout(timer);
  }, [autoFollowPaused]);

  useEffect(() => {
    if (!active || !map) return;

    const lat = parseFloat(active.lat);
    const lon = parseFloat(active.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const source = activeChange?.source;
    const isAuto = source === "auto";

    if (isAuto && Date.now() < pausedUntilRef.current) {
      return;
    }

    if (!isAuto) {
      pausedUntilRef.current = 0;
      setTimeout(() => setAutoFollowPaused(false), 0);
    }

    map.stop();

    const currentZoom = map.getZoom();
    const targetZoom = Math.max(currentZoom, MIN_FOLLOW_ZOOM);

    map.flyTo([lat, lon], targetZoom, { animate: true, duration: 2.0, easeLinearity: 0.25 });
  }, [map, active?.url_hash, active?.lat, active?.lon, activeChange?.source, activeChange?.ts]);

  const toggleTheme = () => {
    setMapTheme(prev => prev === "light" ? "dark" : "light");
  };

  // Marker colors based on theme
  const markerColors = mapTheme === "light" 
    ? { active: '#6366f1', inactive: '#818cf8', fill: '#a5b4fc' }
    : { active: '#818cf8', inactive: '#a5b4fc', fill: '#c4b5fd' };

  return (
    <div className="map-wrap">
      {/* Theme toggle button */}
      <button 
        className={`mapThemeToggle ${mapTheme}`} 
        onClick={toggleTheme}
        title={`Switch to ${mapTheme === 'light' ? 'dark' : 'light'} mode`}
      >
        {mapTheme === "light" ? <MoonIcon /> : <SunIcon />}
        <span>{mapTheme === "light" ? "Dark" : "Light"}</span>
      </button>

      <MapContainer
        center={[20, 0]}
        zoom={2}
        minZoom={2}
        maxZoom={6}
        style={{ height: "100%", width: "100%" }}
        maxBounds={WORLD_BOUNDS}
        maxBoundsViscosity={1.0}
        worldCopyJump={false}
      >
        <TileLayer
          key={mapTheme} // Force re-render when theme changes
          url={TILE_URLS[mapTheme]}
          attribution={TILE_ATTRIBUTIONS[mapTheme]}
          keepBuffer={4}
        />
        
        <MapBinder onMap={setMap} />

        {markers.map((m) => {
          const isActive = m._kind === "active";
          const mLat = parseFloat(m.lat);
          const mLon = parseFloat(m.lon);
          if (!Number.isFinite(mLat) || !Number.isFinite(mLon)) return null;

          return (
            <CircleMarker
              key={m.url_hash}
              center={[mLat, mLon]}
              radius={isActive ? 8 : 4}
              pathOptions={{ 
                color: isActive ? markerColors.active : markerColors.inactive,
                fillColor: isActive ? markerColors.active : markerColors.fill,
                weight: isActive ? 3 : 1,
                opacity: isActive ? 1 : 0.7,
                fillOpacity: isActive ? 0.8 : 0.4 
              }}
              eventHandlers={{ click: () => onSelect?.(m) }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
