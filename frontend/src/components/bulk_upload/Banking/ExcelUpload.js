import React, { useState, useEffect, useCallback  } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./ExcelUpload.css";
import { useUserType } from "../../../hooks/useUserType"; 
import BankSelection from "./BankSelection";
import ExcelFileUpload from "./ExcelFileUpload";
import PDFUpload from "./PDFUpload";
// import useWebSocket from "../hooks/useWebSocket";
// ✅ Correct way to import default export
import { useWebSocketContext } from "../../../context/WebSocketProvider";

// Simple Modal component; style as needed.
function Modal({ show, onClose, children }) {
  if (!show) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>
          X
        </button>
        {children}
      </div>
    </div>
  );
}

export default function ExcelUpload({ userEmail, selectedCompany }) {
  // States for bank accounts and ledger options
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBankAccount, setSelectedBankAccount] = useState("");
  const [ledgerOptions, setLedgerOptions] = useState([]);
  // Array of uploads; each upload record has: uploadId, fileName, statistics, previewData, isProcessing.
  const [uploads, setUploads] = useState([]);
  // Global processing state (if needed for some global spinner)
  const [isProcessing, setIsProcessing] = useState(false);
  // Control showing of the upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const { userType, isUserTypeLoading } = useUserType();
  const navigate = useNavigate();
  const { wsStatus, pdfStatus, tempTableData , fetchTempTableData, sendData,  bankAccounts: wsBankAccounts, ledgerOptions: wsLedgerOptions ,fetchTempTables, tempTables, fetchBank, fetchLedgerOptions } = useWebSocketContext();
  
  // IMPORTANT: Reset state when selectedCompany changes
  useEffect(() => {
    console.log("ExcelUpload - Company changed, resetting state", selectedCompany);
    setBankAccounts([]);
    setSelectedBankAccount("");
    setLedgerOptions([]);
    setUploads([]);
    setIsProcessing(false);
    setShowUploadModal(false);
    
    // Force immediate data fetching for the new company
    if (userType === "gold" && selectedCompany) {
      console.log("Forcing immediate data fetch for gold user with company:", selectedCompany);
      Promise.all([
        axios.get(`/api/getBankNames?company=${selectedCompany}`)
          .then(res => setBankAccounts(res.data.bank_names || []))
          .catch(err => console.error("Error fetching bank accounts:", err)),
          
        axios.get(`/api/getUserData?company=${selectedCompany}`)
          .then(res => setLedgerOptions(res.data || []))
          .catch(err => console.error("Error fetching ledger options:", err)),
          
        axios.get(`/api/getAllTempTables?email=${userEmail}&company=${selectedCompany}`)
          .then(resp => {
            console.log("getAllTempTables response:", resp.data);
            const uploadsData = resp.data.map(row => ({
              uploadId: row.temp_table,
              fileName: row.uploaded_file,
              statistics: { totalTransactions: 0, pendingTransactions: 0, savedTransactions: 0, tallyTransactions: 0 },
              previewData: [],
              isProcessing: true,
            }));
            setUploads(uploadsData);
            // Fetch stats for each upload
            uploadsData.forEach(upload => fetchUploadStats(upload.uploadId));
          })
          .catch(err => console.error("Error fetching all uploads:", err))
      ]);
    } else if (userType === "silver" && selectedCompany) {
      console.log("Forcing immediate data fetch for silver user with company:", selectedCompany);
      fetchBank(selectedCompany, userEmail);
      fetchLedgerOptions(selectedCompany);
      if (wsStatus === "Connected") {
        fetchTempTables(userEmail, selectedCompany);
      }
    }
  }, [selectedCompany, userType, userEmail]);

  useEffect(() => {
    if (
      userType === "silver" &&
      userEmail &&
      selectedCompany &&
      wsStatus === "Connected"
    ) {
      console.log("WebSocket connected, now fetching temp tables...");
      fetchTempTables(userEmail, selectedCompany);
    }
  }, [wsStatus, userType, userEmail, selectedCompany, fetchTempTables]);
  
  // Log selectedCompany changes
  useEffect(() => {
    console.log("ExcelUpload component - selectedCompany:", selectedCompany);
  }, [selectedCompany]);

  // Fetch bank accounts and ledger options on company change (this effect is retained but
  // may be redundant with the reset effect above)
  useEffect(() => {
    console.log("Fetching bank accounts and ledger options for company:", selectedCompany);
    if (!selectedCompany) return;
    if (userType === "gold") {
      axios
        .get(`/api/getBankNames?company=${selectedCompany}`)
        .then((res) => setBankAccounts(res.data.bank_names || []))
        .catch((err) => console.error("Error fetching bank accounts:", err));
      axios
        .get(`/api/getUserData?company=${selectedCompany}`)
        .then((res) => setLedgerOptions(res.data || []))
        .catch((err) => console.error("Error fetching ledger options:", err));
    } else if (userType === "silver") {
      // For silver users, send a WebSocket message to fetch bank accounts.
      fetchBank(selectedCompany, userEmail);
      fetchLedgerOptions(selectedCompany);
    }
  }, [selectedCompany, userType, sendData, fetchBank ,fetchLedgerOptions, userEmail]);
  
  useEffect(() => {
    if (userType === "silver") {
      setBankAccounts(wsBankAccounts);
      setLedgerOptions(wsLedgerOptions);
    }
  }, [userType, wsBankAccounts, wsLedgerOptions]);

  // Function to fetch statistics (and preview data) for a given uploadId
  const fetchUploadStats = useCallback(async (uploadId) => {
    if (!uploadId) return;
    try {
      const resp = await axios.get(`/api/tempLedgers?tempTable=${uploadId}`);
      const data = resp.data;
      console.log(`Fetched previewData for ${uploadId}:`, data);
      const total = data.length;
      const pending = data.filter(
        (row) => !row.assigned_ledger || row.assigned_ledger.trim() === ""
      ).length;
      const saved = data.filter(
        (row) => row.assigned_ledger && row.assigned_ledger.trim() !== ""
      ).length;
      const tallyResp = await axios.get(`/api/tallyTransactions?tempTable=${uploadId}`);
      const tally = tallyResp.data.count || 0;
      // Update the matching upload record in state
      setUploads((prevUploads) =>
        prevUploads.map((upload) =>
          upload.uploadId === uploadId
            ? {
                ...upload,
                statistics: {
                  totalTransactions: total,
                  pendingTransactions: pending,
                  savedTransactions: saved,
                  tallyTransactions: tally,
                },
                previewData: data,
                isProcessing: false,
              }
            : upload
        )
      );
    } catch (err) {
      console.error("Error fetching stats for upload", uploadId, err);
      // Optionally mark as not processing even on error:
      setUploads((prevUploads) =>
        prevUploads.map((upload) =>
          upload.uploadId === uploadId ? { ...upload, isProcessing: false } : upload
        )
      );
    }
  },[]);

  // Load previous uploads (using getAllTempTables) when userEmail/selectedCompany change
