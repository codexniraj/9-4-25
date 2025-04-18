// routes/transactions.js
const express = require('express');
const router = express.Router();
const transactionsController = require('../controllers/transactionsController');

router.post('/uploadExcel', transactionsController.uploadExcel);
router.post('/deleteTransaction', transactionsController.deleteTransaction);

// Wrap the getAllTempTables endpoint to handle errors and provide mock data
router.get('/getAllTempTables', async (req, res) => {
  try {
    // Try to use the controller function
    await transactionsController.getAllTempTables(req, res);
  } catch (error) {
    console.error("Error in getAllTempTables:", error);
    // Return error instead of mock data
    res.status(500).json({ error: "Error fetching temp tables", details: error.message });
  }
});

router.get('/getTempTable', transactionsController.getTempTable);
router.post('/updateTempExcel', transactionsController.updateTempExcel);

// Wrap the getTempLedgers endpoint to handle errors and provide mock data
router.get('/tempLedgers', async (req, res) => {
  try {
    // Try to use the controller function
    await transactionsController.getTempLedgers(req, res);
  } catch (error) {
    console.error("Error in getTempLedgers:", error);
    // Return error instead of mock data
    res.status(500).json({ error: "Error fetching ledger data", details: error.message });
  }
});

module.exports = router;
