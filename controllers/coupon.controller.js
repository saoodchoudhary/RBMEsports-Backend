const Coupon = require("../models/Coupon");
const Tournament = require("../models/Tournament");
const User = require("../models/User");
const { validateAndApplyCoupon } = require("../utils/coupon.utils");

// Admin: create coupon
exports.createCoupon = async (req, res, next) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      applicableTournamentIds,
      allowedUserIds,
      allowedBgmiIds,
      maxUses,
      maxUsesPerUser,
      minOrderAmount,
      expiresAt,
      active,
    } = req.body;

    const coupon = await Coupon.create({
      code,
      discountType,
      discountValue,
      applicableTournamentIds,
      allowedUserIds,
      allowedBgmiIds,
      maxUses: maxUses === "" ? null : maxUses,
      maxUsesPerUser,
      minOrderAmount,
      expiresAt,
      active,
      createdBy: req.user.id,
    });

    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
};

// Admin: list coupons
exports.getCoupons = async (req, res, next) => {
  try {
    const { q, active } = req.query;

    const filter = {};
    if (typeof active !== "undefined") filter.active = active === "true";
    if (q) filter.code = { $regex: q.trim().toUpperCase(), $options: "i" };

    const coupons = await Coupon.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: coupons.length, data: coupons });
  } catch (error) {
    next(error);
  }
};

// Admin: update coupon
exports.updateCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    res.status(200).json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
};

// Admin: delete coupon
exports.deleteCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    await coupon.deleteOne();
    res.status(200).json({ success: true, message: "Coupon deleted" });
  } catch (error) {
    next(error);
  }
};

// Public/Optional auth: validate coupon for a tournament amount
exports.validateCoupon = async (req, res, next) => {
  try {
    const { tournamentId, couponCode, amount, userId, bgmiId } = req.body;

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, message: "Tournament not found" });
    }

    let user = null;
    if (req.user) {
      user = await User.findById(req.user.id);
    } else if (userId) {
      user = await User.findById(userId);
    } else {
      // Minimal object if only BGMI based validation needed
      user = { _id: "000000000000000000000000", bgmiId };
    }

    const baseAmount = typeof amount === "number" ? amount : tournament.serviceFee;

    const result = await validateAndApplyCoupon({
      couponCode,
      user,
      tournament,
      baseAmount,
    });

    res.status(200).json({
      success: true,
      data: {
        couponCode: couponCode ? couponCode.toUpperCase() : null,
        baseAmount,
        discountAmount: result.discountAmount,
        finalAmount: result.finalAmount,
        discountType: result.coupon ? result.coupon.discountType : null,
        discountValue: result.coupon ? result.coupon.discountValue : null,
        message: result.message,
      },
    });
  } catch (error) {
    next(error);
  }
};