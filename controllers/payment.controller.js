const Payment = require("../models/Payment");
const Tournament = require("../models/Tournament");
const TournamentTeam = require("../models/TournamentTeam");
const Razorpay = require("razorpay");
const crypto = require("crypto");

// NEW
const { markCouponUsed } = require("../utils/coupon.utils");

function getRazorpay() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    const err = new Error(
      "Razorpay keys are missing. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables."
    );
    err.statusCode = 500;
    throw err;
  }

  return new Razorpay({ key_id, key_secret });
}

function safeErrMessage(err) {
  return (
    err?.error?.description ||
    err?.error?.message ||
    err?.description ||
    err?.message ||
    "Something went wrong"
  );
}

// @desc    Create payment order
// @route   POST /api/payments/create-order
// @access  Private
exports.createOrder = async (req, res, next) => {
  try {
    const { paymentId } = req.body;

    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    if (payment.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized"
      });
    }

    if ((payment.amount || 0) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0 for Razorpay order"
      });
    }

    const razorpay = getRazorpay();

    const options = {
      amount: Math.round(payment.amount * 100),
      currency: payment.currency,
      receipt: payment.invoiceId,
      notes: {
        paymentId: payment._id.toString(),
        tournamentId: payment.tournamentId.toString(),
        userId: payment.userId.toString()
      }
    };

    const order = await razorpay.orders.create(options);

    payment.gatewayOrderId = order.id;
    payment.paymentStatus = "processing";
    await payment.save();

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: payment.amount,
        currency: payment.currency,
        key: process.env.RAZORPAY_KEY_ID,
        paymentId: payment._id
      }
    });
  } catch (error) {
    console.error("Payments create-order error:", {
      message: error?.message,
      statusCode: error?.statusCode,
      razorpay: error?.error
    });

    return res.status(error?.statusCode || 500).json({
      success: false,
      message: safeErrMessage(error)
    });
  }
};

// @desc    Verify payment
// @route   POST /api/payments/verify
// @access  Private
exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentId } = req.body;

    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_secret) {
      return res.status(500).json({
        success: false,
        message: "Server misconfigured: missing Razorpay secret"
      });
    }

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto.createHmac("sha256", key_secret).update(sign.toString()).digest("hex");

    if (razorpay_signature !== expectedSign) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature"
      });
    }

    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    if (
      payment.userId.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "super_admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized"
      });
    }

    if (payment.paymentStatus === "success") {
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        data: payment
      });
    }

    payment.gatewayPaymentId = razorpay_payment_id;
    payment.gatewaySignature = razorpay_signature;
    payment.paymentStatus = "success";
    payment.completedAt = new Date();
    await payment.save();

    const tournament = await Tournament.findById(payment.tournamentId);

    if (payment.paymentType === "team") {
      await TournamentTeam.findByIdAndUpdate(payment.teamId, {
        paymentStatus: "paid"
      });
    } else {
      const participantIndex = tournament.participants.findIndex(
        (p) => p.userId.toString() === payment.userId.toString()
      );

      if (participantIndex !== -1) {
        tournament.participants[participantIndex].paymentStatus = "paid";
        await tournament.save();
      }
    }

    if (payment.couponId) {
      await markCouponUsed({ couponId: payment.couponId, userId: payment.userId });
    }

    res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: payment
    });
  } catch (error) {
    console.error("Payments verify error:", {
      message: error?.message,
      razorpay: error?.error
    });

    return res.status(500).json({
      success: false,
      message: safeErrMessage(error)
    });
  }
};

// @desc    Get payment details
// @route   GET /api/payments/:id
// @access  Private
exports.getPayment = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate("userId", "name email")
      .populate("tournamentId", "title tournamentType");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    if (payment.userId._id.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized"
      });
    }

    res.status(200).json({
      success: true,
      data: payment
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's payments
// @route   GET /api/payments/my-payments
// @access  Private
exports.getMyPayments = async (req, res, next) => {
  try {
    const payments = await Payment.find({ userId: req.user.id })
      .populate("tournamentId", "title tournamentType tournamentStartDate")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: payments.length,
      data: payments
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Process refund
// @route   POST /api/payments/:id/refund
// @access  Private/Admin
exports.processRefund = async (req, res, next) => {
  try {
    const { reason, amount } = req.body;

    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    if (payment.paymentStatus !== "success") {
      return res.status(400).json({
        success: false,
        message: "Can only refund successful payments"
      });
    }

    const refundAmount = amount || payment.amount;

    const razorpay = getRazorpay();

    const refund = await razorpay.payments.refund(payment.gatewayPaymentId, {
      amount: Math.round(refundAmount * 100),
      notes: {
        reason: reason || "Refund requested by admin"
      }
    });

    payment.refunds.push({
      refundId: refund.id,
      amount: refundAmount,
      reason,
      initiatedBy: req.user.id,
      status: "processed",
      gatewayRefundId: refund.id,
      processedAt: new Date()
    });

    if (payment.totalRefunded >= payment.amount) {
      payment.paymentStatus = "refunded";
    } else {
      payment.paymentStatus = "partially_refunded";
    }

    await payment.save();

    res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      data: payment
    });
  } catch (error) {
    console.error("Payments refund error:", error);
    return res.status(500).json({
      success: false,
      message: safeErrMessage(error)
    });
  }
};