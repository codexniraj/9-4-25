import React, { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import { Navigate } from "react-router-dom";
import Sidebar from "../../../components/Sidebar";
import NavbarWithCompany from "../../../components/NavbarWithCompany";
import ExcelUpload from "./ExcelUpload";
import { useUserType } from "../../../hooks/useUserType";
import useUser from "../../../hooks/useUser";
import { useWebSocketContext } from "../../../context/WebSocketProvider";
import { useCompanyContext } from "../../../context/CompanyContext";
import { FaExclamationTriangle, FaSync, FaBuilding } from "react-icons/fa";
import "./Banking.css";

function Banking() {
  const auth = useAuth();
  const { userEmail } = useUser();
  const { userType, isUserTypeLoading } = useUserType(); // Updated to use new hook structure
  const isSilver = userType === "silver";
  const { wsStatus } = useWebSocketContext();

  // Get selected company from context
  const { selectedCompany, setSelectedCompany, companies, loading } = useCompanyContext();
  
  // State to track when component needs to force re-render
  const [forceRefresh, setForceRefresh] = useState(0);
  
  // State to track current rendering company (to detect changes)
  const [currentCompany, setCurrentCompany] = useState(null);

  const [wsRefresh, setWsRefresh] = useState(0);
  
  // Implement direct company selection handler - MOVED UP before it's used
  const handleCompanyChange = (companyId) => {
    console.log("Banking - direct company change to:", companyId);
    setSelectedCompany(companyId);
    // This will also trigger the useEffect that updates currentCompany and forceRefresh
  };

  // Reconnect WebSocket manually if TallyConnector isn't up (only silver)
  const shouldShowReconnect =
    isSilver && wsStatus && wsStatus !== "Connected" && companies.length === 0;

  useEffect(() => {
    if (wsRefresh > 0 && isSilver) {
      // The WebSocket will automatically reconnect when the context value changes
      console.log("WebSocket refresh triggered");
    }
  }, [wsRefresh, isSilver]);
  
  // Monitor for company changes and update our tracking state
  useEffect(() => {
    console.log("Banking - selectedCompany changed from", currentCompany, "to", selectedCompany);
    
    if (selectedCompany !== currentCompany) {
      // Company has changed
      setCurrentCompany(selectedCompany);
      setForceRefresh(prev => prev + 1);
    }
  }, [selectedCompany, currentCompany]);
  
  // Detailed logging of component state
  console.log("Banking component rendering with:", {
    userEmail,
    userType,
    companies,
    wsStatus,
    selectedCompany,
    currentCompany,
    forceRefresh
  });

  if (auth.isLoading || isUserTypeLoading) {
    return (
      <>
        <div className="Banking-header">
          <NavbarWithCompany 
            lockCompany={true}
            selectedCompany={selectedCompany}
            setSelectedCompany={handleCompanyChange}
          />
        </div>
        <div className="Banking-container">
          <Sidebar />
          <div className="Banking-main">
            <div className="Banking-loading">
              <h2>Loading user info...</h2>
              <div className="Banking-spinner"></div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!auth.isAuthenticated) return <Navigate to="/" />;

  if (!userType) {
    return (
      <>
        <div className="Banking-header">
          <NavbarWithCompany 
            lockCompany={true}
            selectedCompany={selectedCompany}
            setSelectedCompany={handleCompanyChange}
          />
        </div>
        <div className="Banking-container">
          <Sidebar />
          <div className="Banking-main">
            <div className="Banking-content">
              <div className="alert alert-danger" role="alert">
                <h4 className="alert-heading">User Type Error</h4>
                <p>Unable to determine your user type. Please try logging in again.</p>
                <hr />
                <button 
                  className="btn btn-danger"
                  onClick={() => window.location.reload()} 
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (shouldShowReconnect) {
    return (
      <>
        <div className="Banking-header">
          <NavbarWithCompany 
            lockCompany={false}
            selectedCompany={selectedCompany}
            setSelectedCompany={handleCompanyChange}
          />
        </div>
        <div className="Banking-container">
          <Sidebar />
          <div className="Banking-main">
            <div className="Banking-content">
              <div className="Banking-connection-error">
                <FaExclamationTriangle size={50} color="#ffc107" className="mb-3" />
                <h2>Connection Required</h2>
                <p className="mb-4">Please ensure your Tally Connector is running. We are trying to connect via WebSocket.</p>
                <p className="mb-4"><strong>Current connection status:</strong> {wsStatus}</p>
                <button
                  className="btn btn-warning"
                  onClick={() => setWsRefresh((prev) => prev + 1)}
                >
                  <FaSync className="me-2" /> Retry Connection
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <div className="Banking-header">
          <NavbarWithCompany 
            lockCompany={false}
            selectedCompany={selectedCompany}
            setSelectedCompany={handleCompanyChange}
          />
        </div>
        <div className="Banking-container">
          <Sidebar />
          <div className="Banking-main">
            <div className="Banking-loading">
              <h2>Loading companies...</h2>
              <div className="Banking-spinner"></div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="Banking-header">
        <NavbarWithCompany 
          lockCompany={false}
          selectedCompany={selectedCompany}
          setSelectedCompany={handleCompanyChange}
        />
      </div>
      <div className="Banking-container">
        <Sidebar />
        <div className="Banking-main">
          <div className="Banking-content">
            {selectedCompany ? (
              <ExcelUpload 
                key={`excel-upload-${selectedCompany}-${forceRefresh}`} 
                userEmail={userEmail} 
                selectedCompany={selectedCompany} 
              />
            ) : (
              <div className="no-company-message">
                <FaBuilding size={50} color="#007bff" className="mb-3" />
                <h2>No Company Selected</h2>
                <p>Please select a company from the dropdown in the top navigation bar to continue.</p>
                <div className="alert alert-info" role="alert">
                  Once you select a company, you'll be able to upload and manage bank transaction data.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default Banking;
