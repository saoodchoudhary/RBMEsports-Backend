const Wallet = require('../models/Wallet');
const Payment = require('../models/Payment');
const Tournament = require('../models/Tournament');
const TournamentTeam = require('../models/TournamentTeam');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// NEW
const { markCouponUsed } = require("../utils/coupon.utils");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// @desc    Get or create wallet
// @route   GET /api/wallet
// @access  Private
exports.getWallet = async (req, res, next) => {
  try {
    let wallet = await Wallet.findOne({ userId: req.user.id });

    if (!wallet) {
      wallet = await Wallet.create({ userId: req.user.id });
    }

    res.status(200).json({
      success: true,
      data: wallet
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add money to wallet - Create order
// @route   POST /api/wallet/add-money
// @access  Private
exports.createAddMoneyOrder = async (req, res, next) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 10) {
      return res.status(400).json({
        success: false,
        message: 'Minimum amount is ₹10'
      });
    }

    const options = {
      amount: amount * 100,
      currency: 'INR',
      receipt: `wallet_${req.user.id}_${Date.now()}`,
      notes: {
        userId: req.user.id,
        type: 'wallet_deposit'
      }
    };

    const order = await razorpay.orders.create(options);

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: amount,
        key: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify payment and add to wallet
// @route   POST /api/wallet/verify-payment
// @access  Private
exports.verifyAndAddMoney = async (req, res, next) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount
    } = req.body;

    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest('hex');

    if (razorpay_signature !== expectedSign) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    let wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) {
      wallet = await Wallet.create({ userId: req.user.id });
    }

    await wallet.addMoney(amount, 'deposit', 'Money added to wallet', {
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id
    });

    res.status(200).json({
      success: true,
      message: 'Money added successfully',
      data: wallet
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Pay tournament fee with wallet
// @route   POST /api/wallet/pay-tournament
// @access  Private
exports.payTournamentWithWallet = async (req, res, next) => {
  try {
    const { tournamentId, amount, paymentId } = req.body;

    let wallet = await Wallet.findOne({ userId: req.user.id });

    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance'
      });
    }

    const tournament = await Tournament.findById(tournamentId);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Update payment status
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Security: payment belongs to user
    if (payment.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // OPTIONAL: ensure amount matches payable (prevents tampering)
    if (typeof amount === "number" && payment.amount !== amount) {
      return res.status(400).json({
        success: false,
        message: 'Amount mismatch'
      });
    }

    // Deduct from wallet
    await wallet.deductMoney(
      amount,
      'tournament_fee',
      `Tournament registration: ${tournament.title}`,
      { tournamentId, paymentId: payment._id }
    );

    // Mark payment success
    payment.paymentStatus = 'success';
    payment.paymentMethod = { type: 'wallet' };
    payment.completedAt = new Date();
    await payment.save();

    // Update tournament participant payment status
    if (payment.paymentType === 'team') {
      await TournamentTeam.findByIdAndUpdate(payment.teamId, {
        paymentStatus: 'paid'
      });
    } else {
      const participantIndex = tournament.participants.findIndex(
        p => p.userId.toString() === req.user.id
      );
      if (participantIndex !== -1) {
        tournament.participants[participantIndex].paymentStatus = 'paid';
        await tournament.save();
      }
    }

    // NEW: mark coupon used after wallet success, if coupon exists
    if (payment.couponId) {
      await markCouponUsed({ couponId: payment.couponId, userId: payment.userId });
    }

    res.status(200).json({
      success: true,
      message: 'Tournament fee paid successfully',
      data: wallet
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Request withdrawal
// @route   POST /api/wallet/withdraw
// @access  Private
exports.requestWithdrawal = async (req, res, next) => {
  try {
    const { amount, method, accountDetails } = req.body;

    if (!amount || amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum withdrawal amount is ₹100'
      });
    }

    if (!method || !accountDetails) {
      return res.status(400).json({
        success: false,
        message: 'Please provide withdrawal method and account details'
      });
    }

    const wallet = await Wallet.findOne({ userId: req.user.id });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    await wallet.requestWithdrawal(amount, method, accountDetails);

    res.status(200).json({
      success: true,
      message: 'Withdrawal request submitted. Will be processed within 24-48 hours',
      data: wallet
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get withdrawal requests
// @route   GET /api/wallet/withdrawals
// @access  Private
exports.getWithdrawals = async (req, res, next) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user.id });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    res.status(200).json({
      success: true,
      data: wallet.pendingWithdrawals
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update withdrawal info
// @route   PUT /api/wallet/withdrawal-info
// @access  Private
exports.updateWithdrawalInfo = async (req, res, next) => {
  try {
    const { method, accountHolderName, accountNumber, ifscCode, bankName, upiId } = req.body;

    let wallet = await Wallet.findOne({ userId: req.user.id });

    if (!wallet) {
      wallet = await Wallet.create({ userId: req.user.id });
    }

    wallet.withdrawalInfo = {
      method,
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      upiId
    };

    await wallet.save();

    res.status(200).json({
      success: true,
      message: 'Withdrawal info updated',
      data: wallet
    });
  } catch (error) {
    next(error);
  }
};