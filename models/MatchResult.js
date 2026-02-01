const mongoose = require("mongoose");

const MatchResultSchema = new mongoose.Schema(
  {
    tournamentId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Tournament", 
      required: true,
      index: true 
    },
    matchNumber: { type: Number, required: true },
    matchDay: { type: Number, default: 1 },
    
    // Match details
    map: { 
      type: String, 
      enum: ["Erangel", "Miramar", "Sanhok", "Vikendi", "Livik", "Karakin", "Deston"],
      default: "Erangel"
    },
    matchType: { type: String, enum: ["TPP", "FPP"], default: "TPP" },
    matchDuration: { type: Number }, // in minutes
    totalTeams: { type: Number },
    totalPlayers: { type: Number },
    
    // Results for each player/team
    results: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      teamName: { type: String },
      kills: { type: Number, default: 0, min: 0 },
      assists: { type: Number, default: 0, min: 0 },
      damageDealt: { type: Number, default: 0, min: 0 },
      survivalTime: { type: Number, default: 0 }, // in seconds
      placement: { type: Number, required: true, min: 1 },
      placementPoints: { type: Number, default: 0 },
      killPoints: { type: Number, default: 0 },
      bonusPoints: { type: Number, default: 0 },
      totalPoints: { type: Number, default: 0 },
      rank: { type: Number } // Rank in this specific match
    }],
    
    // Match winners
    winner: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      teamName: { type: String },
      winType: { type: String, enum: ["WWCD", "Points", "Time"] }
    },
    
    // Admin details
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verificationStatus: { 
      type: String, 
      enum: ["pending", "verified", "rejected", "disputed"], 
      default: "pending" 
    },
    
    // Match timings
    scheduledTime: { type: Date },
    actualStartTime: { type: Date },
    actualEndTime: { type: Date },
    matchPlayedAt: { type: Date, default: Date.now },
    
    // Screenshots/proof
    screenshots: [{ type: String }], // URLs to match result screenshots
    matchId: { type: String }, // In-game match ID
    roomId: { type: String }, // Custom room ID
    
    // Notes
    notes: { type: String },
    disputes: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reason: { type: String },
      status: { type: String, enum: ["open", "resolved", "rejected"] },
      resolvedAt: { type: Date },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    }]
  },
  { timestamps: true }
);

// Auto-calculate total points
MatchResultSchema.pre("save", function() {
  this.results.forEach(result => {
    result.totalPoints = (result.placementPoints || 0) + (result.killPoints || 0) + (result.bonusPoints || 0);
  });
});

module.exports = mongoose.model("MatchResult", MatchResultSchema);