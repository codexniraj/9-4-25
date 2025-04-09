// components/BankSelection.js
import React from "react";

export default function BankSelection({ bankAccounts, selectedBankAccount, onChange }) {
  return (
    <div className="bank-select-container">
      <label htmlFor="bank-select">Select Bank Account:</label>
      <select id="bank-select" value={selectedBankAccount} onChange={(e) => onChange(e.target.value)}>
        <option value="">--Choose--</option>
        {bankAccounts.map((bank, i) => (
          <option key={i} value={bank}>{bank}</option>
        ))}
      </select>
    </div>
  );
}
