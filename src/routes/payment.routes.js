const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { validateRequest } = require('../middleware/validation.middleware');
const Joi = require('joi');

// Validation schemas
const createOrderSchema = Joi.object({
  tournamentId: Joi.string().required(),
  paymentType: Joi.string().valid('individual', 'team').default('individual'),
  teamId: Joi.string().allow(null)
});

const verifyPaymentSchema = Joi.object({
  razorpay_order_id: Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature: Joi.string().required(),
  paymentId: Joi.string().required()
});

const refundSchema = Joi.object({
  amount: Joi.number().min(0),
  reason: Joi.string().max(200)
});

// Public route (for webhooks)
router.post('/webhook', paymentController.paymentWebhook);

// Protected routes
router.use(authMiddleware.verifyToken);

// User routes
router.post('/create-order', 
  validateRequest(createOrderSchema),
  paymentController.createOrder
);
router.post('/verify', 
  validateRequest(verifyPaymentSchema),
  paymentController.verifyPayment
);
router.get('/history', paymentController.getPaymentHistory);
router.get('/:paymentId', paymentController.getPayment);

// Admin routes
router.use(authMiddleware.isAdmin);

router.post('/:paymentId/refund',
  validateRequest(refundSchema),
  paymentController.initiateRefund
);

module.exports = router;