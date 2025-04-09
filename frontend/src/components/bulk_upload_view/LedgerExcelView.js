import React, { useState, useEffect, useRef } from 'react';
import axios from '../../api/axios';
import NavbarWithCompany from '../NavbarWithCompany';
import './LedgerExcelview.css';

const ledgerGroups = ["Bank Accounts", "Bank OCC Alc", "Bank OD Alc", "Branch / Divisions", "Capital Account", "Cash-in-Hand", "Current Assets", "Current Liabilities", "Deposits (Asset)", "Direct Expenses", "Direct Incomes", "Duties & Taxes", "Expenses (Direct)", "Expenses (Indirect)", "Fixed Assets", "Income (Direct)", "Income (Indirect)", "Indirect Expenses", "Indirect Incomes", "Investments", "Loans & Advances (Asset)", "Loans (Liability)", "Misc. Expenses (ASSET)", "Provisions", "Purchase Accounts", "Reserves & Surplus", "Retained Earnings", "Sales Accounts", "Secured Loans", "Stock-in-Hand", "Sundry Creditors", "Sundry Debtors", "Suspense Alc", "Unsecured Loans"];
const yesNo = ["Yes", "No"];
const registrationTypes = ["Unknown", "Composition", "Consumer", "Regular", "Unregistered"];
const typeOfLedgers = ["Not Applicable", "Discount", "Invoice Rounding"];
const gstApplicable = ["Applicable", "Not Applicable", "Undefined"];
const taxabilityOptions = ["Unknown", "Exempt", "Nil Rated", "Taxable"];

// Fields to hide in the UI
const hiddenFields = ['creation_id', 'id', 'created_at', 'updated_at'];

