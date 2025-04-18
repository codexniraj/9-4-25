// routes/tally.js
const express = require('express');
const router = express.Router();
const tallyController = require('../controllers/tallyController');

router.get('/tallyTransactions', tallyController.getTallyTransactions);
router.post('/sendToTally', tallyController.sendToTally);
router.post('/tallyConnector', tallyController.tallyConnector);
router.post('/checkTallyConnector', tallyController.checkTallyConnector);
router.post('/sendJournalToTally', tallyController.sendJournalToTally);
router.post('/sendLedgerToTally' , tallyController.sendLedgerToTally);
module.exports = router;
