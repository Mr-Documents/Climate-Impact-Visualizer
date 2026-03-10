function LocationButton({ onSelect }) {
  const useLocation = () => {
    if (!navigator.geolocation) {
      alert("Your browser does not support geolocation");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        onSelect(lat, lon);
      },
      () => alert("Unable to get your location")
    );
  };

  return (
    <button className="btn btn-dark btn-sm mt-2" onClick={useLocation}>
      <i className="bi bi-geo-alt-fill me-1"></i>
      Use My Location
    </button>
  );
}

export default LocationButton;
