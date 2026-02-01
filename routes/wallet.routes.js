const express = require('express');
const router = express.Router();
const {
  getWallet,
  createAddMoneyOrder,
  verifyAndAddMoney,
  payTournamentWithWallet,
  requestWithdrawal,
  getWithdrawals,
  updateWithdrawalInfo
} = require('../controllers/wallet.controller');
const { protect } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(protect);

router.get('/', getWallet);
router.post('/add-money', createAddMoneyOrder);
router.post('/verify-payment', verifyAndAddMoney);
router.post('/pay-tournament', payTournamentWithWallet);
router.post('/withdraw', requestWithdrawal);
router.get('/withdrawals', getWithdrawals);
router.put('/withdrawal-info', updateWithdrawalInfo);

module.exports = router;