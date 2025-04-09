// components/ExcelFileUpload.js
import React, { useState }  from "react";
import * as XLSX from "xlsx";
import axios from "axios";

export default function ExcelFileUpload({ userEmail, selectedCompany, selectedBankAccount, onUploadComplete }) {
  
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Function to transform Excel data
  const transformExcelData = (data) => {
    return data.map((row) => ({
      transaction_date: row.Date,
      transaction_type: row.Type?.toLowerCase(),
      description: row.Description,
      amount: row.Amount,
      assignedLedger: row.assignedLedger || ""
    }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!selectedBankAccount) {
      alert("Please select a bank account before uploading a file.");
      return;
    }
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (rawData.length > 0) {
        const headers = rawData[0];
        const rows = rawData.slice(1).map((row) => {
          const rowData = {};
          headers.forEach((header, i) => {
            rowData[header] = row[i];
          });
          rowData.assignedLedger = "";
          return rowData;
        });
        const transformed = transformExcelData(rows);
        try {
          const resp = await axios.post("/api/uploadExcel", {
            email: userEmail,
            company: selectedCompany,
            bankAccount: selectedBankAccount,
            data: transformed,
            fileName: file.name
          });
          // onUploadComplete should update parent state with the upload id (tempTable) and file info
          onUploadComplete(resp.data.table, file.name);
        } catch (err) {
          console.error("Error saving data to DB:", err);
        } finally{
          setIsProcessing(false);
        }
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="file-upload-container">
      <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} />
      {isProcessing && <div className="spinner">Processing...</div>}
    </div>
  );
}
