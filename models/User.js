const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    isGoogleAuth: { type: Boolean, default: false },
    password: { type: String, default: null, select: false },

    // Gaming Profile
    bgmiId: { type: String, unique: true, sparse: true, trim: true },
    phone: { type: String, unique: true, sparse: true, trim: true },
    inGameName: { type: String, trim: true },

    // Player Stats
    totalTournaments: { type: Number, default: 0 },
    tournamentsWon: { type: Number, default: 0 },
    totalPrizeMoney: { type: Number, default: 0 },
    avgKillRatio: { type: Number, default: 0 },
    avgPlacement: { type: Number, default: 0 },

    profileCompleted: { type: Boolean, default: false },
    profileImage: { type: String, default: null },
    googleId: { type: String, unique: true, sparse: true, index: true },

    role: {
      type: String,
      enum: ["user", "admin", "super_admin"],
      default: "user",
      index: true,
    },

    // NEW: ban system
    isBanned: { type: Boolean, default: false, index: true },
    banReason: { type: String, default: null },
    bannedAt: { type: Date, default: null },
    bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },
    emailVerificationExpires: { type: Date },

    tournaments: [
      {
        tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament" },
        status: {
          type: String,
          enum: ["registered", "playing", "completed", "won", "disqualified"],
        },
        rank: { type: Number },
        prizeWon: { type: Number, default: 0 },
      },
    ],

    savedPaymentMethods: [
      {
        methodId: String,
        type: { type: String, enum: ["card", "upi", "wallet"] },
        lastFour: String,
        isDefault: { type: Boolean, default: false },
      },
    ],

    notifications: {
      tournamentReminders: { type: Boolean, default: true },
      resultsPublished: { type: Boolean, default: true },
      paymentSuccess: { type: Boolean, default: true },
    },

    lastActive: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

UserSchema.pre("save", function () {
  this.profileCompleted = Boolean(this.bgmiId && this.phone && this.inGameName);
});

UserSchema.methods.updateLastActive = function () {
  this.lastActive = Date.now();
  return this.save();
};

module.exports = mongoose.model("User", UserSchema);