// controllers/tallyController.js
const pool = require('../config/db');
const { formatCompanyName } = require('../utils/helpers');
const axios = require('axios');

exports.getTallyTransactions = async (req, res) => {
  try {
    const { tempTable } = req.query;
    if (!tempTable) {
      return res.status(400).json({ error: 'tempTable is required' });
    }
    const sql = `SELECT COUNT(*) FROM temporary_transactions WHERE upload_id = $1 AND status = 'sent'`;
    const result = await pool.query(sql, [tempTable]);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Error fetching tally transactions:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

exports.sendToTally = async (req, res) => {
  try {
    const { company, tempTable, selectedTransactions } = req.body;
    if (!company || !tempTable) {
      return res.status(400).json({ error: 'Missing company or tempTable' });
    }
    const formattedCompany = formatCompanyName(company);
    let result;
    if (selectedTransactions && selectedTransactions.length > 0) {
      result = await pool.query(
        `SELECT * FROM temporary_transactions
         WHERE upload_id = $1
           AND assigned_ledger IS NOT NULL
           AND assigned_ledger != ''
           AND id = ANY($2)
         ORDER BY transaction_date`,
        [tempTable, selectedTransactions]
      );
    } else {
      result = await pool.query(
        `SELECT * FROM temporary_transactions
         WHERE upload_id = $1
           AND assigned_ledger IS NOT NULL
           AND assigned_ledger != ''
         ORDER BY transaction_date`,
        [tempTable]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No transactions found with assigned ledgers' });
    }

    const transformedData = result.rows.map(row => ({
      id: row.id,
      transaction_date: row.transaction_date ? row.transaction_date.toISOString().split('T')[0] : null,
      transaction_type: row.transaction_type ? row.transaction_type.toLowerCase() : '',
      description: row.description ? row.description.trim() : '',
      amount: Math.abs(parseFloat(row.amount || 0)),
      bank_account: row.bank_account ? row.bank_account.trim() : '',
      assigned_ledger: row.assigned_ledger ? row.assigned_ledger.trim() : ''
    }));

    const invalidTransactions = transformedData.filter(
      trans => !trans.transaction_date || !trans.bank_account || !trans.assigned_ledger || !trans.amount
    );

    if (invalidTransactions.length > 0) {
      return res.status(400).json({
        error: 'Some transactions have invalid data',
        invalidTransactions
      });
    }

    console.log('Sending to tally_connector:', {
      company: formattedCompany,
      transactionCount: transformedData.length,
      sampleTransaction: transformedData[0]
    });

    try {
      const response = await axios.post('http://localhost:5000/api/tallyConnector', {
        company: formattedCompany,
        data: transformedData
      });

      if (selectedTransactions && selectedTransactions.length > 0) {
        await pool.query(
          `UPDATE temporary_transactions SET status = 'sent' WHERE upload_id = $1 AND id = ANY($2)`,
          [tempTable, selectedTransactions]
        );
      } else {
        await pool.query(
          `UPDATE temporary_transactions
           SET status = 'sent'
           WHERE upload_id = $1
             AND assigned_ledger IS NOT NULL
             AND assigned_ledger != ''`,
          [tempTable]
        );
      }

      return res.json({
        message: 'Data sent to Tally successfully',
        transactionsSent: transformedData.length,
        tallyResponse: response.data
      });
    } catch (axiosError) {
      console.error('Tally connector error:', axiosError.response?.data || axiosError.message);
      return res.status(500).json({
        error: 'Failed to send data to Tally connector',
        details: axiosError.response?.data || axiosError.message
      });
    }
  } catch (err) {
    console.error('Error in sendToTally:', err);
    res.status(500).json({
      error: 'Server error',
      details: err.message
    });
  }
};

exports.tallyConnector = async (req, res) => {
  try {
    const { company, data } = req.body;
    if (!company || !data) {
      return res.status(400).json({ error: 'Missing data' });
    }
    console.log('Processing data for Tally:', { company, data });
    res.json({ message: 'Tally Connector received the data successfully' });
  } catch (err) {
    console.error('Error processing Tally data:', err);
    res.status(500).json({ error: 'Tally processing error' });
  }
};
exports.checkTallyConnector = async (req, res) => {
  try {
    // Call the Tally Connector's health endpoint.
    // Make sure your Flask Tally Connector has a corresponding endpoint, e.g.:
    // @app.route('/health', methods=['GET'])
    // def health():
    //     return jsonify({ "status": "Tally Connector is running" }), 200
    const response = await axios.get('http://127.0.0.1:5000/health');
    res.json({
      message: "Tally Connector is running",
      data: response.data
    });
  } catch (error) {
    console.error("Tally Connector health check failed:", error.message);
    res.status(500).json({
      message: "Tally Connector is offline or unreachable",
      error: error.message
    });
  }
};
exports.sendJournalToTally = async (req, res) => { 
  try {
    const { company, tempTable, selectedRows } = req.body;

    // Validate company and at least one source of data (either tempTable or selectedRows)
    if (!company || (!selectedRows && !tempTable)) {
      return res.status(400).json({ error: 'Missing company or data source (tempTable/selectedRows)' });
    }

    let journalData = [];
    if (selectedRows && Array.isArray(selectedRows) && selectedRows.length > 0) {
      // Use the selected rows sent from the frontend
      journalData = selectedRows;
    } else {
      // Fallback: if selectedRows is not provided, use the tempTable to query all data
      const result = await pool.query(`SELECT * FROM ${tempTable}`);
      journalData = result.rows;
    }

    if (journalData.length === 0) {
      return res.status(404).json({ error: 'No journal data found' });
    }

    // Send journalData to TallyConnector
    const tallyResponse = await axios.post('http://127.0.0.1:5000/api/tallyConnector', {
      company,
      journalData,
    });

    res.json({
      message: 'Journal data sent to Tally successfully',
      tallyResponse: tallyResponse.data,
    });
  } catch (err) {
    console.error('❌ Error sending journal data to Tally:', err.message);
    res.status(500).json({ error: 'Failed to send journal data to Tally' });
  }
};

 exports.sendLedgerToTally = async (req, res) => {
  try {
    const { company, tempTable } = req.body;
    if (!company || !tempTable) {
      return res.status(400).json({ error: 'Missing company or tempTable' });
    }

    // 1. Query the ledger rows from the temporary table
    const result = await pool.query(`SELECT * FROM ${tempTable}`);
    const ledgerData = result.rows;

    if (ledgerData.length === 0) {
      return res.status(404).json({ error: 'No ledger data found in temporary table' });
    }

    // 2. Send data to the local TallyConnector API
    const tallyResponse = await axios.post('http://127.0.0.1:5000/api/tallyConnector', {
      company,
      ledgerData,
    });

    res.json({
      message: 'Ledger data sent to Tally successfully',
      tallyResponse: tallyResponse.data,
    });
  } catch (err) {
    console.error('❌ Error sending ledger data to Tally:', err.message);
    res.status(500).json({ error: 'Failed to send ledger data to Tally', details: err.message });
  }
};