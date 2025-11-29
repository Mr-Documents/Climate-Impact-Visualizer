import React from "react";
import { FaFire, FaCloudRain, FaWater, FaMapMarkedAlt, FaTachometerAlt } from "react-icons/fa";

/**
 * WeatherIcon Component
 * @param {string} type - "wildfire", "flood", "rain", "map", "dashboard"
 * @param {number} size - icon size in px
 */
function WeatherIcon({ type, size = 24 }) {
  switch (type) {
    case "wildfire":
      return <FaFire size={size} color="#dc3545" />; // red
    case "flood":
      return <FaWater size={size} color="#0d6efd" />; // blue
    case "rain":
      return <FaCloudRain size={size} color="#20c997" />; // green
    case "map":
      return <FaMapMarkedAlt size={size} color="#ffc107" />; // yellow/orange
    case "dashboard":
      return <FaTachometerAlt size={size} color="#6610f2" />; // purple
    default:
      return <FaMapMarkedAlt size={size} />; // fallback icon
  }
}

export default WeatherIcon;