// Inside your ExcelUpload component

// This effect triggers the fetch request for temporary tables based on user type.
useEffect(() => {
  if (userEmail && selectedCompany && userType) {
    if (userType === "gold") {
      axios
        .get(`/api/getAllTempTables?email=${userEmail}&company=${selectedCompany}`)
        .then((resp) => {
          console.log("getAllTempTables response:", resp.data);
          // Map each returned row to our upload object
          const uploadsData = resp.data.map((row) => ({
            uploadId: row.temp_table,
            fileName: row.uploaded_file,
            statistics: { totalTransactions: 0, pendingTransactions: 0, savedTransactions: 0, tallyTransactions: 0 },
            previewData: [],
            isProcessing: false,
          }));
          setUploads(uploadsData);
          // Fetch stats for each upload
          uploadsData.forEach((upload) => fetchUploadStats(upload.uploadId));
        })
        .catch((err) => console.error("Error fetching all uploads:", err));
    // } else if (userType === "silver" && wsStatus === "Connected") {
    //   // For silver users, request temp tables via WebSocket.
    //   fetchTempTables(userEmail, selectedCompany);
    }
  }
}, [userEmail, selectedCompany, userType, fetchTempTables]);

// This effect listens for changes in tempTables (from your WebSocket hook) for silver users,
// and then maps that data into your uploads state.
useEffect(() => {
  if (userType === "silver" && tempTables && tempTables.length > 0) {
    console.log("Updating uploads from tempTables:", tempTables);
    const uploadsData = tempTables.map((row) => ({
      uploadId: row.temp_table,
      fileName: row.uploaded_file,
      statistics: { totalTransactions: 0, pendingTransactions: 0, savedTransactions: 0, tallyTransactions: 0 },
      previewData: [],
      isProcessing: false,
    }));
        // Only update uploads if different from current state
    setUploads((prevUploads) => {
      const prevStr = JSON.stringify(prevUploads);
      const newStr = JSON.stringify(uploadsData);
      if (prevStr !== newStr) {
        return uploadsData;
      }
      return prevUploads;
    });
    
    // Optionally, fetch stats only when new uploads are added
    uploadsData.forEach((upload) => fetchUploadStats(upload.uploadId));
  }
}, [tempTables, userType, fetchUploadStats]);


  
  // Callback when an Excel file is uploaded successfully
  const handleUploadComplete = (uploadId, fileName) => {
    // Create new upload record and add to the top of the list
    const newUpload = {
      uploadId,
      fileName,
      statistics: { totalTransactions: 0, pendingTransactions: 0, savedTransactions: 0, tallyTransactions: 0 },
      previewData: [],
      isProcessing: true,
    };
    setUploads((prevUploads) => [newUpload, ...prevUploads]);
    fetchUploadStats(uploadId);
    setShowUploadModal(false);
  };

  // Callback when a PDF upload completes
  const handlePDFUploadComplete = (uploadId, fileName) => {
    const newUpload = {
      uploadId,
      fileName,
      statistics: { totalTransactions: 0, pendingTransactions: 0, savedTransactions: 0, tallyTransactions: 0 },
      previewData: [],
      isProcessing: true,
    };
    setUploads((prevUploads) => [newUpload, ...prevUploads]);
    fetchUploadStats(uploadId);
    setShowUploadModal(false);
  };

  // Navigate to the preview page for a specific upload
  const handlePreview = async (upload) => {
    console.log("handlePreview called with upload:", upload);
    console.log("Current user type:", userType);
    
    if (!upload.uploadId) {
      console.error("Missing uploadId in upload data", upload);
      alert("Invalid upload data. Upload ID is missing.");
      return;
    }
    
    try {
      let previewData = [];
      
      // For gold users, ensure we have the latest data by fetching directly
      if (userType === "gold") {
        console.log("Gold user: Fetching fresh data for preview");
        try {
          const url = `/api/tempLedgers?tempTable=${upload.uploadId}&_t=${Date.now()}`;
          console.log("Fetching from URL:", url);
          
          const resp = await axios.get(url);
          
          if (resp.data && Array.isArray(resp.data)) {
            previewData = resp.data;
            console.log("Successfully fetched fresh data:", previewData.length, "records");
            console.log("API Response:", resp.data);
          } else {
            console.warn("API returned non-array data:", resp.data);
            previewData = []; // Ensure it's an empty array if invalid
          }
        } catch (err) {
          console.error("Error fetching fresh data:", err);
          // Continue with empty data
        }
      } else if (userType === "silver") {
        // Silver user: use WebSocket
        console.log("Silver user: Requesting data via WebSocket");
        fetchTempTableData(upload.uploadId);
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for WebSocket
        previewData = tempTableData || [];
      }
      
      // Common navigation logic
      console.log("Navigating to preview with data:", {
        tempTable: upload.uploadId,
        userType,
        selectedCompany,
        previewDataLength: previewData.length
      });
      
      // Update statistics based on fetched data
      const total = previewData.length;
      const pending = previewData.filter((row) => !row.assigned_ledger || row.assigned_ledger.trim() === "").length;
      const saved = previewData.filter((row) => row.assigned_ledger && row.assigned_ledger.trim() !== "").length;
      
      const currentStats = {
        totalTransactions: total,
        pendingTransactions: pending,
        savedTransactions: saved,
        tallyTransactions: upload.statistics.tallyTransactions || 0,
      };
      
      // Navigate with complete state
      navigate("/preview", {
        state: {
          previewData: previewData,
          statistics: currentStats,
          ledgerOptions,
          tempTable: upload.uploadId,
          userEmail,
          selectedCompany,
          selectedBankAccount,
          wsStatus,
          pdfStatus,
        },
      });
    } catch (err) {
      console.error("Error in handlePreview:", err);
      alert("Error preparing preview. Please try again.");
    }
  };

  // Optional: reset upload session (for starting a completely new upload session)
  // const resetUploadSession = () => {
  //   // If needed, you can clear uploads here; for our flow, we want to preserve previous uploads.
  //   console.log("Ready for a new file upload");
  // };

  return (
    <div className="excel-upload">
      <h2>Upload Excel Data</h2>
      
      {/* Upload control area */}
      <div className="upload-control">
        <button onClick={() => setShowUploadModal(true)} className="new-upload-button">
          New Upload
        </button>
        <div className="status-indicators">
          <p>
            <strong>PDF Upload Status:</strong> {pdfStatus}
          </p>
          <p>
            <strong>WebSocket Status:</strong> {wsStatus}
          </p>
        </div>
      </div>

      {/* Upload Modal */}
      <Modal show={showUploadModal} onClose={() => setShowUploadModal(false)}>
        <h3>Select File to Upload</h3>
        {selectedCompany && (
          <BankSelection
            bankAccounts={bankAccounts}
            selectedBankAccount={selectedBankAccount}
            onChange={setSelectedBankAccount}
          />
        )}
        <ExcelFileUpload
          userEmail={userEmail}
          selectedCompany={selectedCompany}
          selectedBankAccount={selectedBankAccount}
          onUploadComplete={handleUploadComplete}
          setIsProcessing={setIsProcessing}
        />
        <PDFUpload
          userEmail={userEmail}
          selectedCompany={selectedCompany}
          selectedBankAccount={selectedBankAccount}
          sendData={sendData}
          wsStatus={wsStatus}
          onPDFUploadComplete={handlePDFUploadComplete}
          setIsProcessing={setIsProcessing}
          userType={userType}
        />
      </Modal>

      {/* Global processing spinner */}
      {isProcessing && <div className="global-spinner">Processing... Please wait</div>}

      {/* Display a widget for each upload */}
      <div className="upload-widgets">
        {uploads.map((upload) => (
          <div
            key={upload.uploadId}
            className="file-widget"
            onClick={() => handlePreview(upload)}
            style={{
              cursor: "pointer",
              border: "1px solid #ccc",
              padding: "10px",
              margin: "10px 0",
              borderRadius: "8px",
              backgroundColor: "#f8f9fa",
            }}
          >
            <p>
              <strong>File Uploaded:</strong> {upload.fileName}
            </p>
            <p>Click this box to view preview on a new page</p>
            {upload.isProcessing ? (
              <div className="processing-message">Processing... Please wait.</div>
            ) : (
              <div className="statistics-grid">
                <div className="stat-card total">
                  <h4>Total Transactions</h4>
                  <p>{upload.statistics.totalTransactions}</p>
                </div>
                <div className="stat-card pending">
                  <h4>Pending Transactions</h4>
                  <p>{upload.statistics.pendingTransactions}</p>
                </div>
                <div className="stat-card saved">
                  <h4>Saved Transactions</h4>
                  <p>{upload.statistics.savedTransactions}</p>
                </div>
                <div className="stat-card tally">
                  <h4>Sent to Tally</h4>
                  <p>{upload.statistics.tallyTransactions}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
