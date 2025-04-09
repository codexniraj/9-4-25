import React, { useEffect, useState } from 'react';
import './Journelexcelview.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import axios from 'axios';
import AddLedgerButton from './AddLedgerbutton';
import NavbarWithCompany from '../NavbarWithCompany';

function Journelexcelview() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [filterText, setFilterText] = useState('');
  const [tempTable, setTempTable] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [ledgerOptions, setLedgerOptions] = useState([]);
  const [invalidLedgers, setInvalidLedgers] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [currentCompany, setCurrentCompany] = useState('');
  const [selectedRows, setSelectedRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState(false);

  const [selectAll, setSelectAll] = useState(false);
  const [costCenterOptions, setCostCenterOptions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState({ rowIndex: null, column: null });
  const [inputStates, setInputStates] = useState({});

  // Toggle select all rows
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedRows([]);
    } else {
      // Only include rows that are not disabled due to status "send to tally"
      const allIndexes = filteredData
        .map((row, index) => (row.status && row.status.toLowerCase() === "send to tally" ? null : index))
        .filter(i => i !== null);
      setSelectedRows(allIndexes);
    }
    setSelectAll(!selectAll);
  };

  useEffect(() => {
    const company = sessionStorage.getItem("selectedCompany");
    if (company) {
      setCurrentCompany(company);
      setSelectedCompany(company);
      fetchLedgerNames();
    }
  }, []);

  // Load the latest temp table data from either session or DB
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
          const uploadRes = await axios.get('http://localhost:3001/api/getUserJournelUploads', {
            params: { email, company }
          });

          if (uploadRes.data && uploadRes.data.length > 0) {
            const latestTable = uploadRes.data[0].temp_table;
            setTempTable(latestTable);
            await fetchData(latestTable);
          } else {
            setError("No journal data found");
          }
        }
      } catch (err) {
        console.error('Error loading latest data:', err);
        setError('Failed to load latest data');
      }
    };

    loadLatestData();
  }, []);

  // Filter table data based on text input and status filter checkbox
  useEffect(() => {
    let temp = data;
    if (filterText.trim() !== '') {
      const lower = filterText.toLowerCase();
      temp = temp.filter(row =>
        Object.values(row).some(val =>
          val && val.toString().toLowerCase().includes(lower)
        )
      );
    }
    // Apply status filter if checkbox is checked.
    if (statusFilter) {
      temp = temp.filter(row => row.status && row.status.toLowerCase() === 'send to tally');
    }
    setFilteredData(temp);
  }, [filterText, data, statusFilter]);

  // Fetch data from the server for a given table
  const fetchData = async (tableName) => {
    if (!tableName) {
      console.error('No table name provided to fetchData');
      setError('No table name provided');
      return;
    }

    try {
      const timestamp = Date.now(); // Prevent browser caching
      const res = await axios.get('http://localhost:3001/api/getJournalData', {
        params: { tempTable: tableName, t: timestamp },
      });

      if (res.data && Array.isArray(res.data)) {
        console.log('Frontend fetched rows:', res.data);

        if (res.data.length === 0) {
          console.warn('No rows returned from backend');
          setError('No data available');
          return;
        }

        if (!('id' in res.data[0])) {
          console.error('Fetched data missing ID:', res.data[0]);
          setError('Fetched data missing ID');
          return;
        }

        setData(res.data);
        setFilteredData(res.data);
        setTempTable(tableName);
        sessionStorage.setItem('tempTable', tableName);

        const uploadMeta = JSON.parse(sessionStorage.getItem('uploadMeta')) || {};
        setInvalidLedgers(uploadMeta.invalidLedgers || []);
      } else {
        console.error('Invalid data format received:', res.data);
        setError('Invalid data format received from server');
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data: ' + (err.response?.data?.error || err.message));
    }
  };

  // Fetch ledger names
  const fetchLedgerNames = async () => {
    const currentCompany = sessionStorage.getItem("selectedCompany");
    const email = sessionStorage.getItem("userEmail");

    if (!currentCompany || !email) {
      console.error("Missing email or company for ledger fetch.");
      return;
    }

    try {
      const res = await axios.get("http://localhost:3001/api/getMergedLedgerNames", {
        params: { email, company: currentCompany },
      });

      console.log("Merged Ledger Names:", res.data);
      setLedgerOptions(res.data);
    } catch (err) {
      console.error("Error fetching merged ledger names:", err);
    }
  };

  // Handle row selection toggles (grouped by reference_no)
  const handleRowSelect = (rowIndex) => {
    const selectedRef = data[rowIndex]?.reference_no;
    if (!selectedRef) return;

    // Do not allow selection if status is "send to tally"
    if (data[rowIndex].status && data[rowIndex].status.toLowerCase() === "send to tally") return;

    const relatedIndexes = data
      .map((row, i) => (row.reference_no === selectedRef ? i : null))
      .filter(i => i !== null);

    setSelectedRows(prev => {
      const allSelected = relatedIndexes.every(i => prev.includes(i));
      if (allSelected) {
        return prev.filter(i => !relatedIndexes.includes(i));
      } else {
        return Array.from(new Set([...prev, ...relatedIndexes]));
      }
    });
  };

  const isRowSelected = (rowIndex) => selectedRows.includes(rowIndex);

  // Save selected rows to the DB
  const handleSave = async () => {
    if (selectedRows.length === 0) {
      setError("Please select at least one row to save.");
      return;
    }

    // Validate ledgers
    const rowsToValidate = selectedRows.map(i => data[i]);
    const hasInvalid = rowsToValidate.some(row =>
      !ledgerOptions.some(option =>
        option.toLowerCase() === row.particulars?.toLowerCase()?.trim()
      )
    );
    if (hasInvalid) {
      setError("Please resolve all red-marked ledgers before saving.");
      return;
    }

    // Check Dr/Cr match
    let debit = 0, credit = 0;
    for (let row of rowsToValidate) {
      if (row.dr_cr === "Dr") debit += Number(row.amount || 0);
      else if (row.dr_cr === "Cr") credit += Number(row.amount || 0);
    }
    if (debit !== credit) {
      setError(`Dr/Cr mismatch: Debit = ${debit}, Credit = ${credit}`);
      return;
    }

    try {
      const email = sessionStorage.getItem("userEmail");
      const company = sessionStorage.getItem("selectedCompany");

      if (!email || !company) {
        setError("Missing user email or company");
        return;
      }

      // Get the current tempTable from state or sessionStorage
      let currentTempTable = tempTable || sessionStorage.getItem('tempTable');
      if (!currentTempTable) {
        const uploadRes = await axios.get('http://localhost:3001/api/getUserJournelUploads', {
          params: { email, company }
        });
        if (uploadRes.data && uploadRes.data.length > 0) {
          currentTempTable = uploadRes.data[0].temp_table;
          setTempTable(currentTempTable);
          sessionStorage.setItem('tempTable', currentTempTable);
        } else {
          setError("No temporary table found");
          return;
        }
      }

      // Save each selected row
      for (let rowIndex of selectedRows) {
        const rowData = data[rowIndex];
        if (!rowData.id) {
          console.error(`Row at index ${rowIndex} missing id:`, rowData);
          continue;
        }

        const payload = {
          tempTable: currentTempTable,
          creation_id: rowData.id,
          email,
          company,
          updatedRow: {
            journal_no: rowData.journal_no,
            reference_no: rowData.reference_no,
            date: rowData.date,
            cost_center: rowData.cost_center,
            particulars: rowData.particulars,
            name_of_item: rowData.name_of_item,
            quantity: rowData.quantity,
            rate: rowData.rate,
            dr_cr: rowData.dr_cr,
            amount: rowData.amount,
            ledger_narration: rowData.ledger_narration,
            narration: rowData.narration
          }
        };

        console.log('Saving row with payload:', payload);
        await axios.post("http://localhost:3001/api/updateJournalRow", payload);
      }

      await refreshData();
      setMessage("Selected rows saved successfully.");
      setError('');
    } catch (err) {
      console.error("Save error:", err);
      setError("Save failed: " + (err.response?.data?.error || err.message));
      if (err.response?.data?.details) {
        console.error("Error details:", err.response.data.details);
      }
    }
  };

  // Send selected rows to Tally and update status in the backend upon success
  const handleSendToTally = async () => {
    if (selectedRows.length === 0) {
      setError("Please select at least one row to send to Tally.");
      return;
    }

    // Prepare rows to send
    const rowsToSend = selectedRows.map(idx => data[idx]);

    // Validate the selected rows
    const hasInvalidLedgers = rowsToSend.some(row =>
      !isValidLedgerName(row.particulars, ledgerOptions)
    );
    if (hasInvalidLedgers) {
      setError("Cannot send to Tally: unresolved ledgers in selected rows.");
      return;
    }

    try {
      const payload = {
        company: currentCompany,
        selectedRows: rowsToSend,
      };

      const res = await axios.post('http://localhost:3001/api/sendJournalToTally', payload);

      if (res.data && res.data.message) {
        setMessage(res.data.message || "Selected rows sent to Tally successfully.");

        // Get necessary session values
        const email = sessionStorage.getItem("userEmail");
        const company = sessionStorage.getItem("selectedCompany");
        let currentTempTable = tempTable || sessionStorage.getItem('tempTable');
        if (!currentTempTable) {
          const uploadRes = await axios.get('http://localhost:3001/api/getUserJournelUploads', {
            params: { email, company }
          });
          if (uploadRes.data && uploadRes.data.length > 0) {
            currentTempTable = uploadRes.data[0].temp_table;
            setTempTable(currentTempTable);
            sessionStorage.setItem('tempTable', currentTempTable);
          } else {
            setError("No temporary table found");
            return;
          }
        }

        // For every selected row, update its status in the backend to "send to tally"
        for (let rowIndex of selectedRows) {
          const rowData = data[rowIndex];
          if (!rowData.id) {
            console.error(`Row at index ${rowIndex} missing id:`, rowData);
            continue;
          }
          const updatePayload = {
            tempTable: currentTempTable,
            creation_id: rowData.id,
            email,
            company,
            updatedRow: {
              ...rowData,
              status: "send to tally"
            }
          };
          await axios.post("http://localhost:3001/api/updateJournalRow", updatePayload);
        }

        // Update frontend state immediately to show the new status and clear selection
        const updatedData = data.map((row, index) => {
          if (selectedRows.includes(index)) {
            return { ...row, status: "send to tally" };
          }
          return row;
        });
        setData(updatedData);
        setFilteredData(updatedData);
        setSelectedRows([]);

        await refreshData();
      } else {
        setError("TallyConnector did not return a success response.");
      }
    } catch (err) {
      setError("TallyConnector is offline or failed to receive data.");
    }
  };

  // Update local state for cell changes
  const handleCellChange = (rowIndex, key, value) => {
    setData(prevData => {
      const updated = [...prevData];
      updated[rowIndex] = { ...updated[rowIndex], [key]: value };
      return updated;
    });
  };

  // Show suggestions (ledger/cost center) on focus
  const handleInputFocus = (rowIndex, column) => {
    setShowSuggestions({ rowIndex, column });
  };

  // Validate ledger name
  const isValidLedgerName = (value, options) => {
    if (!value) return true;
    return options.some(option =>
      option.toLowerCase() === value.toLowerCase().trim()
    );
  };

  // Handle user typing in a cell
  const handleInputChange = (rowIndex, key, value) => {
    setInputStates(prev => ({
      ...prev,
      [`${rowIndex}-${key}`]: { isEditing: true }
    }));

    if (key.toLowerCase() === 'reference_no' || key.toLowerCase() === 'journal_no') {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed)) {
        handleCellChange(rowIndex, key, parsed);
      } else {
        handleCellChange(rowIndex, key, '');
      }
    } else {
      handleCellChange(rowIndex, key, value);
    }
  };

  // When user finishes editing (blur), hide suggestions
  const handleInputBlur = (rowIndex, key, value) => {
    setTimeout(() => {
      setShowSuggestions({ rowIndex: null, column: null });
      setInputStates(prev => ({
        ...prev,
        [`${rowIndex}-${key}`]: { isEditing: false }
      }));
    }, 200);
  };

  // Check if a cell is currently being edited
  const isFieldEditing = (rowIndex, key) => {
    return inputStates[`${rowIndex}-${key}`]?.isEditing;
  };

  // Filter ledger/cost-center suggestions
  const getFilteredSuggestions = (value, options) => {
    const inputValue = value?.toLowerCase().trim() || '';
    return options.filter(option =>
      option.toLowerCase().includes(inputValue)
    );
  };

  // Refresh data from server
  const refreshData = async () => {
    try {
      const email = sessionStorage.getItem("userEmail");
      const company = sessionStorage.getItem("selectedCompany");

      if (!email || !company) {
        setError("Missing user email or company");
        return;
      }

      const currentTable = sessionStorage.getItem('tempTable');
      console.log("Refreshing data for table:", currentTable);

      if (currentTable) {
        const timestamp = new Date().getTime();
        const res = await axios.get('http://localhost:3001/api/getJournalData', {
          params: { 
            tempTable: currentTable,
            _t: timestamp
          }
        });
        
        if (res.data && Array.isArray(res.data)) {
          setData(res.data);
          setFilteredData(res.data);
          setTempTable(currentTable);
          console.log('Refreshed data:', res.data);
        } else {
          console.error('Invalid data format received:', res.data);
          setError('Invalid data format received from server');
        }
      } else {
        setError("No temporary table found in session storage");
      }
    } catch (err) {
      console.error('Error refreshing data:', err);
      setError('Failed to refresh data: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="excelview-wrapper container-fluid p-4">
      <NavbarWithCompany
        selectedCompany={selectedCompany}
        setSelectedCompany={setSelectedCompany}
        lockCompany={true}
      />
      <h2 className="mb-4 text-center">Journal Excel Data Review</h2>

      <div className="action-buttons d-flex justify-content-center gap-3 mb-4">
        <button className="btn btn-success" onClick={handleSave}>Save</button>
        <button className="btn btn-warning" onClick={handleSendToTally}>Send To Tally</button>
        <AddLedgerButton
          onAdd={(newLedger) => setLedgerOptions([...ledgerOptions, newLedger])}
        />
      </div>

      <div className="filter-section mb-3 text-center">
        <input
          type="text"
          className="form-control w-50 mx-auto"
          placeholder="Filter by any field..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <div className="table-responsive">
        <table className="table table-bordered table-sm table-striped">
          <thead className="table-dark">
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                />
              </th>
              <th>Sr. No.</th>
              {filteredData[0] && Object.keys(filteredData[0]).map((key) => (
                <th key={key}>{key.replace(/_/g, ' ')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, rowIndex) => {
              // If status is "send to tally", disable editing for the row
              const isDisabled = row.status && row.status.toLowerCase() === "send to tally";
              return (
                <tr key={rowIndex}>
                  <td>
                    <input
                      type="checkbox"
                      checked={isRowSelected(rowIndex)}
                      onChange={() => handleRowSelect(rowIndex)}
                      disabled={isDisabled}
                    />
                  </td>
                  <td>{rowIndex + 1}</td>
                  {Object.entries(row).map(([key, val], colIndex) => {
                    const lowerKey = key.toLowerCase();
                    const isLedger = lowerKey === 'particulars';
                    const isCostCenter = lowerKey === 'cost_center';
                    const isDate = lowerKey === 'date';
                    const isDrCr = lowerKey === 'dr_cr';

                    const isEditing = isFieldEditing(rowIndex, key);
                    const showValidationError =
                      isLedger && !isEditing && !isValidLedgerName(val, ledgerOptions);

                    if (isLedger || isCostCenter) {
                      const options = isLedger ? ledgerOptions : costCenterOptions;
                      const showDropdown =
                        showSuggestions.rowIndex === rowIndex &&
                        showSuggestions.column === key;
                      const suggestions = getFilteredSuggestions(val, options);

                      return (
                        <td
                          key={colIndex}
                          className={showValidationError ? 'bg-danger text-white' : ''}
                        >
                          <div className="position-relative">
                            <input
                              type="text"
                              className={`form-control form-control-sm ${showValidationError ? 'border-danger' : ''}`}
                              value={val || ''}
                              onChange={(e) => handleInputChange(rowIndex, key, e.target.value)}
                              onFocus={() => handleInputFocus(rowIndex, key)}
                              onBlur={() => handleInputBlur(rowIndex, key, val)}
                              placeholder={
                                isLedger
                                  ? "Type to search ledger..."
                                  : "Type to search cost center..."
                              }
                              disabled={isDisabled}
                            />
                            {showDropdown && suggestions.length > 0 && val && (
                              <div className="suggestions-dropdown">
                                {suggestions.map((suggestion, idx) => (
                                  <div
                                    key={idx}
                                    className="suggestion-item"
                                    onMouseDown={() =>
                                      handleCellChange(rowIndex, key, suggestion)
                                    }
                                  >
                                    {suggestion}
                                  </div>
                                ))}
                              </div>
                            )}
                            {showValidationError && (
                              <span
                                className="ms-2 text-danger"
                                title="Add Ledger"
                                style={{ cursor: 'pointer' }}
                              >
                                ℹ️
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={colIndex}>
                        {isDate ? (
                          <input
                            type="date"
                            className="form-control form-control-sm"
                            value={val || ''}
                            onChange={(e) => handleCellChange(rowIndex, key, e.target.value)}
                            disabled={isDisabled}
                          />
                        ) : isDrCr ? (
                          <select
                            className="form-select form-select-sm"
                            value={val}
                            onChange={(e) => handleCellChange(rowIndex, key, e.target.value)}
                            disabled={isDisabled}
                          >
                            <option value="">Select</option>
                            <option value="Dr">Dr</option>
                            <option value="Cr">Cr</option>
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={val || ''}
                            onChange={(e) => handleInputChange(rowIndex, key, e.target.value)}
                            className="form-control form-control-sm"
                            disabled={isDisabled}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Journelexcelview;
