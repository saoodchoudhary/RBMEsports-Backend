const mongoose = require("mongoose");

const WinnerProfileSchema = new mongoose.Schema(
  {
    tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team" }, // If team tournament
    
    // Winner details
    rank: { type: Number, required: true, min: 1 },
    prizeAmount: { type: Number, required: true },
    inGameName: { type: String },
    teamName: { type: String },
    
    // Tournament performance
    totalKills: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    avgPlacement: { type: Number, default: 0 },
    
    // Display settings
    featuredImage: { type: String }, // Winner celebration image
    quote: { type: String, maxlength: 200 }, // Winner quote
    isFeatured: { type: Boolean, default: false }, // Show on homepage carousel
    displayOrder: { type: Number, default: 0 }, // For manual ordering
    
    // Payment status
    paymentStatus: { 
      type: String, 
      enum: ["pending", "processing", "paid", "cancelled"], 
      default: "pending" 
    },
    paidAt: { type: Date },
    
    // Admin details
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date }
  },
  { timestamps: true }
);

// Index for efficient queries
WinnerProfileSchema.index({ tournamentId: 1, rank: 1 });
WinnerProfileSchema.index({ isFeatured: 1, displayOrder: 1 });

module.exports = mongoose.model("WinnerProfile", WinnerProfileSchema);