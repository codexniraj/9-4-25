// AddLedgerbutton.js (Updated with full 34 group logic + dynamic fields + styled UI)
import React, { useState, useEffect } from 'react';
import './AddLedgerbutton.css';
import axios from '../../api/axios';

const ledgerGroups = [
  "Bank Accounts", "Bank OCC Alc", "Bank OD Alc", "Branch / Divisions", "Capital Account",
  "Cash-in-Hand", "Current Assets", "Current Liabilities", "Deposits (Asset)", "Direct Expenses",
  "Direct Incomes", "Duties & Taxes", "Expenses (Direct)", "Expenses (Indirect)", "Fixed Assets",
  "Income (Direct)", "Income (Indirect)", "Indirect Expenses", "Indirect Incomes", "Investments",
  "Loans & Advances (Asset)", "Loans (Liability)", "Misc. Expenses (ASSET)", "Provisions",
  "Purchase Accounts", "Reserves & Surplus", "Retained Earnings", "Sales Accounts",
  "Secured Loans", "Stock-in-Hand", "Sundry Creditors", "Sundry Debtors", "Suspense Alc", "Unsecured Loans"
];

const requiredFieldsByLedgerGroup = {
  "Bank Accounts": ["Account Holder Name", "Alc No", "IFS code", "SWIFT code", "Bank Name", "Branch"],
  "Bank OCC Alc": ["Account Holder Name", "IFS code", "SWIFT code", "Bank Name"],
  "Bank OD Alc": ["Account Holder Name", "IFS code", "Bank Name"],
  "Branch / Divisions": ["Address", "State", "Pincode"],
  "Capital Account": ["Mailing name", "PAN/IT No", "GSTIN/UIN", "GST Applicable"],
  "Cash-in-Hand": ["State"],
  "Current Assets": ["Mailing name"],
  "Current Liabilities": ["Mailing name"],
  "Deposits (Asset)": ["Mailing name", "Address", "PAN/IT No"],
  "Direct Expenses": ["GST Applicable", "Taxability"],
  "Direct Incomes": ["GST Applicable", "Taxability"],
  "Duties & Taxes": ["Type of Duty Tax", "Percentage of Calculation"],
  "Expenses (Direct)": ["GST Applicable"],
  "Expenses (Indirect)": ["GST Applicable"],
  "Fixed Assets": ["Mailing name", "Address"],
  "Income (Direct)": ["GST Applicable"],
  "Income (Indirect)": ["GST Applicable"],
  "Indirect Expenses": ["GST Applicable"],
  "Indirect Incomes": ["GST Applicable"],
  "Investments": ["Mailing name"],
  "Loans & Advances (Asset)": ["Mailing name"],
  "Loans (Liability)": ["Mailing name"],
  "Misc. Expenses (ASSET)": ["Mailing name"],
  "Provisions": ["Mailing name"],
  "Purchase Accounts": ["GST Applicable", "Taxability", "HSN/SAC"],
  "Reserves & Surplus": ["Mailing name"],
  "Retained Earnings": ["Mailing name"],
  "Sales Accounts": ["GST Applicable", "Taxability", "HSN/SAC", "Type of Supply"],
  "Secured Loans": ["Mailing name"],
  "Stock-in-Hand": ["Mailing name"],
  "Sundry Creditors": ["PAN/IT No", "GSTIN/UIN", "Mailing name", "Address", "State", "Pincode"],
  "Sundry Debtors": ["PAN/IT No", "GSTIN/UIN", "Mailing name", "Address", "State", "Pincode"],
  "Suspense Alc": ["Mailing name"],
  "Unsecured Loans": ["Mailing name"]
};