const toHeader = (key) =>
  key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const LedgerExcelView = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [currentTable, setCurrentTable] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [duplicateModal, setDuplicateModal] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const [skippedReport, setSkippedReport] = useState(null);
  const fileInputRef = useRef(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [tempTable, setTempTable] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const userEmail = sessionStorage.getItem('userEmail');

  // Filter states
  const [filters, setFilters] = useState({
    name: '',
    parent: '',
    gst_applicable: '',
    registration_type: '',
    taxability: ''
  });

  // Filter function
  const applyFilters = (data) => {
    return data.filter(row => {
      return (
        (!filters.name || row.name?.toLowerCase().includes(filters.name.toLowerCase())) &&
        (!filters.parent || row.parent === filters.parent) &&
        (!filters.gst_applicable || row.gst_applicable === filters.gst_applicable) &&
        (!filters.registration_type || row.registration_type === filters.registration_type) &&
        (!filters.taxability || row.taxability === filters.taxability)
      );
    });
  };

  // Update filters
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Reset filters
  const resetFilters = () => {
    setFilters({
      name: '',
      parent: '',
      gst_applicable: '',
      registration_type: '',
      taxability: ''
    });
  };

  // Update filtered data when tableData or filters change
  useEffect(() => {
    setFilteredData(applyFilters(tableData));
  }, [tableData, filters]);

  useEffect(() => {
    const loadLatestData = async () => {
      try {
        const email = sessionStorage.getItem("userEmail");
        const company = sessionStorage.getItem("selectedCompany");
        
        if (!email || !company) {
          setError("Missing user email or company");
          return;
        }

        // First try to get the table from sessionStorage
        const sessionTable = sessionStorage.getItem('tempTable');
        console.log("Loading table from session:", sessionTable);
        
        if (sessionTable) {
          // If we have a table in sessionStorage, use it
          setTempTable(sessionTable);
          await fetchData(sessionTable);
        } else {
          // If no table in sessionStorage, get the latest from API
          const uploadRes = await axios.get('/getUserExcelLedgerUploads', {
            params: { email, company }
          });

          if (uploadRes.data && uploadRes.data.length > 0) {
            const latestTable = uploadRes.data[0].temp_table;
            setTempTable(latestTable);
            sessionStorage.setItem('tempTable', latestTable);
            await fetchData(latestTable);
          } else {
            setError("No ledger data found");
          }
        }
      } catch (err) {
        console.error('Error loading latest data:', err);
        setError('Failed to load latest data: ' + (err.response?.data?.error || err.message));
      }
    };

    loadLatestData();

    const company = sessionStorage.getItem('selectedCompany');
    if (company) setSelectedCompany(company);
  }, []);

  const fetchData = async (tableName) => {
    if (!tableName) {
      console.error('No table name provided to fetchData');
      setError('No table name provided');
      return;
    }

    try {
      const timestamp = Date.now(); // Prevent browser caching
      console.log(`Attempting to fetch data from table: ${tableName}`);
      
      const res = await axios.get('/excelLedgersData', {
        params: { 
          tempTable: tableName,
          _t: timestamp // Add timestamp to prevent caching
        }
      });
      
      if (res.data && Array.isArray(res.data)) {
        console.log('Frontend fetched ledger rows:', res.data);
        
        if (res.data.length === 0) {
          console.warn('No ledger rows returned from backend');
          setError('No data available');
          return;
        }
        
        setTableData(res.data);
        setTempTable(tableName);
        sessionStorage.setItem('tempTable', tableName);
      } else {
        console.error('Invalid data format received:', res.data);
        setError('Invalid data format received from server');
      }
    } catch (err) {
      console.error('Error fetching ledger data:', err);
      console.error('Request details:', { url: '/excelLedgersData', tableName });
      setError('Failed to load ledger data: ' + (err.response?.data?.error || err.message));
    }
  };

  // Add refresh data function
  const refreshData = async () => {
    try {
      const email = sessionStorage.getItem("userEmail");
      const company = sessionStorage.getItem("selectedCompany");
      
      if (!email || !company) {
        setError("Missing user email or company");
        return;
      }

      // Get the current table from sessionStorage
      const currentTable = tempTable || sessionStorage.getItem('tempTable');
      console.log("Refreshing data for table:", currentTable);

      if (currentTable) {
        // Fetch the latest data with a timestamp to prevent caching
        const timestamp = new Date().getTime();
        console.log(`Making API call to fetch fresh ledger data: /excelLedgersData?tempTable=${currentTable}&_t=${timestamp}`);
        
        const res = await axios.get('/excelLedgersData', {
          params: { 
            tempTable: currentTable,
            _t: timestamp // Add timestamp to prevent caching
          }
        });
        
        if (res.data && Array.isArray(res.data)) {
          console.log(`Received ${res.data.length} rows of ledger data`);
          if (res.data.length > 0) {
            console.log('First row sample:', res.data[0]);
          }
          
          setTableData(res.data);
          setTempTable(currentTable);
          
          console.log('Ledger data refreshed successfully');
          setMessage('Data refreshed successfully');
          setTimeout(() => setMessage(''), 3000); // Clear message after 3 seconds
        } else {
          console.error('Invalid data format received:', res.data);
          setError('Invalid data format received from server');
        }
      } else {
        console.error('No temporary table available for refresh');
        setError("No temporary table found - please return to the Ledger page and select a file");
      }
    } catch (err) {
      console.error('Error refreshing data:', err);
      setError('Failed to refresh data: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCheckboxChange = (idx) => {
    setSelectedRows(prev => {
      const updated = new Set(prev);
      updated.has(idx) ? updated.delete(idx) : updated.add(idx);
      return updated;
    });
  };

  const handleSelectAll = (checked) => {
    setSelectedRows(checked ? new Set(tableData.map((_, idx) => idx)) : new Set());
  };

  const handleSave = async () => {
    if (!selectedRows.size) {
      setError("Please select at least one row to save.");
      return;
    }

    const rowsToSave = tableData.filter((_, idx) => selectedRows.has(idx));
    
    try {
      setMessage('Checking for duplicate ledgers...');
      
      const ledgerNames = rowsToSave.map(row => row.name);
      
      const checkResponse = await axios.get('/getMergedLedgerNames', { 
        params: { 
          email: userEmail, 
          company: selectedCompany
        }
      });
      
      if (checkResponse.data && Array.isArray(checkResponse.data)) {
        const existingLedgers = checkResponse.data.map(name => name.toLowerCase().trim());
        const duplicates = ledgerNames.filter(name => 
          existingLedgers.includes(name.toLowerCase().trim())
        );
        
        if (duplicates.length > 0) {
          setError(`Cannot save: The following ledger(s) already exist in your company: ${duplicates.join(', ')}`);
          return;
        }
      }
      
      setMessage('Saving rows...');
      
      const response = await axios.post('/saveLedgerRows', { 
        email: userEmail, 
        company: selectedCompany, 
        tempTable, 
        rows: rowsToSave 
      });
      
      await refreshData();
      
      if (response.data.skipped > 0 && response.data.reportFile) {
        setSkippedReport({
          count: response.data.skipped,
          reportFile: response.data.reportFile
        });
      }
      
      setMessage('Rows saved successfully!');
      setSelectedRows(new Set());
      setError('');
    } catch (err) {
      console.error('Save error:', err);
      setError('Failed to save rows: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSendToTally = async () => {
    try {
      setMessage('Sending to Tally...');
      
      await axios.post('/sendLedgerToTally', {
        email: userEmail,
        company: selectedCompany,
        tempTable,
      });
      
      setMessage('Data sent to Tally successfully!');
      setError('');
    } catch (err) {
      console.error('Tally error:', err);
      setError('Failed to send data to Tally: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCellChange = (idx, key, value) => {
    setTableData(prev => prev.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));
  };

  const downloadSkippedReport = async () => {
    if (!skippedReport || !skippedReport.reportFile) return;
    
    try {
      const response = await axios.get('/downloadSkippedReport', {
        params: { path: skippedReport.reportFile },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Skipped_Ledgers_Report.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      setSkippedReport(null);
      
    } catch (error) {
      console.error('Error downloading report:', error);
      setError('Failed to download the skipped ledgers report');
    }
  };

  return (
    <div className="ledger-excel-view container-fluid p-4">
      <NavbarWithCompany
        selectedCompany={selectedCompany}
        setSelectedCompany={setSelectedCompany}
        lockCompany={true}
      />
      <h2 className="mb-4 text-center">Ledger Excel Data Review</h2>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      
      {skippedReport && (
        <div className="alert alert-warning alert-dismissible fade show" role="alert">
          <strong>Attention!</strong> {skippedReport.count} ledgers were skipped because they already exist.
          <button className="btn btn-sm btn-warning ml-3" onClick={downloadSkippedReport}>
            <i className="bi bi-download"></i> Download Report
          </button>
          <button type="button" className="close" aria-label="Close" onClick={() => setSkippedReport(null)}>
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      )}

      <div className="d-flex justify-content-center gap-3 mb-4">
        <button className="btn btn-success" disabled={!selectedRows.size} onClick={handleSave}>Save</button>
        <button className="btn btn-warning" disabled={!selectedRows.size} onClick={handleSendToTally}>Send to Tally</button>
      </div>
 
      <div className="table-responsive">
        <table className="table table-bordered table-striped">
          <thead className="table-dark">
            <tr>
              {/* Serial number header */}
              <th>Sr No</th>
              {/* Checkbox header */}
              <th>
                <input type="checkbox" onChange={(e) => handleSelectAll(e.target.checked)} />
              </th>
              {tableData[0] && Object.keys(tableData[0])
                .filter(key => !hiddenFields.includes(key))
                .map(key => (
                  <th key={key}>
                    <div className="d-flex flex-column">
                      <span>{toHeader(key)}</span>
                      {key === "name" && (
                        <input
                          type="text"
                          className="form-control form-control-sm mt-1"
                          placeholder="Search..."
                          value={filters.name}
                          onChange={(e) => handleFilterChange('name', e.target.value)}
                        />
                      )}
                      {key === "parent" && (
                        <select
                          className="form-select form-select-sm mt-1"
                          value={filters.parent}
                          onChange={(e) => handleFilterChange('parent', e.target.value)}
                        >
                          <option value="">All</option>
                          {ledgerGroups.map(group => (
                            <option key={group} value={group}>{group}</option>
                          ))}
                        </select>
                      )}
                      {key === "gst_applicable" && (
                        <select
                          className="form-select form-select-sm mt-1"
                          value={filters.gst_applicable}
                          onChange={(e) => handleFilterChange('gst_applicable', e.target.value)}
                        >
                          <option value="">All</option>
                          {gstApplicable.map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      )}
                      {key === "registration_type" && (
                        <select
                          className="form-select form-select-sm mt-1"
                          value={filters.registration_type}
                          onChange={(e) => handleFilterChange('registration_type', e.target.value)}
                        >
                          <option value="">All</option>
                          {registrationTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      )}
                      {key === "taxability" && (
                        <select
                          className="form-select form-select-sm mt-1"
                          value={filters.taxability}
                          onChange={(e) => handleFilterChange('taxability', e.target.value)}
                        >
                          <option value="">All</option>
                          {taxabilityOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </th>
                ))
              }
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, idx) => (
              <tr key={idx}>
                {/* Serial number for each row */}
                <td>{idx + 1}</td>
                <td>
                  <input type="checkbox" checked={selectedRows.has(idx)} onChange={() => handleCheckboxChange(idx)} />
                </td>
                {Object.entries(row)
                  .filter(([key]) => !hiddenFields.includes(key))
                  .map(([key, val]) => (
                    <td key={key}>
                      {key === "parent" ? (
                        <select className="form-select" value={val || ''} onChange={(e) => handleCellChange(idx, key, e.target.value)}>
                          <option value="">Select Parent</option>
                          {ledgerGroups.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : key === "bill_by_bill" || key === "inventory_affected" || key === "set_alter_gst_details" ? (
                        <select className="form-select yes-no-select" value={val || ''} onChange={(e) => handleCellChange(idx, key, e.target.value)}>
                          <option value="">Select</option>
                          {yesNo.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : key === "registration_type" ? (
                        <select className="form-select" value={val || ''} onChange={(e) => handleCellChange(idx, key, e.target.value)}>
                          <option value="">Select Registration Type</option>
                          {registrationTypes.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : key === "type_of_ledger" ? (
                        <select className="form-select" value={val || ''} onChange={(e) => handleCellChange(idx, key, e.target.value)}>
                          <option value="">Select Type of Ledger</option>
                          {typeOfLedgers.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : key === "gst_applicable" ? (
                        <select className="form-select" value={val || ''} onChange={(e) => handleCellChange(idx, key, e.target.value)}>
                          <option value="">Select GST Applicable</option>
                          {gstApplicable.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : key === "taxability" ? (
                        <select className="form-select" value={val || ''} onChange={(e) => handleCellChange(idx, key, e.target.value)}>
                          <option value="">Select Taxability</option>
                          {taxabilityOptions.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input className="form-control" value={val || ''} onChange={(e) => handleCellChange(idx, key, e.target.value)} />
                      )}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default LedgerExcelView;
