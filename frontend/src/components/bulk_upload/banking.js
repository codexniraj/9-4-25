// src/components/Dashboard.js
import React, { useState, useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { Navigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import CompanySelect from "../components/CompanySelect";
import ExcelUpload from "../components/ExcelUpload";
import { useUserType } from "../hooks/useUserType";
import "./Banking.css";

function Banking() {
  const auth = useAuth();
  const userType = useUserType(); // "gold" or "silver"
  const isSilver = userType === "silver";
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [wsStatus, setWsStatus] = useState("disconnected");
  const [wsRefresh, setWsRefresh] = useState(0);

  // Open websocket connection only for silver users.
  // Adding wsRefresh to the dependency array triggers a reconnect.
  useEffect(() => {
    let ws;
    if (isSilver) {
      ws = new WebSocket("ws://localhost:8000");
      ws.onopen = () => {
        setWsStatus("connected");
      };
      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        setWsStatus("error");
      };
      ws.onclose = () => {
        setWsStatus("disconnected");
      };
    }
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [isSilver, wsRefresh]);

  if (auth.isLoading) {
    return <div>Loading user info...</div>;
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/" />;
  }

  const userEmail = auth.user?.profile?.email || "";

  // For silver users, if the websocket connection isn't established, show a warning with a reconnect button.
  if (isSilver && wsStatus !== "connected") {
    return (
      <div className="Banking-container">
        <Sidebar />
        <div className="Banking-main">
          <h2>Please ensure your Tally Connector is running</h2>
          <p>
            We are trying to connect via WebSocket. Please make sure Tally Connector is on.
          </p>
          <p>Current connection status: {wsStatus}</p>
          <button
            onClick={() => setWsRefresh((prev) => prev + 1)}
            style={{
              padding: "10px 20px",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer"
            }}
          >
            Reconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="Banking-container">
      <Sidebar />
      <div className="Banking-main">
        {!selectedCompany ? (
          <CompanySelect userEmail={userEmail} onSelect={setSelectedCompany} userType={userType}   />
        ) : (
          <ExcelUpload userEmail={userEmail} selectedCompany={selectedCompany} />
        )}
      </div>
    </div>
  );
}

export default Banking;
