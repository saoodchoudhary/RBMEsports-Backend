const Coupon = require("../models/Coupon");

const normalizeCouponCode = (code) => (code || "").trim().toUpperCase();

exports.validateAndApplyCoupon = async ({ couponCode, user, tournament, baseAmount }) => {
  const code = normalizeCouponCode(couponCode);

  if (!code) {
    return { coupon: null, discountAmount: 0, finalAmount: baseAmount, message: null };
  }

  const coupon = await Coupon.findOne({ code, active: true });

  if (!coupon) {
    const err = new Error("Invalid or inactive coupon");
    err.status = 400;
    throw err;
  }

  if (coupon.expiresAt && new Date() > new Date(coupon.expiresAt)) {
    const err = new Error("Coupon expired");
    err.status = 400;
    throw err;
  }

  if (coupon.applicableTournamentIds && coupon.applicableTournamentIds.length > 0) {
    const allowed = coupon.applicableTournamentIds.some(
      (id) => id.toString() === tournament._id.toString()
    );
    if (!allowed) {
      const err = new Error("Coupon not applicable for this tournament");
      err.status = 400;
      throw err;
    }
  }

  if (coupon.allowedUserIds && coupon.allowedUserIds.length > 0) {
    const allowedUser = coupon.allowedUserIds.some(
      (id) => id.toString() === user._id.toString()
    );
    if (!allowedUser) {
      const err = new Error("Coupon not allowed for this user");
      err.status = 403;
      throw err;
    }
  }

  if (coupon.allowedBgmiIds && coupon.allowedBgmiIds.length > 0) {
    const userBgmiId = (user.bgmiId || "").trim();
    if (!userBgmiId || !coupon.allowedBgmiIds.includes(userBgmiId)) {
      const err = new Error("Coupon not allowed for this BGMI ID");
      err.status = 403;
      throw err;
    }
  }

  if (baseAmount < (coupon.minOrderAmount || 0)) {
    const err = new Error(`Coupon requires minimum amount ₹${coupon.minOrderAmount}`);
    err.status = 400;
    throw err;
  }

  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    const err = new Error("Coupon usage limit reached");
    err.status = 400;
    throw err;
  }

  if (coupon.maxUsesPerUser !== null && coupon.maxUsesPerUser > 0) {
    const usage = coupon.usageByUser.find(
      (u) => u.userId.toString() === user._id.toString()
    );
    const usedByUser = usage ? usage.count : 0;

    if (usedByUser >= coupon.maxUsesPerUser) {
      const err = new Error("Coupon usage limit reached for this user");
      err.status = 400;
      throw err;
    }
  }

  let discountAmount = 0;

  if (coupon.discountType === "free") {
    discountAmount = baseAmount;
  } else if (coupon.discountType === "percent") {
    const pct = Math.min(100, Math.max(0, coupon.discountValue || 0));
    discountAmount = Math.floor((baseAmount * pct) / 100);
  } else if (coupon.discountType === "flat") {
    discountAmount = Math.min(baseAmount, Math.max(0, coupon.discountValue || 0));
  }

  const finalAmount = Math.max(0, baseAmount - discountAmount);

  return { coupon, discountAmount, finalAmount, message: "Coupon applied" };
};

exports.markCouponUsed = async ({ couponId, userId }) => {
  const coupon = await Coupon.findById(couponId);
  if (!coupon) return;

  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    const err = new Error("Coupon usage limit reached");
    err.status = 400;
    throw err;
  }

  coupon.usedCount += 1;

  const existing = coupon.usageByUser.find(
    (u) => u.userId.toString() === userId.toString()
  );

  if (existing) existing.count += 1;
  else coupon.usageByUser.push({ userId, count: 1 });

  await coupon.save();
};