// Map frontend fields to database columns (based on your expanded schema)
const fieldToColumnMap = {
  "Name": "name",
  "Under": "parent",
  "Mailing name": "mailing_name",
  "Bill by bill": "bill_by_bill",
  "Registration Type": "registration_type",
  "Type of Ledger": "type_of_ledger",
  "Inventory Affected": "inventory_affected",
  "Credit period": "credit_period",
  "GST Applicable": "gst_applicable",
  "Set/Alter GST Details": "set_alter_gst_details",
  "Taxability": "taxability",
  "Integrated Tax": "integrated_tax",
  "Cess Tax": "cess_tax",
  "Applicable Date": "applicable_date",
  "Address": "address",
  "State": "state",
  "Pincode": "pincode",
  "PAN/IT No": "pan_it_no",
  "GSTIN/UIN": "gstin_uin",
  // Button-specific fields
  "Account Holder Name": "account_holder_name",
  "Alc No": "alc_no",
  "IFS code": "ifs_code",
  "SWIFT code": "swift_code",
  "Bank Name": "bank_name",
  "Branch": "branch",
  "Type of Duty Tax": "type_of_duty_tax",
  "Percentage of Calculation": "percentage_of_calculation",
  "HSN/SAC": "hsn_sac",
  "Type of Supply": "type_of_supply"
};

