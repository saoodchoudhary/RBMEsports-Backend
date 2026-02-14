const Wallet = require("../models/Wallet");
const Payment = require("../models/Payment");
const Tournament = require("../models/Tournament");
const TournamentTeam = require("../models/TournamentTeam");
const Razorpay = require("razorpay");
const crypto = require("crypto");

// NEW
const { markCouponUsed } = require("../utils/coupon.utils");

// ---- Razorpay init (hardened) ----
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

// ✅ Razorpay receipt must be <= 40 chars
function makeShortReceipt({ prefix, userId }) {
  const uid = String(userId || "");
  const uidTail = uid.slice(-6); // last 6 chars only
  const ts = Date.now().toString(36); // shorter than Date.now()
  // example: wlt_k3a9z2_ab12cd  (always < 40)
  return `${prefix}_${ts}_${uidTail}`.slice(0, 40);
}

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

    const amt = Number(amount);
    if (!amt || amt < 10) {
      return res.status(400).json({
        success: false,
        message: "Minimum amount is ₹10"
      });
    }

    if (amt > 100000) {
      return res.status(400).json({
        success: false,
        message: "Maximum amount is ₹1,00,000"
      });
    }

    const razorpay = getRazorpay();

    const options = {
      amount: Math.round(amt * 100),
      currency: "INR",

      // ✅ FIXED: keep receipt <= 40 chars
      receipt: makeShortReceipt({ prefix: "wlt", userId: req.user.id }),

      notes: {
        userId: req.user.id,
        type: "wallet_deposit"
      }
    };

    const order = await razorpay.orders.create(options);

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: amt,
        key: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error("Wallet add-money order error:", {
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

// @desc    Verify payment and add to wallet
// @route   POST /api/wallet/verify-payment
// @access  Private
exports.verifyAndAddMoney = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_secret) {
      return res.status(500).json({
        success: false,
        message: "Server misconfigured: missing Razorpay secret"
      });
    }

    const amt = Number(amount);
    if (!amt || amt < 10) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount"
      });
    }

    const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSign = crypto.createHmac("sha256", key_secret).update(sign).digest("hex");

    if (razorpay_signature !== expectedSign) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature"
      });
    }

    let wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) {
      wallet = await Wallet.create({ userId: req.user.id });
    }

    await wallet.addMoney(amt, "deposit", "Money added to wallet", {
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id
    });

    res.status(200).json({
      success: true,
      message: "Money added successfully",
      data: wallet
    });
  } catch (error) {
    console.error("Wallet verify-payment error:", {
      message: error?.message,
      razorpay: error?.error
    });

    return res.status(500).json({
      success: false,
      message: safeErrMessage(error)
    });
  }
};

// @desc    Pay tournament fee with wallet
// @route   POST /api/wallet/pay-tournament
// @access  Private
exports.payTournamentWithWallet = async (req, res, next) => {
  try {
    const { tournamentId, amount, paymentId } = req.body;

    const amt = Number(amount);

    let wallet = await Wallet.findOne({ userId: req.user.id });

    if (!wallet || wallet.balance < amt) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance"
      });
    }

    const tournament = await Tournament.findById(tournamentId);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found"
      });
    }

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

    if (typeof amt === "number" && payment.amount !== amt) {
      return res.status(400).json({
        success: false,
        message: "Amount mismatch"
      });
    }

    await wallet.deductMoney(amt, "tournament_fee", `Tournament registration: ${tournament.title}`, {
      tournamentId,
      paymentId: payment._id
    });

    payment.paymentStatus = "success";
    payment.paymentMethod = { type: "wallet" };
    payment.completedAt = new Date();
    await payment.save();

    if (payment.paymentType === "team") {
      await TournamentTeam.findByIdAndUpdate(payment.teamId, {
        paymentStatus: "paid"
      });
    } else {
      const participantIndex = tournament.participants.findIndex((p) => p.userId.toString() === req.user.id);
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
      message: "Tournament fee paid successfully",
      data: wallet
    });
  } catch (error) {
    console.error("Wallet pay-tournament error:", error);
    return res.status(400).json({
      success: false,
      message: safeErrMessage(error)
    });
  }
};

// @desc    Request withdrawal
// @route   POST /api/wallet/withdraw
// @access  Private
exports.requestWithdrawal = async (req, res, next) => {
  try {
    const { amount, method, accountDetails } = req.body;

    const amt = Number(amount);

    if (!amt || amt < 100) {
      return res.status(400).json({
        success: false,
        message: "Minimum withdrawal amount is ₹100"
      });
    }

    if (!method || !accountDetails) {
      return res.status(400).json({
        success: false,
        message: "Please provide withdrawal method and account details"
      });
    }

    const wallet = await Wallet.findOne({ userId: req.user.id });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found"
      });
    }

    await wallet.requestWithdrawal(amt, method, accountDetails);

    res.status(200).json({
      success: true,
      message: "Withdrawal request submitted. Will be processed within 24-48 hours",
      data: wallet
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: safeErrMessage(error)
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
        message: "Wallet not found"
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
      message: "Withdrawal info updated",
      data: wallet
    });
  } catch (error) {
    next(error);
  }
};