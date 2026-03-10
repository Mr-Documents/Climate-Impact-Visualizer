import { FaFire, FaWater, FaCloudRain } from "react-icons/fa";

function ResultCard({ title, icon, color, children }) {
  return (
    <div className={`card border-${color} mt-4 shadow-sm`}>
      <div className={`card-header bg-${color} text-white d-flex align-items-center`}>
        <span className="me-2">{icon}</span>
        <strong>{title}</strong>
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

export default ResultCard;
