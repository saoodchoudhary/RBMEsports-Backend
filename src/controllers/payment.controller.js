const Payment = require('../models/Payment');
const Tournament = require('../models/Tournament');
const TournamentTeam = require('../models/TournamentTeam');
const User = require('../models/User');
const crypto = require('crypto');
const Razorpay = require('razorpay');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const paymentController = {
  // Create payment order
  createOrder: async (req, res) => {
    try {
      const { tournamentId, paymentType, teamId } = req.body;

      // Get tournament
      const tournament = await Tournament.findById(tournamentId);
      
      if (!tournament || tournament.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }

      if (!tournament.isPaid) {
        return res.status(400).json({
          success: false,
          message: 'This tournament is free'
        });
      }

      // Calculate amount
      const amount = tournament.serviceFee * 100; // Convert to paise

      // Create Razorpay order
      const order = await razorpay.orders.create({
        amount: amount,
        currency: 'INR',
        receipt: `order_${Date.now()}`,
        notes: {
          tournamentId: tournament._id.toString(),
          userId: req.user._id.toString(),
          paymentType,
          teamId: teamId || null
        }
      });

      // Create payment record
      const payment = new Payment({
        userId: req.user._id,
        tournamentId: tournament._id,
        teamId: teamId || null,
        amount: tournament.serviceFee,
        currency: 'INR',
        paymentType: paymentType || 'individual',
        paymentStatus: 'pending',
        paymentGateway: 'razorpay',
        gatewayOrderId: order.id,
        customerDetails: {
          name: req.user.name,
          email: req.user.email,
          phone: req.user.phone,
          bgmiId: req.user.bgmiId,
          inGameName: req.user.inGameName
        }
      });

      await payment.save();

      res.json({
        success: true,
        data: {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          paymentId: payment._id,
          key: process.env.RAZORPAY_KEY_ID
        }
      });

    } catch (error) {
      console.error('Create order error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create payment order'
      });
    }
  },

  // Verify payment
  verifyPayment: async (req, res) => {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        paymentId
      } = req.body;

      // Verify signature
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed'
        });
      }

      // Get payment record
      const payment = await Payment.findById(paymentId);
      
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Update payment status
      payment.paymentStatus = 'success';
      payment.gatewayPaymentId = razorpay_payment_id;
      payment.transactionId = `TXN${Date.now()}`;
      payment.completedAt = new Date();
      payment.isVerified = true;
      await payment.save();

      // Update tournament registration
      const tournament = await Tournament.findById(payment.tournamentId);
      
      if (tournament) {
        // Find and update user's registration
        const playerIndex = tournament.registeredPlayers.findIndex(
          p => p.userId.toString() === payment.userId.toString()
        );

        if (playerIndex !== -1) {
          tournament.registeredPlayers[playerIndex].paymentStatus = 'paid';
          tournament.registeredPlayers[playerIndex].paymentId = payment._id;
          await tournament.save();
        }

        // If team payment, update all team members
        if (payment.paymentType === 'team' && payment.teamId) {
          const team = await TournamentTeam.findById(payment.teamId);
          
          if (team) {
            team.paymentStatus = 'paid';
            team.paidAt = new Date();
            await team.save();

            // Update all team members' payment status
            tournament.registeredPlayers.forEach((player, index) => {
              if (player.teamId && player.teamId.toString() === payment.teamId.toString()) {
                tournament.registeredPlayers[index].paymentStatus = 'paid';
              }
            });
            await tournament.save();
          }
        }
      }

      // Send payment confirmation email
      const user = await User.findById(payment.userId);
      if (user) {
        // Send email logic here
        console.log(`Payment confirmation email sent to ${user.email}`);
      }

      res.json({
        success: true,
        message: 'Payment verified successfully',
        data: {
          payment: {
            _id: payment._id,
            amount: payment.amount,
            status: payment.paymentStatus,
            transactionId: payment.transactionId
          }
        }
      });

    } catch (error) {
      console.error('Verify payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Payment verification failed'
      });
    }
  },

  // Get payment details
  getPayment: async (req, res) => {
    try {
      const { paymentId } = req.params;

      const payment = await Payment.findById(paymentId)
        .populate('userId', 'name email')
        .populate('tournamentId', 'name startDate')
        .populate('teamId', 'teamName')
        .lean();

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Check if user is authorized to view this payment
      if (payment.userId._id.toString() !== req.user._id.toString() && 
          req.user.role !== 'admin' && 
          req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this payment'
        });
      }

      res.json({
        success: true,
        data: { payment }
      });

    } catch (error) {
      console.error('Get payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment details'
      });
    }
  },

  // Get user's payment history
  getPaymentHistory: async (req, res) => {
    try {
      const { page = 1, limit = 10, status } = req.query;

      const query = { userId: req.user._id };
      if (status) query.paymentStatus = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const payments = await Payment.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('tournamentId', 'name startDate')
        .populate('teamId', 'teamName')
        .lean();

      const total = await Payment.countDocuments(query);

      res.json({
        success: true,
        data: {
          payments,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });

    } catch (error) {
      console.error('Get payment history error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment history'
      });
    }
  },

  // Refund payment (Admin only)
  initiateRefund: async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { amount, reason } = req.body;

      const payment = await Payment.findById(paymentId);
      
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      if (payment.paymentStatus !== 'success') {
        return res.status(400).json({
          success: false,
          message: 'Only successful payments can be refunded'
        });
      }

      const refundAmount = amount || payment.amount;

      if (refundAmount > payment.amount) {
        return res.status(400).json({
          success: false,
          message: 'Refund amount cannot exceed payment amount'
        });
      }

      // Initiate refund through Razorpay
      const refund = await razorpay.payments.refund(payment.gatewayPaymentId, {
        amount: refundAmount * 100, // Convert to paise
        speed: 'normal',
        notes: {
          reason: reason || 'Tournament cancellation',
          initiatedBy: req.user._id.toString()
        }
      });

      // Update payment record
      payment.refunds.push({
        refundId: refund.id,
        amount: refundAmount,
        reason: reason || 'Tournament cancellation',
        initiatedBy: req.user._id,
        status: 'processed',
        gatewayRefundId: refund.id,
        processedAt: new Date()
      });

      // Update payment status
      if (refundAmount >= payment.amount) {
        payment.paymentStatus = 'refunded';
      } else {
        payment.paymentStatus = 'partially_refunded';
      }

      payment.refundedAt = new Date();
      await payment.save();

      // Update tournament registration status
      const tournament = await Tournament.findById(payment.tournamentId);
      if (tournament) {
        // Update user's registration
        const playerIndex = tournament.registeredPlayers.findIndex(
          p => p.paymentId && p.paymentId.toString() === payment._id.toString()
        );

        if (playerIndex !== -1) {
          tournament.registeredPlayers[playerIndex].paymentStatus = 'refunded';
          await tournament.save();
        }

        // If team payment, update all team members
        if (payment.paymentType === 'team' && payment.teamId) {
          const team = await TournamentTeam.findById(payment.teamId);
          if (team) {
            team.paymentStatus = 'refunded';
            await team.save();

            tournament.registeredPlayers.forEach((player, index) => {
              if (player.teamId && player.teamId.toString() === payment.teamId.toString()) {
                tournament.registeredPlayers[index].paymentStatus = 'refunded';
              }
            });
            await tournament.save();
          }
        }
      }

      res.json({
        success: true,
        message: 'Refund initiated successfully',
        data: {
          refundId: refund.id,
          amount: refundAmount,
          status: refund.status
        }
      });

    } catch (error) {
      console.error('Initiate refund error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate refund'
      });
    }
  },

  // Webhook handler for payment notifications
  paymentWebhook: async (req, res) => {
    try {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      const webhookSignature = req.headers['x-razorpay-signature'];

      // Verify webhook signature
      const body = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');

      if (expectedSignature !== webhookSignature) {
        return res.status(400).json({
          success: false,
          message: 'Invalid webhook signature'
        });
      }

      const event = req.body.event;
      const paymentData = req.body.payload.payment.entity;

      // Handle different events
      switch (event) {
        case 'payment.captured':
          await handlePaymentCaptured(paymentData);
          break;
        case 'payment.failed':
          await handlePaymentFailed(paymentData);
          break;
        case 'refund.processed':
          await handleRefundProcessed(paymentData);
          break;
        default:
          console.log(`Unhandled event: ${event}`);
      }

      res.json({ success: true });

    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({
        success: false,
        message: 'Webhook processing failed'
      });
    }
  }
};

