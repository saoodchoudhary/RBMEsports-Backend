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
  getDashboardStats
} = require('../controllers/admin.controller');

const {
  getAllWithdrawals,
  processWithdrawal,
  getWalletStats
} = require('../controllers/admin.wallet.controller');

const { getUsers, banUser, unbanUser } = require("../controllers/admin.users.controller"); // NEW
const { protect, adminOnly } = require('../middleware/auth.middleware');

// All routes require admin access
router.use(protect);
router.use(adminOnly);

// Dashboard
router.get('/dashboard', getDashboardStats);

// Users management (NEW)
router.get("/users", getUsers);
router.put("/users/:id/ban", banUser);
router.put("/users/:id/unban", unbanUser);

// Tournament management
router.post('/tournaments', createTournament);
router.put('/tournaments/:id', updateTournament);
router.delete('/tournaments/:id', deleteTournament);

// Match & Results
router.post('/tournaments/:id/results', submitMatchResult);
router.post('/tournaments/:id/winners', declareWinners);
router.get('/tournaments/:id/participants', getParticipants);

// Payment management
router.put('/payments/:id/verify', verifyPayment);

// Wallet management
router.get('/withdrawals', getAllWithdrawals);
router.put('/withdrawals/:walletId/:withdrawalId', processWithdrawal);
router.get('/wallet-stats', getWalletStats);

module.exports = router;