import React from "react";
import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import Dashboard from "./pages/Dashboard";
import PreviewPage from "./components/bulk_upload/Banking/PreviewPage";
import Banking from "./components/bulk_upload/Banking/Banking";
import Journal from "./components/bulk_upload/Journal";
import Journelexcelview from './components/bulk_upload_view/Journelexcelview';
// import Ledger from './components/bulk_upload/Ledger';
import Ledger from "./components/bulk_upload/Ledger";
import LedgerExcelView from "./components/bulk_upload_view/LedgerExcelView";
import SetUserType from "./components/SetUserType";
import "./App.css";

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/home" element={<Dashboard />} />
        <Route path="/preview" element={<PreviewPage />} />
        <Route path="/bulk-upload/journal" element={<Journal />} />
        <Route path="/bulk-upload/ledger" element={<Ledger/>}/>
        <Route path="/excel-view" element={<Journelexcelview />} />
        <Route path="/ledger-excel-view" element={<LedgerExcelView />}/>
        <Route path="/bulk-upload/banking" element={<Banking/>}/>
      </Routes>
      
      {/* Add the SetUserType component only in development */}
      {isDevelopment && <SetUserType />}
    </>
  );
}

export default App;
