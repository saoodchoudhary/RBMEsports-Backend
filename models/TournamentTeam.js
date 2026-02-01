const mongoose = require("mongoose");

const TournamentTeamSchema = new mongoose.Schema(
  {
    tournamentId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Tournament", 
      required: true 
    },
    
    // Team details
    teamName: { 
      type: String, 
      required: true,
      trim: true
    },
    teamTag: { 
      type: String, 
      trim: true,
      uppercase: true,
      maxlength: 4
    },
    
    // Team Members with BGMI IDs
    captain: { 
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      bgmiId: { type: String, required: true },
      inGameName: { type: String }
    },
    
    members: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      bgmiId: { 
        type: String, 
        required: true,
        validate: {
          validator: function(v) {
            // BGMI ID validation (usually numeric, 10-12 digits)
            return /^\d{10,12}$/.test(v);
          },
          message: "BGMI ID must be 10-12 digits"
        }
      },
      inGameName: { type: String, required: true },
      position: { 
        type: String, 
        enum: ["assault", "sniper", "support", "flex", "leader", "fragger"],
        default: "flex"
      },
      joinedAt: { type: Date, default: Date.now },
      status: { 
        type: String, 
        enum: ["pending", "confirmed", "rejected", "left"], 
        default: "confirmed"
      }
    }],
    
    // Team status
    registrationStatus: { 
      type: String, 
      enum: ["draft", "pending", "registered", "verified", "disqualified"], 
      default: "registered"
    },
    
    // Payment for team
    paymentStatus: { 
      type: String, 
      enum: ["pending", "paid", "failed", "refunded"], 
      default: "pending" 
    },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    
    // Team stats for this tournament
    totalKills: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    placement: { type: Number },
    prizeWon: { type: Number, default: 0 },
    
    // Verification
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date },
    
    // Team join code (for inviting members)
    joinCode: { 
      type: String, 
      unique: true,
      sparse: true
    },
    joinCodeExpires: { type: Date },
    
    // Team logo
    teamLogo: { type: String },
    
    // Metadata
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Generate join code before saving
TournamentTeamSchema.pre("save", function() {
  if (!this.joinCode) {
    // Generate 6-character alphanumeric code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.joinCode = code;
    this.joinCodeExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  }
});

// Check if team is full
TournamentTeamSchema.methods.isTeamFull = function() {
  const totalMembers = this.members.length + 1; // +1 for captain
  return totalMembers >= 4; // Default squad size
};

// Add member to team
TournamentTeamSchema.methods.addMember = function(userId, bgmiId, inGameName) {
  if (this.isTeamFull()) {
    throw new Error("Team is already full");
  }
  
  // Check if BGMI ID is already in team
  const bgmiIds = [this.captain.bgmiId, ...this.members.map(m => m.bgmiId)];
  if (bgmiIds.includes(bgmiId)) {
    throw new Error("BGMI ID already exists in team");
  }
  
  this.members.push({
    userId,
    bgmiId,
    inGameName,
    status: "confirmed"
  });
  
  return this.save();
};

// Remove member from team
TournamentTeamSchema.methods.removeMember = function(userId) {
  const memberIndex = this.members.findIndex(m => m.userId.toString() === userId.toString());
  if (memberIndex !== -1) {
    this.members.splice(memberIndex, 1);
    return this.save();
  }
  return this;
};

// Verify all BGMI IDs are unique
TournamentTeamSchema.methods.verifyBGMIIDs = function() {
  const bgmiIds = [this.captain.bgmiId];
  const duplicates = [];
  
  this.members.forEach(member => {
    if (bgmiIds.includes(member.bgmiId)) {
      duplicates.push(member.bgmiId);
    }
    bgmiIds.push(member.bgmiId);
  });
  
  return {
    isValid: duplicates.length === 0,
    duplicates: duplicates,
    totalMembers: bgmiIds.length
  };
};

module.exports = mongoose.model("TournamentTeam", TournamentTeamSchema);