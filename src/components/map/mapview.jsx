import React, { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix marker icon issue with Leaflet in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

// Child component to handle clicks
function ClickableMarker({ onSelect, initialPosition }) {
  const [position, setPosition] = useState(initialPosition);

  useMapEvents({
    click(e) {
      if (!onSelect) return; // Only respond if interactive
      const { lat, lng } = e.latlng;
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
 * @param {function} onSelect - optional callback when user clicks map
 */
function UnifiedMap({ lat = 5.6037, lon = -0.1870, onSelect }) {
  return (
    <div style={{ height: "400px", width: "100%", marginTop: "20px" }}>
      <MapContainer center={[lat, lon]} zoom={7} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ClickableMarker onSelect={onSelect} initialPosition={[lat, lon]} />
      </MapContainer>
    </div>
  );
}

export default UnifiedMap;
