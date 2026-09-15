import Modal from "react-bootstrap/Modal";
import { useNavigate } from "react-router-dom";
import { FaSignOutAlt } from "react-icons/fa";
import { useAuth } from "../../auth/authcontext";
import "./logoutmodal.css";

function LogoutModal() {
  const { user, isLogoutPromptOpen, cancelLogout, logout } = useAuth();
  const navigate = useNavigate();

  const handleConfirm = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <Modal show={isLogoutPromptOpen && Boolean(user)} onHide={cancelLogout} centered>
      <Modal.Body className="text-center p-4 p-sm-5">
        <div className="logout-modal-icon mx-auto mb-3">
          <FaSignOutAlt size={22} />
        </div>
        <h2 className="h5 fw-bold mb-2">Log out?</h2>
        <p className="text-muted mb-4">
          Are you sure you want to log out
          {user?.fullName ? `, ${user.fullName}` : ""}? You'll need to log in again to access
          your account.
        </p>
        <div className="d-flex flex-column-reverse flex-sm-row justify-content-center gap-2">
          <button type="button" className="btn btn-light border px-4" onClick={cancelLogout}>
            No, stay
          </button>
          <button type="button" className="btn btn-danger px-4" onClick={handleConfirm} autoFocus>
            Yes, log out
          </button>
        </div>
      </Modal.Body>
    </Modal>
  );
}

export default LogoutModal;
