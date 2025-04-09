import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import axios from '../../api/axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import NavbarWithCompany from '../NavbarWithCompany';
import './Ledger.css';
import Sidebar from '../Sidebar';
import { useCompanyContext } from '../../context/CompanyContext';

function Ledger() {
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const { selectedCompany, setSelectedCompany } = useCompanyContext();
  const userEmail = sessionStorage.getItem('userEmail');
  const [duplicateModal, setDuplicateModal] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const [skippedReport, setSkippedReport] = useState(null);
  const [currentFile, setCurrentFile] = useState(null);
  const [processedData, setProcessedData] = useState(null);

  const maxFileSize = 50 * 1024 * 1024;

  const compulsoryLedgerHeaders = [
    "Name", "Under", "Mailing name", "Bill by bill", "Registration Type",
    "Type of Ledger", "Inventory Affected", "Credit period", "GST Applicable",
    "Set/Alter GST Details", "Taxability", "Integrated Tax", "Cess Tax",
    "Applicable Date", "Address", "State", "Pincode", "PAN/IT No", "GSTIN/UIN"
  ];

  useEffect(() => {
    if (selectedCompany) fetchUploadedFiles();
  }, [selectedCompany]);

  const fetchUploadedFiles = async () => {
    try {
      const res = await axios.get("/getUserExcelLedgerUploads", {
        params: { email: userEmail, company: selectedCompany }
      });
      setUploadedFiles(res.data);
    } catch (err) {
      console.error("Failed to fetch uploaded files");
    }
  };

  const handleFileUpload = async (event) => {
    setError('');
    const file = event.target.files[0];
    if (!file) return;

    if (!userEmail || !selectedCompany) {
      return setError("Please login and select a company before uploading.");
    }

    if (file.size > maxFileSize) return setError("File size exceeds 50MB limit.");

    setCurrentFile(file);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!json || json.length === 0) return setError("Excel file is empty or unreadable.");

      const keys = Object.keys(json[0] || {});
      const missingHeaders = compulsoryLedgerHeaders.filter(key => !keys.includes(key));
      if (missingHeaders.length > 0) {
        return setError(`Missing compulsory headers: ${missingHeaders.join(', ')}`);
      }

      setProcessedData(json);

      try {
        setUploading(true);
        
        // First check if file with this name exists
        const checkResponse = await axios.post("/uploadExcelLedger", {
          email: userEmail,
          company: selectedCompany,
          data: [], // Empty data for check
          uploadedFileName: file.name,
          action: "check"
        });
        
        const result = checkResponse.data;

        // If duplicate file exists
        if (result.duplicate) {
          setUploading(false);
          
          if (result.identical) {
            // Same file with identical data
            setDuplicateInfo({
              type: 'identical',
              message: 'This file with identical data has already been uploaded.',
              existingTable: result.existingTable
            });
            setDuplicateModal(true);
            return;
          }
          
          // File exists but with different data
          setDuplicateInfo({
            type: 'different',
            message: 'A file with this name already exists but contains different data.',
            existingTable: result.existingTable,
            uniqueRows: result.uniqueNewRows.length,
            duplicateRows: result.duplicateRows.length
          });
          setDuplicateModal(true);
          return;
        }
        
        // If no duplicate, upload normally
        const uploadResponse = await uploadLedgerData(json, file.name, "upload");
        
        if (uploadResponse.skipped > 0) {
          setSkippedReport({
            count: uploadResponse.skipped,
            reportFile: uploadResponse.reportFile
          });
        }
        
        fetchUploadedFiles();
      } catch (err) {
        setError(err.response?.data?.error || "Failed to upload data.");
      } finally {
        setUploading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };
  
  const uploadLedgerData = async (data, fileName, action) => {
    const response = await axios.post("/uploadExcelLedger", {
      email: userEmail,
      company: selectedCompany,
      data: data,
      uploadedFileName: fileName,
      action: action
    });
    
    return response.data;
  };
  
  const handleDuplicateAction = async (action) => {
    try {
      setUploading(true);
      
      if (action === 'view') {
        // Open the existing file
        handleViewUpload({ temp_table: duplicateInfo.existingTable });
        setDuplicateModal(false);
      } else if (action === 'merge' || action === 'new') {
        // Perform the action (merge or create new)
        const uploadResponse = await uploadLedgerData(
          processedData, 
          currentFile.name, 
          action
        );
        
        // Show success message
        if (action === 'merge') {
          setDuplicateInfo({
            ...duplicateInfo,
            type: 'success',
            message: `Successfully merged ${uploadResponse.inserted} unique entries`,
            table: uploadResponse.table || duplicateInfo.existingTable
          });
        } else {
          setDuplicateInfo({
            ...duplicateInfo,
            type: 'success',
            message: 'Created new file with unique entries',
            table: uploadResponse.newTable
          });
          
          // Handle skipped ledgers report
          if (uploadResponse.skipped > 0) {
            setSkippedReport({
              count: uploadResponse.skipped,
              reportFile: uploadResponse.skippedReport
            });
          }
        }
        
        setCurrentFile(null);
        setProcessedData(null);
        
        // Refresh the file list
        fetchUploadedFiles();
      }
    } catch (error) {
      console.error('Error handling duplicate action:', error);
      setError(error.response?.data?.error || 'Failed to process your request');
      setDuplicateModal(false);
    } finally {
      setUploading(false);
    }
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
      
      // Clear the skipped report after download
      setSkippedReport(null);
      
    } catch (error) {
      console.error('Error downloading report:', error);
      setError('Failed to download the skipped ledgers report');
    }
  };

  const handleDeleteSelected = async (tableName) => {
    try {
      await axios.delete('/deleteExcelLedgerUpload', {
        data: { table: tableName }
      });
      fetchUploadedFiles();
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };

  const handleViewUpload = (file) => {
    sessionStorage.setItem('tempTable', file.temp_table);
    sessionStorage.setItem('uploadMeta', JSON.stringify({ invalidLedgers: file.invalid_ledgers || [] }));
    window.location.href = ('/ledger-excel-view');
  };

  return (
    <>
      <NavbarWithCompany
        selectedCompany={selectedCompany}
        setSelectedCompany={setSelectedCompany}
      />
  
      <div className="page-layout">
        <Sidebar />
  
        <div className="main-content">
          <div className="ledger-wrapper">
            <div className="ledger-container container py-4">
              <h2 className="text-center mb-4">Ledger Bulk Upload</h2>
  
              <div className="row mb-4 justify-content-center">
                <div className="col-md-auto">
                  <a
                    href="https://docs.google.com/spreadsheets/d/1cexMhJO--7lgyy5tw2cqt2Dkjnmm5PU_/edit?usp=sharing"
                    className="btn btn-primary"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download Ledger Sample
                  </a>
                </div>
              </div>
  
              <div className="row g-4">
                <div className="col-md-12">
                  <div className="card shadow-sm">
                    <div className="card-body text-center"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleFileUpload({ target: { files: e.dataTransfer.files } })}>
                      <label htmlFor="fileUpload" className="upload-label">
                        <input type="file" id="fileUpload" accept=".xls, .xlsx" onChange={handleFileUpload} hidden />
                        <span className="btn btn-success btn-lg">📁 Upload Excel File</span>
                      </label>
  
                      <p className="text-muted mt-3">Drag and drop supported. Max 50MB. (.xls, .xlsx)</p>
  
                      <div className="alert alert-info text-start mt-4">
                        <strong>Upload Rules:</strong>
                        <ul className="mb-0">
                          <li className="text-danger">Red-marked fields are compulsory.</li>
                          <li>Ensure format matches sample file.</li>
                          <li>Only .xls and .xlsx files allowed.</li>
                        </ul>
                      </div>
  
                      {error && <p className="text-danger mt-3">{error}</p>}
                      {uploading && <p className="text-info mt-3">Uploading...</p>}
                      
                      {/* Skipped Report Alert */}
                      {skippedReport && (
                        <div className="alert alert-warning mt-3">
                          <strong>Attention!</strong> {skippedReport.count} ledgers were skipped because they already exist.
                          <button className="btn btn-sm btn-warning ml-3" onClick={downloadSkippedReport}>
                            <i className="bi bi-download"></i> Download Report
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
  
              <div className="uploaded-files-section mt-5">
                <h5 className="mb-3">Uploaded Files</h5>
                <div className="row">
                  {uploadedFiles.map((file, index) => (
                    <div className="col-md-4 mb-3" key={file.temp_table || index}>
                      <div className="card shadow-sm h-100"
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleViewUpload(file)}>
                        <div className="card-body">
                          <h5 className="card-title">{file.uploaded_file}</h5>
                          <p className="card-text">
                            <strong>Uploaded:</strong><br />
                            {new Date(file.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="card-footer text-end">
                          <button className="btn btn-sm btn-outline-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSelected(file.temp_table);
                            }}>
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
  
            </div>
          </div>
        </div>
      </div>
      
      {/* Duplicate File Modal */}
      {duplicateModal && (
        <div className="modal show" style={{display: 'block', backgroundColor: 'rgba(0,0,0,0.5)'}}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                {duplicateInfo?.type === 'success' ? (
                  <h5 className="modal-title">
                    <i className="bi bi-check-circle-fill text-success me-2"></i>
                    Success
                  </h5>
                ) : (
                  <h5 className="modal-title">
                    <i className="bi bi-exclamation-triangle-fill text-warning me-2"></i>
                    Duplicate File Detected
                  </h5>
                )}
                <button type="button" className="close" onClick={() => setDuplicateModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                {duplicateInfo && (
                  <>
                    <p>{duplicateInfo.message}</p>
                    
                    {duplicateInfo.type === 'identical' ? (
                      <p>A file with this name already exists but contains different data.</p>
                    ) : duplicateInfo.type === 'different' ? (
                      <>
                        <p>What would you like to do?</p>
                        {duplicateInfo.uniqueRows > 0 ? (
                          <ul>
                            <li>
                              <strong>View existing file:</strong> Open the already uploaded file.
                            </li>
                            <li>
                              <strong>Merge unique entries:</strong> Add {duplicateInfo.uniqueRows} unique entries to the existing file.
                            </li>
                            <li>
                              <strong>Create new file:</strong> Create a new file with only the {duplicateInfo.uniqueRows} unique entries (will skip {duplicateInfo.duplicateRows} duplicate entries).
                            </li>
                          </ul>
                        ) : (
                          <p>All entries in this file already exist in the uploaded file.</p>
                        )}
                      </>
                    ) : duplicateInfo.type === 'success' ? (
                      <p>You can now view the updated data.</p>
                    ) : null}
                  </>
                )}
              </div>
              <div className="modal-footer">
                {duplicateInfo?.type === 'success' ? (
                  <>
                    <button className="btn btn-secondary" onClick={() => setDuplicateModal(false)}>
                      Close
                    </button>
                    <button className="btn btn-primary" onClick={() => {
                      handleViewUpload({ temp_table: duplicateInfo.table });
                      setDuplicateModal(false);
                    }}>
                      View File
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-secondary" onClick={() => setDuplicateModal(false)}>
                      <i className="bi bi-x-circle"></i> Cancel
                    </button>
                    
                    <button className="btn btn-info" onClick={() => handleDuplicateAction('view')}>
                      View Existing File
                    </button>
                    
                    {duplicateInfo && duplicateInfo.type === 'different' && duplicateInfo.uniqueRows > 0 && (
                      <>
                        <button className="btn btn-primary" onClick={() => handleDuplicateAction('merge')}>
                          Merge Unique Entries
                        </button>
                        
                        <button className="btn btn-warning" onClick={() => handleDuplicateAction('new')}>
                          Create New File
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Ledger;