// Helper functions for webhook handling
const handlePaymentCaptured = async (paymentData) => {
  try {
    const payment = await Payment.findOne({ gatewayOrderId: paymentData.order_id });
    
    if (payment) {
      payment.paymentStatus = 'success';
      payment.gatewayPaymentId = paymentData.id;
      payment.transactionId = `TXN${Date.now()}`;
      payment.completedAt = new Date();
      payment.webhookData = paymentData;
      payment.webhookStatus = 'received';
      await payment.save();

      // Update tournament registration
      // Similar logic as verifyPayment
    }
  } catch (error) {
    console.error('Handle payment captured error:', error);
  }
};

const handlePaymentFailed = async (paymentData) => {
  try {
    const payment = await Payment.findOne({ gatewayOrderId: paymentData.order_id });
    
    if (payment) {
      payment.paymentStatus = 'failed';
      payment.failedAt = new Date();
      payment.webhookData = paymentData;
      payment.webhookStatus = 'received';
      await payment.save();
    }
  } catch (error) {
    console.error('Handle payment failed error:', error);
  }
};

const handleRefundProcessed = async (paymentData) => {
  try {
    // Handle refund webhook
    console.log('Refund processed:', paymentData);
  } catch (error) {
    console.error('Handle refund processed error:', error);
  }
};

module.exports = paymentController;