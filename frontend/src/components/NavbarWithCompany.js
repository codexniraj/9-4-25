import React, { useEffect } from "react";
import 'bootstrap/dist/css/bootstrap.min.css';
import { FaBuilding, FaSignOutAlt } from "react-icons/fa";
import './NavbarWithCompany.css'; // Add a new CSS file for custom navbar styling

// 🧠 Custom Hooks
import useUser from "../hooks/useUser";
import { useUserType } from "../hooks/useUserType";
import useCompanies from "../hooks/useCompanies";
import useSelectedCompany from "../hooks/useSelectedCompany";
import useLogout from "../hooks/useLogout";

function NavbarWithCompany({ 
  lockCompany = false, 
  selectedCompany: propSelectedCompany = null, 
  setSelectedCompany: propSetSelectedCompany = null 
}) {
  const { userEmail } = useUser(); // stores email in sessionStorage
  const { userType, isUserTypeLoading } = useUserType(); // gets "silver", "gold", "trial"
  const { companies, loading } = useCompanies(userEmail, userType); // fetches company list
  const { logout } = useLogout(); // get the logout function from our custom hook
  
  // Add debug logging for userType
  useEffect(() => {
    console.log("NavbarWithCompany - userType:", userType);
  }, [userType]);
  
  // Use internal hook only if props are not provided
  const {
    selectedCompany: internalSelectedCompany,
    companyName: internalCompanyName,
    handleCompanyChange: internalHandleCompanyChange,
  } = useSelectedCompany(companies); // manages selection & sessionStorage

  // Determine which values to use (props take precedence)
  const selectedCompany = propSelectedCompany !== null ? propSelectedCompany : internalSelectedCompany;
  const companyName = propSelectedCompany !== null ? 
    companies.find(c => c.company_id === propSelectedCompany)?.company_name : 
    internalCompanyName;

  // Handle company change - call prop function if provided, otherwise use internal
  const handleCompanyChange = (e) => {
    const newValue = e.target.value;
    console.log("NavbarWithCompany - Company selection changed to:", newValue);
    console.log("Using prop function?", propSetSelectedCompany ? "Yes" : "No");
    
    if (propSetSelectedCompany) {
      propSetSelectedCompany(newValue);
      // Also update sessionStorage for consistency
      sessionStorage.setItem('selectedCompany', newValue);
      console.log("Updated sessionStorage with new company:", newValue);
    } else {
      internalHandleCompanyChange(e);
    }
  };

  // Get the badge color based on user type
  const getUserTypeColor = () => {
    switch(userType) {
      case 'gold':
        return 'warning';
      case 'silver':
        return 'secondary';
      case 'trial':
        return 'info';
      default:
        return 'light';
    }
  };

  return (
    <nav className="custom-navbar">
      <div className="container-fluid">
        <div className="navbar-content">
          <div className="navbar-brand">
            <FaBuilding size={20} />
            <span className="brand-text">Tallyfy.ai</span>
          </div>

          <div className="navbar-middle">
            {/* Company Name Badge */}
            {companyName && (
              <span className="badge bg-success company-badge">
                {companyName}
              </span>
            )}

            {/* User Type Badge */}
            <span className={`badge bg-${getUserTypeColor()} user-type-badge`}>
              {isUserTypeLoading 
                ? 'LOADING...' 
                : userType 
                  ? userType.toUpperCase() 
                  : 'UNKNOWN'}
            </span>
          </div>

          <div className="navbar-right">
            <div className="company-selector">
              <label>Company:</label>
              {loading ? (
                <span className="loading-text">Loading...</span>
              ) : (
                <select
                  className="form-select"
                  value={selectedCompany}
                  onChange={handleCompanyChange}
                  disabled={lockCompany}
                >
                  <option value="">Select</option>
                  {companies.map((c) => (
                    <option key={c.company_id} value={c.company_id}>
                      {c.company_name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* User Email Badge */}
            {userEmail && (
              <span className="badge bg-primary user-email-badge">
                {userEmail}
              </span>
            )}

            {/* Logout Button */}
            <button 
              className="btn btn-outline-danger logout-btn"
              onClick={logout}
            >
              <FaSignOutAlt />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default NavbarWithCompany;
