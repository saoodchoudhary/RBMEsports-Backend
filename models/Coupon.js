const mongoose = require("mongoose");

const CouponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    // percent | flat | free
    discountType: {
      type: String,
      enum: ["percent", "flat", "free"],
      required: true,
    },

    // percent => 1..100
    // flat => INR amount
    // free => ignore (0)
    discountValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    applicableTournamentIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Tournament" },
    ],

    allowedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    allowedBgmiIds: [{ type: String, trim: true }],

    maxUses: { type: Number, default: null }, // null => unlimited
    usedCount: { type: Number, default: 0 },

    maxUsesPerUser: { type: Number, default: 1 },

    usageByUser: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        count: { type: Number, default: 1 },
      },
    ],

    minOrderAmount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

CouponSchema.index({ active: 1, expiresAt: 1 });

module.exports = mongoose.model("Coupon", CouponSchema);