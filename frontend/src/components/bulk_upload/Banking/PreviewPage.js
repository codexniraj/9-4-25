import React, { useState, useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { useUserType } from "../../../hooks/useUserType";
import { useWebSocketContext } from "../../../context/WebSocketProvider.js";

const PreviewPage = () => {
  // Context and router hooks
  const { tempTableData, fetchTempTableData, sendToTallyMessage, sendUpdateMessage, wsRef } = useWebSocketContext();
  const location = useLocation();
  const navigate = useNavigate();
  const { userType, isUserTypeLoading } = useUserType();
  
  // Refs for managing component lifecycle
  const isMounted = useRef(true);
  const hasInitialized = useRef(false);
  const hasFetchedTempTableData = useRef(false);

  // Component state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState({});
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false);

  // Extract data from location state
  const locationState = location.state || {};
  const {
    previewData: initialPreviewData = [],
    statistics: initialStatistics = {
      totalTransactions: 0,
      pendingTransactions: 0,
      savedTransactions: 0,
      tallyTransactions: 0,
    },
    ledgerOptions: initialLedgerOptions = [],
    tempTable,
    selectedCompany,
  } = locationState;

  // Component state for data
  const [previewData, setPreviewData] = useState(initialPreviewData);
  const [statistics, setStatistics] = useState(initialStatistics);
  const [ledgerOptions, setLedgerOptions] = useState(initialLedgerOptions);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState([]);

  // Filter states
  const [filters, setFilters] = useState({
    hideTallySynced: false,
    savedRecords: false,
    blankRecords: false,
    unsavedRecords: false,
  });

  const [columnFilters, setColumnFilters] = useState({
    dateFrom: "",
    dateTo: "",
    description: "",
    type: "",
    amountFrom: "",
    amountTo: "",
    assignedLedger: "",
  });

  // Add a state to force re-render when needed
  const [forceRefresh, setForceRefresh] = useState(0);

  // Helper function to format dates
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      // Log the date for debugging
      console.log("Formatting date:", dateStr, "type:", typeof dateStr);
      
      // Handle different date formats
      let dateToFormat = dateStr;
      
      // If it's a timestamp (number), convert to string
      if (typeof dateStr === 'number') {
        dateToFormat = new Date(dateStr).toISOString();
      }
      
      // If it's an object with a date property (common in some APIs)
      if (typeof dateStr === 'object' && dateStr !== null) {
        console.log("Date is an object:", dateStr);
        if (dateStr.date) {
          dateToFormat = dateStr.date;
        } else if (dateStr.toString) {
          dateToFormat = dateStr.toString();
        }
      }
      
      // Now try to create a date object
      const date = new Date(dateToFormat);
      if (isNaN(date.getTime())) {
        console.log("Invalid date encountered:", dateStr);
        return String(dateStr); // Return the original as string if not valid date
      }
      
      // Format with day/month/year
      return date.toLocaleDateString("en-GB", {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (e) {
      console.error("Error formatting date:", e, "for date:", dateStr);
      return String(dateStr);
    }
  };

  // Clean up when component unmounts
  useEffect(() => {
    // Set isMounted to true when component mounts
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
      console.log("PreviewPage component unmounted");
    };
  }, []);

  // MAIN DATA FETCHING FUNCTION - API approach for gold users
  const fetchTempDataFromAPI = useCallback(async () => {
    if (!tempTable) {
      console.error("No temp table available");
      setError("No temporary table ID was provided");
      setIsLoading(false);
      return;
    }
    
    console.log("Fetching data via API for tempTable:", tempTable);
    setIsLoading(true);
    setError(null);
    
    try {
      // Simple direct API call - this matches the pattern in the user's example code
      const resp = await axios.get(`/api/tempLedgers?tempTable=${encodeURIComponent(tempTable)}`);
      console.log("Fetched previewData in PreviewPage:", resp.data);
      
      // Debug the raw data structure
      if (resp.data && resp.data.length > 0) {
        console.log("DATA STRUCTURE DEBUG:");
        console.log("First row raw data:", JSON.stringify(resp.data[0], null, 2));
        console.log("Date field:", resp.data[0].transaction_date || resp.data[0].date);
        console.log("Date field type:", typeof (resp.data[0].transaction_date || resp.data[0].date));
        console.log("Ledger field:", resp.data[0].assigned_ledger);
        console.log("Ledger field type:", typeof resp.data[0].assigned_ledger);
        
        // Check all possible field names that might contain date information
        const possibleDateFields = ['transaction_date', 'date', 'trans_date', 'txn_date', 'created_at'];
        console.log("Checking all possible date fields:");
        possibleDateFields.forEach(field => {
          if (resp.data[0][field] !== undefined) {
            console.log(`Field "${field}" exists with value:`, resp.data[0][field], "type:", typeof resp.data[0][field]);
          }
        });
        
        // Check all possible field names that might contain ledger information
        const possibleLedgerFields = ['assigned_ledger', 'ledger', 'ledger_name', 'ledger_id'];
        console.log("Checking all possible ledger fields:");
        possibleLedgerFields.forEach(field => {
          if (resp.data[0][field] !== undefined) {
            console.log(`Field "${field}" exists with value:`, resp.data[0][field], "type:", typeof resp.data[0][field]);
          }
        });
      }
      
      // Check if component is still mounted before updating state
      if (!isMounted.current) {
        console.log("Component unmounted during API call, aborting");
        return;
      }
      
      // Process the data with original ledger info for tracking changes
      const dataWithOriginal = resp.data.map((row, index) => {
        // Log every 10th row for debugging (to avoid console spam)
        if (index % 10 === 0) {
          console.log(`Processing row ${index}:`, row);
        }
        
        // Extract and normalize date fields
        let transactionDate = null;
        
        // Try several possible date field names
        if (row.transaction_date) transactionDate = row.transaction_date;
        else if (row.date) transactionDate = row.date;
        else if (row.trans_date) transactionDate = row.trans_date;
        else if (row.txn_date) transactionDate = row.txn_date;
        else if (row.created_at) transactionDate = row.created_at;
        
        console.log(`Row ${index} date extraction:`, { 
          original: row.transaction_date || row.date || row.trans_date,
          extracted: transactionDate 
        });
        
        // If we have a date field but it's not properly recognized
        if (transactionDate && typeof transactionDate === 'string') {
          // Try to fix common date format issues
          if (transactionDate.includes('/')) {
            // Handle DD/MM/YYYY format
            const parts = transactionDate.split('/');
            if (parts.length === 3) {
              transactionDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
          }
        }
        
        // Extract and normalize ledger fields
        let assignedLedger = null;
        
        // Try several possible ledger field names
        if (row.assigned_ledger !== undefined) assignedLedger = row.assigned_ledger;
        else if (row.ledger !== undefined) assignedLedger = row.ledger;
        else if (row.ledger_name !== undefined) assignedLedger = row.ledger_name;
        
        if (index % 10 === 0) {
          console.log(`Row ${index} ledger extraction:`, { 
            original: row.assigned_ledger || row.ledger || row.ledger_name,
            extracted: assignedLedger 
          });
        }
        
        return {
        ...row,
          id: row.id || row._id || `temp_${Math.random().toString(36).substring(2, 9)}`,
          transaction_date: transactionDate,
          assigned_ledger: assignedLedger || "",
          originalAssignedLedger: assignedLedger || "",
        };
      });

      console.log("Processed data (first 3 rows):", dataWithOriginal.slice(0, 3));
      
      // Update state with the fetched data
      setPreviewData(dataWithOriginal);
      setSelectedTransactions([]);
      
      // Calculate statistics
      const total = dataWithOriginal.length;
      const pending = dataWithOriginal.filter((row) => !row.assigned_ledger).length;
      const saved = dataWithOriginal.filter((row) => row.assigned_ledger && row.assigned_ledger.trim() !== "").length;
      
      // Update statistics
      setStatistics({
        totalTransactions: total,
        pendingTransactions: pending,
        savedTransactions: saved,
        tallyTransactions: 0, // Will be updated by next API call
      });
      
      // Get tally transaction count
      try {
        const tallyResp = await axios.get(`/api/tallyTransactions?tempTable=${encodeURIComponent(tempTable)}`);
        if (isMounted.current) {
      setStatistics((prev) => ({
        ...prev,
        tallyTransactions: tallyResp.data.count || 0,
      }));
        }
      } catch (tallyErr) {
        console.error("Error fetching tally transactions:", tallyErr);
      }
      
      // Clear loading state
      if (isMounted.current) {
        setError(null);
        setIsLoading(false);
        hasInitialized.current = true;
      }
    } catch (err) {
      console.error("Error fetching preview data:", err);
      if (isMounted.current) {
        setError(`Error loading data: ${err.message || "Unknown error"}`);
        setIsLoading(false);
      }
    }
  }, [tempTable]);

  // Event handlers
  const handleLedgerChange = useCallback((e, idx) => {
    const newData = [...previewData];
    newData[idx].assigned_ledger = e.target.value;
    setPreviewData(newData);
    setHasUnsavedChanges(true);
  }, [previewData]);

  const handleTypeChange = useCallback((e, idx) => {
    const newData = [...previewData];
    newData[idx].transaction_type = e.target.value;
    setPreviewData(newData);
    setHasUnsavedChanges(true);
  }, [previewData]);

  const toggleSelectTransaction = useCallback((transactionId) => {
    setSelectedTransactions((prevSelected) => {
      if (prevSelected.includes(transactionId)) {
        return prevSelected.filter((id) => id !== transactionId);
      } else {
        return [...prevSelected, transactionId];
      }
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedTransactions.length === previewData.length) {
      setSelectedTransactions([]);
    } else {
      const allIds = previewData.map((row) => row.id);
      setSelectedTransactions(allIds);
    }
  }, [selectedTransactions.length, previewData]);

  const handleBulkAssign = useCallback((ledger) => {
    if (!ledger) return;
    const newData = previewData.map((row) =>
      selectedTransactions.includes(row.id)
        ? { ...row, assigned_ledger: ledger }
        : row
    );
    setPreviewData(newData);
    setHasUnsavedChanges(true);
  }, [previewData, selectedTransactions]);

  const handleSendToTally = useCallback(async () => {
    if (hasUnsavedChanges) {
      alert("Please save your changes before sending to Tally.");
      return;
    }
    if (!tempTable || !selectedCompany) {
      alert("Please ensure company is selected and data is loaded.");
      return;
    }
    
    setIsLoading(true);
    try {
      if (userType === "gold") {
        const response = await axios.post("/api/sendToTally", {
          company: selectedCompany,
          tempTable: tempTable,
          selectedTransactions: selectedTransactions.length > 0 ? selectedTransactions : null,
        });
        console.log("Sent to Tally response:", response.data);
        alert("Data successfully sent to Tally!");
        fetchTempDataFromAPI();
      } else if (userType === "silver") {
        sendToTallyMessage(selectedCompany, tempTable, selectedTransactions);
        console.log("Sent send_to_tally message via WebSocket.");
      }
    } catch (err) {
      console.error("Error sending to Tally:", err);
      alert("Error sending data to Tally. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [
    hasUnsavedChanges,
    tempTable,
    selectedCompany,
    userType,
    selectedTransactions,
    fetchTempDataFromAPI,
    sendToTallyMessage
  ]);

  const handleDeleteTransaction = useCallback(async (transactionId) => {
    if (!tempTable) {
      alert("Temp table not available.");
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await axios.post("/api/deleteTransaction", {
        tempTable,
        transactionId,
      });
      console.log("Delete response:", response.data);
      alert("Transaction deleted successfully.");
      fetchTempDataFromAPI();
    } catch (err) {
      console.error("Error deleting transaction:", err);
      alert("Error deleting transaction. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [tempTable, fetchTempDataFromAPI]);

  // Filter functions
  const applyGeneralFilters = useCallback((data) => {
    return data.filter((row) => {
      if (filters.hideTallySynced && row.status === "sent") return false;
      if (filters.savedRecords && (!row.assigned_ledger || row.assigned_ledger.trim() === "")) return false;
      if (filters.blankRecords && row.assigned_ledger && row.assigned_ledger.trim() !== "") return false;
      if (filters.unsavedRecords && row.assigned_ledger === row.originalAssignedLedger) return false;
      return true;
    });
  }, [filters]);

  const applyColumnFilters = useCallback((data) => {
    return data.filter((row) => {
      try {
        if (columnFilters.dateFrom && row.transaction_date) {
        const fromDate = new Date(columnFilters.dateFrom);
        const rowDate = new Date(row.transaction_date);
        if (rowDate < fromDate) return false;
      }
        if (columnFilters.dateTo && row.transaction_date) {
        const toDate = new Date(columnFilters.dateTo);
        const rowDate = new Date(row.transaction_date);
        if (rowDate > toDate) return false;
      }
        if (columnFilters.description && row.description) {
        if (!row.description.toLowerCase().includes(columnFilters.description.toLowerCase()))
          return false;
      }
        if (columnFilters.type && row.transaction_type) {
        if (row.transaction_type !== columnFilters.type) return false;
      }
        if (columnFilters.amountFrom && row.amount) {
        if (parseFloat(row.amount) < parseFloat(columnFilters.amountFrom)) return false;
      }
        if (columnFilters.amountTo && row.amount) {
        if (parseFloat(row.amount) > parseFloat(columnFilters.amountTo)) return false;
      }
      if (columnFilters.assignedLedger) {
        if (row.assigned_ledger !== columnFilters.assignedLedger) return false;
      }
      return true;
      } catch (e) {
        console.error("Error applying filters:", e);
        return true;
      }
    });
  }, [columnFilters]);

  // Calculate filtered data only when necessary
  const filteredData = React.useMemo(() => {
    // Ensure we're filtering valid data and log any potential issues
    if (!Array.isArray(previewData)) {
      console.error("previewData is not an array:", previewData);
      return [];
    }
    
    // Apply filters and handle any potential errors
    try {
      return applyColumnFilters(applyGeneralFilters(previewData));
    } catch (err) {
      console.error("Error applying filters:", err);
      return [];
    }
  }, [previewData, applyGeneralFilters, applyColumnFilters, forceRefresh]);

  const handleColumnFilterChange = useCallback((filterName, value) => {
    setColumnFilters((prev) => ({
      ...prev,
      [filterName]: value,
    }));
  }, []);

  const handleFilterChange = useCallback((filterName) => {
    setFilters((prev) => ({
      ...prev,
      [filterName]: !prev[filterName],
    }));
  }, []);

  const handleSaveUpdates = useCallback(async () => {
    if (!previewData || previewData.length === 0) {
      console.warn("No preview data to update");
      return;
    }
    if (!tempTable) {
      console.warn("No temp table available for saving updates");
      return;
    }
    
    setIsLoading(true);
    try {
    const updatedData = previewData.map((row) => ({
      transaction_date: row.transaction_date,
      transaction_type: row.transaction_type,
      description: row.description,
      amount: row.amount,
      assignedLedger: row.assigned_ledger,
      email: row.email,
      company: row.company,
      bank_account: row.bank_account,
    }));
      
      if (userType === "gold") {
        const resp = await axios.post("/api/updateTempExcel", {
          tempTable: tempTable,
          data: updatedData,
        });
        console.log("Updated data in temp table:", resp.data);
      } else if (userType === "silver") {
        sendUpdateMessage(tempTable, updatedData);
        console.log("Sent update message via WebSocket.");
      }
      
      setHasUnsavedChanges(false);
      alert("Changes saved successfully.");
      
      if (userType === "gold") {
        fetchTempDataFromAPI();
      } else if (userType === "silver") {
        fetchTempTableData(tempTable);
      }
    } catch (err) {
      console.error("Error updating temp table:", err);
      alert("Error saving changes. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [previewData, tempTable, userType, fetchTempDataFromAPI, fetchTempTableData, sendUpdateMessage]);

  const handleRetryFetch = useCallback(() => {
    console.log("Retry fetch - Component mounted status:", isMounted.current);
    if (!isMounted.current) return;
    
    setIsLoading(true);
    setError(null);
    setShowTimeoutMessage(false);
    console.log("Manually retrying data fetch for tempTable:", tempTable);
    
    if (userType === "gold") {
        fetchTempDataFromAPI();
    } else if (userType === "silver") {
      fetchTempTableData(tempTable);
    }
  }, [tempTable, fetchTempDataFromAPI, fetchTempTableData, userType]);

  // Set a timeout to show the retry message if loading takes too long
  useEffect(() => {
    let timeoutId;
    if (isLoading) {
      timeoutId = setTimeout(() => {
        setShowTimeoutMessage(true);
      }, 5000); // 5 seconds
    }
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isLoading]);

  // INITIALIZATION EFFECT
  useEffect(() => {
    // Skip if component is unmounted
    if (!isMounted.current) return;
    
    // If user type is still loading, wait for it
    if (isUserTypeLoading) {
      console.log("Waiting for user type to be determined...");
      return;
    }

    console.log("PreviewPage effect fired:", { tempTable, userType });
    
    if (!tempTable) {
      setError("No temporary table ID was provided. Please go back and select a valid statement.");
      setIsLoading(false);
      return;
    }
    
    // Use a local variable to track if this effect instance should update state
    let isCurrentEffect = true;
    
    // Simple approach based on user type
    if (userType === "gold") {
      // Check if we've already initialized to prevent duplicate fetches
      if (!hasInitialized.current) {
        fetchTempDataFromAPI();
      }
    } else if (userType === "silver" && !hasFetchedTempTableData.current) {
      fetchTempTableData(tempTable);
      hasFetchedTempTableData.current = true;
    }
    
    // Clean up
    return () => {
      isCurrentEffect = false;
      console.log("PreviewPage effect cleanup");
    };
  }, [tempTable, userType, isUserTypeLoading, fetchTempDataFromAPI, fetchTempTableData]);

  // Listen for WebSocket data (for silver users)
  useEffect(() => {
    if (userType === "silver") {
      console.log("tempTableData changed from WebSocket:", tempTableData);
      
      if (tempTableData && tempTableData.length > 0) {
      const dataWithOriginal = tempTableData.map((row) => ({
        ...row,
          originalAssignedLedger: row.assigned_ledger || "",
      }));
        
      setPreviewData(dataWithOriginal);
        
        // Update statistics
        const total = dataWithOriginal.length;
        const pending = dataWithOriginal.filter((row) => !row.assigned_ledger).length;
        const saved = dataWithOriginal.filter((row) => row.assigned_ledger && row.assigned_ledger.trim() !== "").length;
        
        setStatistics({
          totalTransactions: total,
          pendingTransactions: pending,
          savedTransactions: saved,
          tallyTransactions: statistics.tallyTransactions, // Preserve existing tally count
        });
        
        setIsLoading(false);
      }
    }
  }, [tempTableData, userType]);

  // Fetch ledger options if not available
  useEffect(() => {
    const fetchLedgerOptions = async () => {
      console.log("Checking ledger options:", {
        ledgerOptionsLength: ledgerOptions.length,
        selectedCompany: selectedCompany
      });
      
      if (Array.isArray(ledgerOptions) && ledgerOptions.length === 0 && selectedCompany) {
        try {
          console.log("Fetching ledger options for company:", selectedCompany);
          const response = await axios.get(`/api/ledgers?company=${selectedCompany}`);
          console.log("Ledger API response:", response.data);
          
          if (response.data && Array.isArray(response.data)) {
            console.log("Found ledger options:", response.data.length);
            // Update ledgerOptions in state
            setLedgerOptions(response.data);
          } else {
            console.error("Ledger data is not in expected format:", response.data);
          }
        } catch (err) {
          console.error("Error fetching ledger options:", err);
        }
      }
    };
    
    fetchLedgerOptions();
  }, [ledgerOptions, selectedCompany]);

  // RENDERING LOGIC

  // Debugging information section (for development)
  const renderDebugInfo = () => (
    <div className="debug-info" style={{margin: '20px', padding: '10px', border: '1px solid #ccc', backgroundColor: '#f8f8f8'}}>
      <h3>Debug Information</h3>
      <pre>{JSON.stringify({
        userType,
        tempTable,
        selectedCompany,
        isLoading,
        hasError: !!error,
        previewDataLength: previewData.length,
        ...debugInfo
      }, null, 2)}</pre>
    </div>
  );

  // If loading, show a loading indicator
  if (isLoading) {
  return (
      <div className="preview-page loading">
        <h2>Loading Preview Data...</h2>
        <div className="loading-spinner"></div>
        <p>Please wait while we load your data. This may take a moment.</p>
        <p>User type: {userType}, Loading data for: {tempTable}</p>
        
        {showTimeoutMessage && (
          <div style={{marginTop: '20px', padding: '10px', border: '1px solid #ffc107', backgroundColor: '#fff3cd'}}>
            <p>Loading is taking longer than expected. You can:</p>
            <button 
              className="btn btn-warning" 
              onClick={handleRetryFetch}
              style={{margin: '10px 0'}}
            >
              Retry Loading Data
            </button>
          </div>
        )}
        
        {process.env.NODE_ENV === 'development' && renderDebugInfo()}
      </div>
    );
  }

  // If error, show error message with way to go back
  if (error) {
    return (
      <div className="preview-page error">
        <h2>Error Loading Data</h2>
        <p className="error-message">{error}</p>
        <button 
          className="btn btn-primary" 
          onClick={() => navigate(-1)}
        >
          Go Back
        </button>
        {process.env.NODE_ENV === 'development' && renderDebugInfo()}
        <div style={{marginTop: '20px'}}>
          <button 
            className="btn btn-secondary" 
            onClick={() => {
              setError(null);
              setIsLoading(true);
              fetchTempDataFromAPI();
            }}
          >
            Retry Loading Data
          </button>
        </div>
      </div>
    );
  }

  // Continue with the regular render of the component
  console.log("Rendering filteredData:", filteredData);
  return (
    <div className="preview-page" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '20px', textAlign: 'center', color: '#333' }}>Data Preview</h2>
      <div className="button-group" style={{ marginBottom: '20px', display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
        <button 
          className="btn btn-secondary back-button" 
          onClick={() => navigate(-1)}
          style={{ padding: '8px 15px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}
        >
          ← Back to Banking
        </button>
        
        <button
          className="btn btn-primary"
          onClick={handleRetryFetch}
          style={{ padding: '8px 15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
        >
          ↻ Refresh Data
        </button>
      </div>
      
      {process.env.NODE_ENV === 'development' && renderDebugInfo()}

      {/* Statistics Section - Moved to top for visibility */}
      <div className="statistics" style={{ 
        backgroundColor: '#f8f9fa', 
        padding: '15px', 
        borderRadius: '5px', 
        marginBottom: '20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ marginBottom: '10px', color: '#333', fontSize: '18px' }}>Transaction Statistics</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'space-around' }}>
          <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px', minWidth: '120px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '24px', color: '#007bff' }}>{statistics.totalTransactions}</div>
            <div>Total Transactions</div>
          </div>
          <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px', minWidth: '120px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '24px', color: '#ffc107' }}>{statistics.pendingTransactions}</div>
            <div>Pending</div>
          </div>
          <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px', minWidth: '120px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '24px', color: '#28a745' }}>{statistics.savedTransactions}</div>
            <div>Saved</div>
          </div>
          <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px', minWidth: '120px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '24px', color: '#dc3545' }}>{statistics.tallyTransactions}</div>
            <div>Sent to Tally</div>
          </div>
        </div>
      </div>

      {/* Filter and Bulk Action Section */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '20px' }}>
      {/* General Filters Section */}
        <div className="general-filters" style={{ 
          flex: '1', 
          minWidth: '300px',
          padding: '15px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '5px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginBottom: '10px', color: '#333', fontSize: '16px' }}>General Filters</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <input
            type="checkbox"
            checked={filters.hideTallySynced}
            onChange={() => handleFilterChange("hideTallySynced")}
          />
          Hide Tally Synced Records
        </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <input
            type="checkbox"
            checked={filters.savedRecords}
            onChange={() => handleFilterChange("savedRecords")}
          />
          Saved Records
        </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <input
            type="checkbox"
            checked={filters.blankRecords}
            onChange={() => handleFilterChange("blankRecords")}
          />
          Blank Records
        </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <input
            type="checkbox"
            checked={filters.unsavedRecords}
            onChange={() => handleFilterChange("unsavedRecords")}
          />
          Unsaved Records
        </label>
          </div>
      </div>

      {/* Bulk Assignment Section */}
        <div className="bulk-assign" style={{ 
          flex: '1', 
          minWidth: '300px',
          padding: '15px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '5px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginBottom: '10px', color: '#333', fontSize: '16px' }}>Bulk Assignment</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ marginRight: '10px', whiteSpace: 'nowrap' }}>Assign Ledger to Selected:</label>
            <select 
              onChange={(e) => handleBulkAssign(e.target.value)} 
              defaultValue="" 
              style={{ 
                padding: '8px', 
                borderRadius: '4px', 
                border: '1px solid #ced4da',
                flex: '1',
                minWidth: '150px'
              }}
            >
          <option value="">--Select Ledger--</option>
              {(() => {
                console.log("Rendering ledgerOptions:", ledgerOptions);
                if (!Array.isArray(ledgerOptions)) {
                  console.error("ledgerOptions is not an array:", ledgerOptions);
                  return null;
                }
                return ledgerOptions.map((ledger, index) => {
                  const ledgerValue = typeof ledger === 'string' ? ledger : 
                                     (ledger && ledger.description ? ledger.description : 
                                     (ledger && ledger.name ? ledger.name : 
                                     (ledger && ledger.value ? ledger.value : '')));
                  console.log(`Ledger ${index}:`, { original: ledger, rendered: ledgerValue });
                  return (
                    <option key={index} value={ledgerValue}>
                      {ledgerValue}
            </option>
                  );
                });
              })()}
        </select>
          </div>
        </div>
      </div>

      <div className="table-wrapper" style={{ 
        overflowX: 'auto', 
        marginBottom: '20px',
        backgroundColor: 'white',
        borderRadius: '5px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <table className="preview-table" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa', color: '#333' }}>
              <th style={{ padding: '12px 8px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold' }}>
                <input
                  type="checkbox"
                  checked={
                    previewData.length > 0 &&
                    selectedTransactions.length === previewData.length
                  }
                  onChange={toggleSelectAll}
                  style={{ transform: 'scale(1.2)' }}
                />
              </th>
              <th style={{ padding: '12px 8px', border: '1px solid #ddd', textAlign: 'left', fontWeight: 'bold' }}>Transaction Date</th>
              <th style={{ padding: '12px 8px', border: '1px solid #ddd', textAlign: 'left', fontWeight: 'bold' }}>Type</th>
              <th style={{ padding: '12px 8px', border: '1px solid #ddd', textAlign: 'left', fontWeight: 'bold' }}>Description</th>
              <th style={{ padding: '12px 8px', border: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>Amount</th>
              <th style={{ padding: '12px 8px', border: '1px solid #ddd', textAlign: 'left', fontWeight: 'bold' }}>Assigned Ledger</th>
              <th style={{ padding: '12px 8px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold' }}>Actions</th>
            </tr>
            {/* Column Filters Row */}
            <tr style={{ backgroundColor: '#e9ecef' }}>
              <th style={{ padding: '8px', border: '1px solid #ddd' }}></th>
              <th style={{ padding: '8px', border: '1px solid #ddd' }}>
                <div style={{ display: 'flex', gap: '4%' }}>
                <input
                  type="date"
                  placeholder="From"
                  value={columnFilters.dateFrom}
                  onChange={(e) =>
                    handleColumnFilterChange("dateFrom", e.target.value)
                  }
                    style={{ width: "48%", padding: '5px', borderRadius: '4px', border: '1px solid #ced4da' }}
                />
                <input
                  type="date"
                  placeholder="To"
                  value={columnFilters.dateTo}
                  onChange={(e) =>
                    handleColumnFilterChange("dateTo", e.target.value)
                  }
                    style={{ width: "48%", padding: '5px', borderRadius: '4px', border: '1px solid #ced4da' }}
                />
                </div>
              </th>
              <th style={{ padding: '8px', border: '1px solid #ddd' }}>
                <select
                  value={columnFilters.type}
                  onChange={(e) =>
                    handleColumnFilterChange("type", e.target.value)
                  }
                  style={{ width: '100%', padding: '5px', borderRadius: '4px', border: '1px solid #ced4da' }}
                >
                  <option value="">All</option>
                  <option value="receipt">Receipt</option>
                  <option value="payment">Payment</option>
                  <option value="contra withdraw">Contra Withdraw</option>
                  <option value="contra deposit">Contra Deposit</option>
                </select>
              </th>
              <th style={{ padding: '8px', border: '1px solid #ddd' }}>
                <input
                  type="text"
                  placeholder="Search description..."
                  value={columnFilters.description}
                  onChange={(e) =>
                    handleColumnFilterChange("description", e.target.value)
                  }
                  style={{ width: '100%', padding: '5px', borderRadius: '4px', border: '1px solid #ced4da' }}
                />
              </th>
              <th style={{ padding: '8px', border: '1px solid #ddd' }}>
                <div style={{ display: 'flex', gap: '4%' }}>
                <input
                  type="number"
                  placeholder="Min"
                  value={columnFilters.amountFrom}
                  onChange={(e) =>
                    handleColumnFilterChange("amountFrom", e.target.value)
                  }
                    style={{ width: "48%", padding: '5px', borderRadius: '4px', border: '1px solid #ced4da' }}
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={columnFilters.amountTo}
                  onChange={(e) =>
                    handleColumnFilterChange("amountTo", e.target.value)
                  }
                    style={{ width: "48%", padding: '5px', borderRadius: '4px', border: '1px solid #ced4da' }}
                />
                </div>
              </th>
              <th style={{ padding: '8px', border: '1px solid #ddd' }}>
                <select
                  value={columnFilters.assignedLedger}
                  onChange={(e) =>
                    handleColumnFilterChange("assignedLedger", e.target.value)
                  }
                  style={{ width: '100%', padding: '5px', borderRadius: '4px', border: '1px solid #ced4da' }}
                >
                  <option value="">All</option>
                  {Array.isArray(ledgerOptions) && ledgerOptions.map((ledger, index) => {
                    const ledgerValue = typeof ledger === 'string' ? ledger : 
                                       (ledger && ledger.description ? ledger.description : 
                                       (ledger && ledger.name ? ledger.name : 
                                       (ledger && ledger.value ? ledger.value : '')));
                    return (
                      <option key={index} value={ledgerValue}>
                        {ledgerValue}
                    </option>
                    );
                  })}
                </select>
              </th>
              <th style={{ padding: '8px', border: '1px solid #ddd' }}></th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(filteredData) && filteredData.length > 0 ? (
              filteredData.map((row, idx) => (
                <tr 
                  key={idx} 
                  style={{ 
                    borderBottom: '1px solid #ddd',
                    backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8f9fa'
                  }}
                >
                  <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      disabled={row.status === "sent"}
                      checked={selectedTransactions.includes(row.id)}
                      onChange={() => toggleSelectTransaction(row.id)}
                      style={{ transform: 'scale(1.1)' }}
                    />
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>
                    {(() => {
                      // Use an IIFE to handle complex logic
                      const dateValue = row.transaction_date || row.date || "";
                      if (!dateValue) return "";
                      
                      try {
                        return formatDate(dateValue);
                      } catch (e) {
                        console.error("Error rendering date:", e);
                        return String(dateValue);
                      }
                    })()}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                    <select
                      value={row.transaction_type || ""}
                      onChange={(e) => handleTypeChange(e, idx)}
                      disabled={row.status === "sent"}
                      style={{ 
                        width: '100%', 
                        padding: '5px', 
                        borderRadius: '4px', 
                        border: '1px solid #ced4da',
                        backgroundColor: row.status === "sent" ? '#e9ecef' : 'white'
                      }}
                    >
                      <option value="">--Select Type--</option>
                      <option value="receipt">Receipt</option>
                      <option value="payment">Payment</option>
                      <option value="contra withdraw">Contra Withdraw</option>
                      <option value="contra deposit">Contra Deposit</option>
                    </select>
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>{row.description ? String(row.description) : ""}</td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                    {row.amount ? parseFloat(row.amount).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    }) : ""}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                    <select
                      value={row.assigned_ledger || ""}
                      onChange={(e) => handleLedgerChange(e, idx)}
                      disabled={row.status === "sent"}
                      style={{ 
                        width: '100%', 
                        padding: '5px', 
                        borderRadius: '4px', 
                        border: '1px solid #ced4da',
                        backgroundColor: row.status === "sent" ? '#e9ecef' : 'white'
                      }}
                    >
                      <option value="">--Select Ledger--</option>
                      {Array.isArray(ledgerOptions) && ledgerOptions.map((ledger, index) => {
                        const ledgerValue = typeof ledger === 'string' ? ledger : 
                                           (ledger && ledger.description ? ledger.description : 
                                           (ledger && ledger.name ? ledger.name : 
                                           (ledger && ledger.value ? ledger.value : '')));
                        return (
                          <option key={index} value={ledgerValue}>
                            {ledgerValue}
                        </option>
                        );
                      })}
                    </select>
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                    <button
                      onClick={() => handleDeleteTransaction(row.id)}
                      disabled={row.status === "sent"}
                      style={{ 
                        padding: '5px 10px', 
                        backgroundColor: row.status === "sent" ? '#6c757d' : '#dc3545', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '3px',
                        opacity: row.status === "sent" ? '0.65' : '1',
                        cursor: row.status === "sent" ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ textAlign: "center", padding: '30px', backgroundColor: '#f8f9fa' }}>
                  <div style={{ fontSize: '18px', color: '#6c757d' }}>No transactions found.</div>
                  <div style={{ marginTop: '10px', fontSize: '14px', color: '#6c757d' }}>Try adjusting your filters or refresh the data.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="button-group" style={{ display: 'flex', gap: '15px', marginBottom: '30px', justifyContent: 'center' }}>
        <button 
          className="btn btn-save" 
          onClick={handleSaveUpdates}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#28a745', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px',
            fontSize: '16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <span>💾</span> Save Changes
        </button>
        <button
          className={`btn btn-tally ${hasUnsavedChanges ? "btn-disabled" : ""}`}
          onClick={handleSendToTally}
          disabled={hasUnsavedChanges}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: hasUnsavedChanges ? '#6c757d' : '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px',
            opacity: hasUnsavedChanges ? '0.65' : '1',
            fontSize: '16px',
            cursor: hasUnsavedChanges ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <span>🔄</span> Send to Tally
        </button>
      </div>
    </div>
  );
};

export default PreviewPage;
