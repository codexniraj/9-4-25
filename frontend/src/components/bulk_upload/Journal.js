import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import NavbarWithCompany from '../NavbarWithCompany';
import './Journal.css';
import { useCompanyContext } from '../../context/CompanyContext';
import Sidebar from '../Sidebar';

function Journal() {
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const { selectedCompany, setSelectedCompany } = useCompanyContext();
  const userEmail = sessionStorage.getItem('userEmail');

  const maxFileSize = 50 * 1024 * 1024;

  const compulsoryWithItems = [
    "Journal No", "Reference No", "Date", "Particulars", "Name Of Item", "Quantity", "Rate", "Dr/Cr", "Amount"
  ];

  const compulsoryWithoutItems = [
    "Journal No", "Reference No", "Date", "Particulars", "Dr/Cr", "Amount"
  ];

  useEffect(() => {
    if (selectedCompany) fetchUploadedFiles();
  }, [selectedCompany]);

  const fetchUploadedFiles = async () => {
    try {
      const res = await axios.get("http://localhost:3001/api/getUserJournelUploads", {
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

    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      /**
       * KEY CHANGE:
       * Set `raw: false` so XLSX uses the *displayed* cell text (cell.w),
       * rather than the raw numeric value (cell.v).
       * If your Excel is formatted to show integers,
       * you'll get those integer strings instead of 10.6667.
       */
      const json = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: false
      });

      if (!json || json.length === 0) {
        return setError("Excel file is empty or unreadable.");
      }

      // Determine if we have "with items"
      const keys = Object.keys(json[0] || {});
      const isWithItems = keys.includes("Name Of Item");

      // Check compulsory headers
      const compulsory = isWithItems ? compulsoryWithItems : compulsoryWithoutItems;
      const missingHeaders = compulsory.filter(key => !keys.includes(key));
      if (missingHeaders.length > 0) {
        return setError(`Missing compulsory headers: ${missingHeaders.join(', ')}`);
      }

      try {
        setUploading(true);

        // Now `json` uses the displayed strings from Excel.
        // If you need to parse them as integers, do so here
        // e.g. parseInt(json[row]["Reference No"], 10).

        const res = await axios.post("http://localhost:3001/api/uploadJournal", {
          email: userEmail,
          company: selectedCompany,
          data: json,
          withItems: isWithItems,
          uploadedFileName: file.name
        });

        setUploadedFiles(prev => [
          ...prev,
          {
            uploaded_file: file.name,
            created_at: new Date().toISOString(),
            temp_table: res.data.table,
            invalid_ledgers: res.data.invalidLedgers || []
          }
        ]);
      } catch (err) {
        setError(err.response?.data?.error || "Failed to upload data.");
      } finally {
        setUploading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleDeleteSelected = async (tableName) => {
    try {
      await axios.delete('http://localhost:3001/api/deleteJournelUpload', {
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
    window.location.href = "/excel-view";
  };

  return (
    <>
      <NavbarWithCompany
        selectedCompany={selectedCompany}
        setSelectedCompany={setSelectedCompany}
      />

      <div className="journal-wrapper">
        <Sidebar />
        <div className="journal-container container py-4">
          <h2 className="text-center mb-4">Journal Bulk Upload</h2>

          <div className="row mb-4 justify-content-center">
            <div className="col-md-auto">
              <a
                href="https://docs.google.com/spreadsheets/d/1iLWmBJ_pSLhtzviGO9Hx9bWlQM6f-_fb/edit?usp=sharing"
                className="btn btn-primary"
                target="_blank"
                rel="noreferrer"
              >
                Download With-Item Sample
              </a>
            </div>
            <div className="col-md-auto">
              <a
                href="https://docs.google.com/spreadsheets/d/1V7xpkNZlKVkkDn7AFv7ERQkW7cFUASjl/edit?usp=sharing"
                className="btn btn-secondary"
                target="_blank"
                rel="noreferrer"
              >
                Download Without-Item Sample
              </a>
            </div>
          </div>

          <div className="row g-4">
            <div className="col-md-12">
              <div
                className="card shadow-sm"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleFileUpload({ target: { files: e.dataTransfer.files } })}
              >
                <div className="card-body text-center">
                  <label htmlFor="fileUpload" className="upload-label">
                    <input
                      type="file"
                      id="fileUpload"
                      accept=".xls, .xlsx"
                      onChange={handleFileUpload}
                      hidden
                    />
                    <span className="btn btn-success btn-lg">📁 Upload Excel File</span>
                  </label>

                  <p className="text-muted mt-3">
                    Drag and drop supported. Max 50MB. (.xls, .xlsx)
                  </p>

                  <div className="alert alert-info text-start mt-4">
                    <strong>Upload Rules:</strong>
                    <ul className="mb-0">
                      <li className="text-danger">
                        Red-marked fields are compulsory.
                      </li>
                      <li>Ensure format matches sample file.</li>
                      <li>Only .xls and .xlsx files allowed.</li>
                    </ul>
                  </div>

                  {error && <p className="text-danger mt-3">{error}</p>}
                  {uploading && <p className="text-info mt-3">Uploading...</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="uploaded-files-section mt-5">
            <h5 className="mb-3">Uploaded Files</h5>
            <div className="row">
              {uploadedFiles.map((file, index) => (
                <div className="col-md-4 mb-3" key={file.temp_table || index}>
                  <div
                    className="card shadow-sm h-100"
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleViewUpload(file)}
                  >
                    <div className="card-body">
                      <h5 className="card-title">{file.uploaded_file}</h5>
                      <p className="card-text">
                        <strong>Uploaded:</strong>
                        <br />
                        {new Date(file.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="card-footer text-end">
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSelected(file.temp_table);
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="dropdown ms-auto">
          <ul className="dropdown-menu dropdown-menu-dark dropdown-menu-end">
            <li>
              <a
                className="dropdown-item"
                href="https://youtube.com"
                target="_blank"
                rel="noreferrer"
              >
                📹 YouTube
              </a>
            </li>
            <li>
              <a className="dropdown-item" href="/docs">
                📘 Documentation
              </a>
            </li>
            <li>
              <a className="dropdown-item" href="/help">
                Help
              </a>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}

export default Journal;
