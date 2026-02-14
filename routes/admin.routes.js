const express = require('express');
const router = express.Router();
const {
  createTournament,
  updateTournament,
  deleteTournament,
  submitMatchResult,
  declareWinners,
  getParticipants,
  verifyPayment,
  rejectPayment, // ✅ NEW
  getDashboardStats
} = require('../controllers/admin.controller');

const {
  getAllWithdrawals,
  processWithdrawal,
  getWalletStats
} = require('../controllers/admin.wallet.controller');

const { getManualPayments, decideManualPayment } = require("../controllers/admin.payments.controller");
const { getUsers, banUser, unbanUser } = require("../controllers/admin.users.controller");
const { protect, adminOnly } = require('../middleware/auth.middleware');

router.use(protect);
router.use(adminOnly);

router.get('/dashboard', getDashboardStats);

router.get("/users", getUsers);
router.put("/users/:id/ban", banUser);
router.put("/users/:id/unban", unbanUser);

// ✅ Manual payments review
router.get("/manual-payments", getManualPayments);
router.put("/manual-payments/:id/decision", decideManualPayment);

router.post('/tournaments', createTournament);
router.put('/tournaments/:id', updateTournament);
router.delete('/tournaments/:id', deleteTournament);

router.post('/tournaments/:id/results', submitMatchResult);
router.post('/tournaments/:id/winners', declareWinners);
router.get('/tournaments/:id/participants', getParticipants);

router.put('/payments/:id/verify', verifyPayment);
router.put('/payments/:id/reject', rejectPayment); // ✅ NEW

router.get('/withdrawals', getAllWithdrawals);
router.put('/withdrawals/:walletId/:withdrawalId', processWithdrawal);
router.get('/wallet-stats', getWalletStats);

module.exports = router;