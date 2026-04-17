// src/components/map/mapview.jsx
import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Import marker assets directly for better bundler compatibility
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIconRetina from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Fix marker icon issue with Leaflet in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIconRetina,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Helper component to update map center when lat/lon props change from external inputs
function MapRecenter({ lat, lon, bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.flyToBounds(bounds, { padding: [20, 20], duration: 1.5 });
    } else {
      // Smoothly fly to point; if zoomed out too far, zoom in to a reasonable level
      const targetZoom = map.getZoom() < 7 ? 10 : map.getZoom();
      map.flyTo([lat, lon], targetZoom, { duration: 1.5 });
    }
  }, [lat, lon, bounds, map]);
  return null;
}

// Child component to handle clicks
function ClickableMarker({ onSelect, initialPosition }) {
  const [position, setPosition] = useState(null);

  // Sync internal marker position when parent coordinates change (e.g., after search)
  useEffect(() => {
    if (initialPosition && initialPosition[0] !== undefined) {
      setPosition([initialPosition[0], initialPosition[1]]);
    }
  }, [initialPosition]); 

  useMapEvents({
    click(e) {
      if (!onSelect) return;
      // Normalize longitude to -180 to 180 range to prevent backend errors/N/A
      const wrapped = e.latlng.wrap();
      const { lat, lng } = wrapped;
      setPosition([lat, lng]);
      onSelect(lat, lng);
    },
  });

  if (!position) return null;
  return <Marker position={position} />;
}

/**
 * UnifiedMap Component
 * @param {number} lat - initial latitude
 * @param {number} lon - initial longitude
 * @param {Array} bounds - optional geographic boundaries [[minLat, minLon], [maxLat, maxLon]]
 * @param {function} onSelect - optional callback when user clicks map
 * @param {ReactNode} children - optional overlays like FireSimulation / DrynessHeatmap
 */
function UnifiedMap({ lat = 5.6037, lon = -0.1870, bounds, onSelect, children }) {
  return (
    <div style={{ height: "400px", width: "100%", marginTop: "20px" }}>
      <MapContainer center={[lat, lon]} zoom={7} style={{ height: "100%", width: "100%" }} attributionControl={false}>
        <MapRecenter lat={lat} lon={lon} bounds={bounds} />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
          attribution=''
        />
        <ClickableMarker onSelect={onSelect} initialPosition={[lat, lon]} />
        {children /* Render FireSimulation, DrynessHeatmap, etc. */}
      </MapContainer>
    </div>
  );
}

export default UnifiedMap;
