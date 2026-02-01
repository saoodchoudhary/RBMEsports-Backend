const mongoose = require("mongoose");

const TeamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    tag: { type: String, trim: true, uppercase: true },
    logo: { type: String, default: null },
    
    captain: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ 
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      role: { type: String, enum: ["captain", "player", "substitute", "manager"] },
      joinedAt: { type: Date, default: Date.now }
    }],
    
    totalTournaments: { type: Number, default: 0 },
    tournamentsWon: { type: Number, default: 0 },
    totalPrizeMoney: { type: Number, default: 0 },
    avgPlacement: { type: Number, default: 0 },
    
    status: { 
      type: String, 
      enum: ["active", "inactive", "disbanded"], 
      default: "active" 
    },
    
    socialLinks: {
      discord: String,
      youtube: String,
      instagram: String,
      twitter: String
    },
    
    bio: { type: String, maxlength: 500 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    
    tournaments: [{
      tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament" },
      status: { type: String, enum: ["registered", "playing", "completed"] },
      finalRank: { type: Number },
      prizeWon: { type: Number, default: 0 }
    }]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Team", TeamSchema);