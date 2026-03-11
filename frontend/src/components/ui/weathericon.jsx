import React from "react";
import {
  FaCloudRain,
  FaWater,
  FaMapMarkedAlt,
  FaTachometerAlt,
  FaTemperatureHigh,
  FaTint,
  FaExclamationTriangle,
  FaCloudSun,
  FaWind,
} from "react-icons/fa";

/**
 * WeatherIcon Component
 *
 * Supports 2 modes:
 * 1. type="flood" | "rain" | "map" | "dashboard" | "temp" | "soil" | "alert"
 * 2. precipitation={number} → auto-select rain icon
 *
 * @param {string} type      - specific icon type
 * @param {number} size      - icon size in px
 * @param {number} precipitation - optional, auto selects rain icon
 */
function WeatherIcon({ type, size = 24, precipitation = null }) {
  // --- AUTO MODE: If precipitation is provided, choose icon dynamically ---
  if (precipitation !== null) {
    if (precipitation > 5) {
      return <FaCloudRain size={size} color="#0d6efd" />; // heavy rain (blue)
    }
    if (precipitation > 0.2) {
      return <FaCloudRain size={size} color="#20c997" />; // normal rain (green)
    }
    if (precipitation > 0) {
      return <FaCloudRain size={size} color="#6c757d" />; // drizzle (gray)
    }
    return <FaCloudRain size={size} color="#adb5bd" />; // no-rain faded
  }

  // --- STATIC ICON MODE ---
  switch (type) {
    case "flood":
      return <FaWater size={size} color="#0d6efd" />;
    case "rain":
      return <FaCloudRain size={size} color="#20c997" />;
    case "map":
      return <FaMapMarkedAlt size={size} color="#ffc107" />;
    case "dashboard":
      return <FaTachometerAlt size={size} color="#6610f2" />;
    case "temp":
      return <FaTemperatureHigh size={size} color="#dc3545" />;
    case "soil":
      return <FaTint size={size} color="#0d6efd" />;
    case "alert":
      return <FaExclamationTriangle size={size} color="#dc3545" />;
    case "sun":
      return <FaCloudSun size={size} color="#ffc107" />;
    case "wind":
      return <FaWind size={size} color="#0dcaf0" />;
    default:
      return <FaMapMarkedAlt size={size} />;
  }
}

export default WeatherIcon;

