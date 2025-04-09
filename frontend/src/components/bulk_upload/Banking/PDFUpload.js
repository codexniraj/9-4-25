// components/PDFUpload.js
import React from "react";
import axios from "axios";

export default function PDFUpload({
  userEmail,
  selectedCompany,
  selectedBankAccount,
  sendData,
  wsStatus,
  onPDFUploadComplete,
  setIsProcessing,
  userType // "gold" or "silver"
}) {
  const handlePDFUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      alert("Please select a PDF file");
      return;
    }
    if (!selectedBankAccount) {
      alert("Please select a bank account before uploading a file.");
      return;
    }
    // For silver users, ensure WebSocket is connected
    if (userType === "silver" && wsStatus !== "Connected") {
      alert("Tally Connector is not connected. Please wait for reconnection.");
      console.error("WebSocket is not connected. Current status:", wsStatus);
      return;
    }
    console.log("Starting PDF processing...");
    setIsProcessing(true);
    uploadPDF(file);
  };

  // Always parse the PDF via HTTP (EC2)
  const uploadPDF = async (file) => {
    try {
      console.log("Uploading PDF for parsing:", file.name);
      const formData = new FormData();
      formData.append("email", userEmail);
      formData.append("company", selectedCompany);
      formData.append("file", file);

      // Parse the PDF on EC2
      const parseResponse = await axios.post("http://3.108.64.167:8000/process-pdf", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      console.log("Parse response received:", parseResponse.data);

      if (parseResponse.data.status === "success") {
        const pdfRows = parseResponse.data.parsed_data;
        console.log("Parsed PDF rows count:", pdfRows.length);
        const chosenBank = selectedBankAccount || "PDF Bank";
        console.log("User type:", userType);

        if (userType === "gold") {
          // For gold users, store on the server via HTTP
          console.log("User is gold. Uploading parsed data to server via HTTP.");
          const uploadResp = await axios.post("/api/uploadExcel", {
            email: userEmail,
            company: selectedCompany,
            bankAccount: chosenBank,
            data: pdfRows,
            fileName: file.name
          });
          console.log("Upload response from server:", uploadResp.data);
          if (uploadResp.data.table) {
            console.log("PDF data stored on server with table id:", uploadResp.data.table);
            onPDFUploadComplete(uploadResp.data.table, file.name);
          }else {
            console.error("Upload response did not return a table id");
          }

        } else if (userType === "silver") {
          console.log("User is silver. Sending parsed PDF data via WebSocket to local DB.");
          // For silver users, send the parsed JSON via WebSocket to store in the local DB
          const wsPayload = {
            type: "store_pdf_data",
            user_email: userEmail,
            company_id: selectedCompany,
            bank_account: chosenBank,
            data: pdfRows,
            fileName: file.name,
          };
          console.log("WebSocket payload:", wsPayload);
          sendData(JSON.stringify(wsPayload));
          // Optionally, you can wait for an acknowledgment from the WebSocket server.
          // For now, we call onPDFUploadComplete immediately with a placeholder table id.
          console.log("Immediately calling onPDFUploadComplete with placeholder for silver user");
          onPDFUploadComplete("local_table_placeholder", file.name);
        }
      } else {
        console.error("PDF parse error:", parseResponse.data.status);
      }
    } catch (error) {
      console.error("Error uploading PDF to server:", error);
    } finally {
      console.log("PDF processing finished, resetting processing state");
      setIsProcessing(false);
    }
  };

  return (
    <div>
      <div className="file-upload-container">
        <label>Upload PDF to Server (EC2):</label>
        <input
          type="file"
          accept=".pdf"
          onChange={handlePDFUpload}
        />
      </div>
    </div>
  );
}
