const express = require('express');
const router = express.Router();

// Import all route files
const authRoutes = require('./auth.routes');
const tournamentRoutes = require('./tournament.routes');
const paymentRoutes = require('./payment.routes');
const teamRoutes = require('./team.routes');
const adminRoutes = require('./admin.routes');

// NEW
const couponRoutes = require('./coupon.routes');
const tournamentRoomRoutes = require("./tournament.room.routes");
const matchResultRoutes = require("./matchResult.routes");
const winnerRoutes = require("./winner.routes");

// Route groups
router.use('/auth', authRoutes);
router.use('/tournaments', tournamentRoutes);
router.use('/payments', paymentRoutes);
router.use('/teams', teamRoutes);
router.use('/admin', adminRoutes);


// Wallet routes (add this line)
router.use('/wallet', require('./wallet.routes'));

// NEW
router.use('/coupons', couponRoutes);
router.use("/tournaments", tournamentRoomRoutes);
router.use("/", matchResultRoutes);
router.use("/", winnerRoutes);


// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API documentation
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'RBM ESports API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      tournaments: '/api/tournaments',
      payments: '/api/payments',
      teams: '/api/teams',
      admin: '/api/admin',
      coupons: '/api/coupons'
    },
    documentation: 'https://docs.rbm-esports.com'
  });
});

module.exports = router;