import React from "react";
import { 
  FaCloudRain, 
  FaWater, 
  FaMapMarkedAlt, 
  FaTachometerAlt 
} from "react-icons/fa";

/**
 * WeatherIcon Component
 *
 * Supports 2 modes:
 * 1. type="flood" | "rain" | "map" | "dashboard"
 * 2. precipitation={number} → auto-select rain icon
 *
 * @param {string} type      - specific icon type
 * @param {number} size      - icon size in px
 * @param {number} precipitation - optional, auto selects rain intensity icon
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
      return <FaWater size={size} color="#0d6efd" />; // blue
    case "rain":
      return <FaCloudRain size={size} color="#20c997" />; // green
    case "map":
      return <FaMapMarkedAlt size={size} color="#ffc107" />; // yellow/orange
    case "dashboard":
      return <FaTachometerAlt size={size} color="#6610f2" />; // purple
    default:
      return <FaMapMarkedAlt size={size} />; // fallback
  }
}

export default WeatherIcon;

