const express = require('express');
const router = express.Router();
const {
  createOrder,
  verifyPayment,
  getPayment,
  getMyPayments,
  processRefund
} = require('../controllers/payment.controller');
const { protect, adminOnly } = require('../middleware/auth.middleware');

// Protected routes
router.post('/create-order', protect, createOrder);
router.post('/verify', protect, verifyPayment);
router.get('/my-payments', protect, getMyPayments);
router.get('/:id', protect, getPayment);

// Admin routes
router.post('/:id/refund', protect, adminOnly, processRefund);

module.exports = router;