function AddLedgerButton({ onAdd }) {
  const [showModal, setShowModal] = useState(false);
  const [ledgerName, setLedgerName] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [dynamicFields, setDynamicFields] = useState([]);
  const [fieldValues, setFieldValues] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState(null);

  const userEmail = sessionStorage.getItem("userEmail");
  const selectedCompany = sessionStorage.getItem("selectedCompany");

  useEffect(() => {
    setDynamicFields(requiredFieldsByLedgerGroup[selectedGroup] || []);
    setFieldValues({});
  }, [selectedGroup]);

  const handleFieldChange = (field, value) => {
    setFieldValues(prev => ({ ...prev, [field]: value }));
  };

  // Check if the ledger name already exists
  const checkIfLedgerExists = async (name) => {
    try {
      const tables = await axios.get('/getUserExcelLedgerUploads', {
        params: { email: userEmail, company: selectedCompany }
      });
      
      if (tables.data.length === 0) return false;
      
      // Just check the most recent table
      const latestTable = tables.data[0].temp_table;
      
      const ledgers = await axios.get('/excelLedgersData', {
        params: { tempTable: latestTable }
      });
      
      return ledgers.data.some(ledger => 
        ledger.name.toLowerCase() === name.toLowerCase()
      );
    } catch (error) {
      console.error("Error checking if ledger exists:", error);
      return false;
    }
  };

  const handleSave = async () => {
    if (!ledgerName) {
      setError("Ledger name is required");
      return;
    }

    if (!selectedGroup) {
      setError("Ledger group is required");
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // First check if ledger already exists
      const exists = await checkIfLedgerExists(ledgerName);
      
      if (exists) {
        setShowDuplicateWarning(true);
        setDuplicateInfo({
          name: ledgerName,
          message: `Ledger "${ledgerName}" already exists`
        });
        setLoading(false);
        return;
      }

      // Create ledger data object with all possible fields
      const ledgerData = {
        "Name": ledgerName,
        "Under": selectedGroup,
        "Mailing name": fieldValues["Mailing name"] || ledgerName,
        "Bill by bill": "Yes",
        "Registration Type": fieldValues["Registration Type"] || "",
        "Type of Ledger": fieldValues["Type of Ledger"] || "",
        "Inventory Affected": "Yes",
        "Credit period": fieldValues["Credit period"] || "",
        "GST Applicable": fieldValues["GST Applicable"] || "",
        "Set/Alter GST Details": fieldValues["Set/Alter GST Details"] || "",
        "Taxability": fieldValues["Taxability"] || "",
        "Integrated Tax": fieldValues["Integrated Tax"] || "",
        "Cess Tax": fieldValues["Cess Tax"] || "",
        "Applicable Date": fieldValues["Applicable Date"] || "",
        "Address": fieldValues["Address"] || "",
        "State": fieldValues["State"] || "",
        "Pincode": fieldValues["Pincode"] || "",
        "PAN/IT No": fieldValues["PAN/IT No"] || "",
        "GSTIN/UIN": fieldValues["GSTIN/UIN"] || "",
        // Button-specific fields
        "Account Holder Name": fieldValues["Account Holder Name"] || "",
        "Alc No": fieldValues["Alc No"] || "",
        "IFS code": fieldValues["IFS code"] || "",
        "SWIFT code": fieldValues["SWIFT code"] || "",
        "Bank Name": fieldValues["Bank Name"] || "",
        "Branch": fieldValues["Branch"] || "",
        "Type of Duty Tax": fieldValues["Type of Duty Tax"] || "",
        "Percentage of Calculation": fieldValues["Percentage of Calculation"] || "",
        "HSN/SAC": fieldValues["HSN/SAC"] || "",
        "Type of Supply": fieldValues["Type of Supply"] || ""
      };

      // Fill in dynamic fields based on ledger group
      dynamicFields.forEach(field => {
        if (fieldValues[field]) {
          ledgerData[field] = fieldValues[field];
        }
      });

      // Create unique table name for button entries
      const fileName = `Button_Entry_${Date.now()}.xlsx`;
      
      const payload = {
        email: userEmail,
        company: selectedCompany,
        data: [ledgerData],
        uploadedFileName: fileName
      };
      
      console.log("Sending ledger data:", payload);
      
      const response = await axios.post('/uploadExcelLedger', payload);
      console.log("Response from server:", response.data);

      // Notify parent component about the new ledger
      if (onAdd && typeof onAdd === 'function') {
        onAdd(ledgerName);
      }

      setSuccess('Ledger saved successfully!');
      
      // Clear form after success
      setTimeout(() => {
        setShowModal(false);
        setLedgerName('');
        setSelectedGroup('');
        setFieldValues({});
        setSuccess('');
      }, 2000);
    } catch (err) {
      console.error("Error saving ledger:", err);
      setError(err.response?.data?.error || "Error saving ledger");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseDuplicateWarning = () => {
    setShowDuplicateWarning(false);
    setDuplicateInfo(null);
  };

  return (
    <>
      <button className="btn btn-info shadow rounded-pill px-4 py-2 fw-bold" onClick={() => setShowModal(true)}>➕ Add Ledger</button>

      {showModal && (
        <div className="ledger-modal">
          <div className="ledger-modal-content p-4 rounded shadow-lg bg-white">
            <h4 className="mb-3">🧾 Add New Ledger</h4>

            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <input
              type="text"
              className="form-control mb-3"
              placeholder="Enter ledger name"
              value={ledgerName}
              onChange={(e) => setLedgerName(e.target.value)}
            />

            <select
              className="form-select mb-3"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}>
              <option value="">Select Ledger Group</option>
              {ledgerGroups.map(group => (
                <option key={group}>{group}</option>
              ))}
            </select>

            {dynamicFields.map((field, index) => (
              <input
                key={index}
                type="text"
                className="form-control mb-2"
                placeholder={field}
                value={fieldValues[field] || ''}
                onChange={(e) => handleFieldChange(field, e.target.value)}
              />
            ))}
            <div className="button-row">
              <button 
                className="btn btn-outline-secondary" 
                onClick={() => setShowModal(false)} 
                disabled={loading}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleSave} 
                disabled={loading}
              >
                {loading ? 'Saving...' : '💾 Save Ledger'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Warning Modal */}
      {showDuplicateWarning && duplicateInfo && (
        <div className="ledger-modal">
          <div className="ledger-modal-content p-4 rounded shadow-lg bg-white">
            <h4 className="mb-3 text-danger">⚠️ Duplicate Ledger</h4>
            <p>{duplicateInfo.message}</p>
            <p>A ledger with this name already exists in your tables.</p>
            <div className="button-row">
              <button 
                className="btn btn-primary" 
                onClick={handleCloseDuplicateWarning}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AddLedgerButton;
