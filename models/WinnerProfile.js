
// models/WinnerProfile.js
const mongoose = require("mongoose");

const WinnerProfileSchema = new mongoose.Schema(
  {
    tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
    
    rank: { type: Number, required: true, min: 1 },
    prizeAmount: { type: Number, required: true },
    inGameName: { type: String },
    teamName: { type: String },
    
    totalKills: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    avgPlacement: { type: Number, default: 0 },
    
    featuredImage: { type: String },
    quote: { type: String, maxlength: 200 },
    isFeatured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    
    paymentStatus: { 
      type: String, 
      enum: ["pending", "processing", "paid", "cancelled"], 
      default: "pending" 
    },
    paidAt: { type: Date },
    
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date }
  },
  { timestamps: true }
);

WinnerProfileSchema.index({ tournamentId: 1, rank: 1 });
WinnerProfileSchema.index({ isFeatured: 1, displayOrder: 1 });

module.exports = mongoose.model("WinnerProfile", WinnerProfileSchema);

// ============================================
