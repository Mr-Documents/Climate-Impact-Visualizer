function DarkModeToggle() {
  const toggle = () => {
    document.body.classList.toggle("dark-mode");
  };

  return (
    <button className="btn btn-outline-light ms-3" onClick={toggle}>
      🌙 Dark Mode
    </button>
  );
}

export default DarkModeToggle;
