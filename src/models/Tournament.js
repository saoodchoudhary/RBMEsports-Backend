const mongoose = require("mongoose");

const TournamentSchema = new mongoose.Schema(
  {
    // Basic details
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    description: { type: String, required: true },
    shortDescription: { type: String, maxlength: 150 },
    bannerImage: { type: String, default: null },
    thumbnailImage: { type: String, default: null },
    
    // Dates and timing
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    registrationStart: { type: Date, required: true },
    registrationEnd: { type: Date, required: true },
    checkInTime: { type: Date },
    checkInDuration: { type: Number, default: 30 }, // minutes
    
    // Tournament type and settings
    type: { 
      type: String, 
      enum: ["solo", "duo", "squad", "custom"], 
      default: "squad",
      required: true 
    },
    teamSize: { 
      type: Number, 
      default: 4,
      validate: {
        validator: function(value) {
          if (this.type === "solo") return value === 1;
          if (this.type === "duo") return value === 2;
          if (this.type === "squad") return value === 4;
          return true;
        },
        message: "Team size must match tournament type"
      }
    },
    
    // Registration types
    registrationType: {
      type: String,
      enum: ["individual", "team", "both"],
      default: "individual"
    },
    allowTeamRegistration: { 
      type: Boolean, 
      default: function() {
        return this.type === "squad" || this.type === "duo";
      }
    },
    minTeamMembers: { 
      type: Number, 
      default: function() {
        return this.teamSize;
      }
    },
    maxTeamMembers: { 
      type: Number, 
      default: function() {
        return this.teamSize;
      }
    },
    
    // Payment and prizes
    isPaid: { type: Boolean, default: false },
    serviceFee: { type: Number, default: 0, min: 0 },
    prizePool: { type: Number, default: 0, min: 0 },
    prizeDistribution: [{
      rank: { type: Number, required: true },
      percentage: { type: Number, required: true, min: 0, max: 100 },
      fixedAmount: { type: Number, default: 0 },
      description: { type: String }
    }],
    
    // Tournament status
    status: { 
      type: String, 
      enum: ["draft", "upcoming", "registration_open", "registration_closed", 
             "check_in_open", "live", "completed", "cancelled", "results_pending"], 
      default: "draft",
      index: true 
    },
    
    // Rules and scoring
    rules: [{ type: String }],
    scoringSystem: {
      killPoints: { type: Number, default: 10 },
      placementPoints: [{
        rank: { type: Number, required: true },
        points: { type: Number, required: true }
      }],
      bonusPoints: { type: Number, default: 0 },
      perKillBonus: { type: Number, default: 0 }
    },
    
    // Match settings
    totalMatches: { type: Number, default: 3 },
    matchesPerDay: { type: Number, default: 1 },
    matchSchedule: [{
      matchNumber: { type: Number },
      date: { type: Date },
      time: { type: String },
      map: { type: String }
    }],
    
    // Capacity
    maxTeams: { type: Number, default: 25 },
    maxPlayers: { type: Number, default: 100 },
    minTeams: { type: Number, default: 4 },
    minPlayers: { type: Number, default: 16 },
    
    // Players and teams
    registeredPlayers: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      registeredAt: { type: Date, default: Date.now },
      registrationType: { 
        type: String, 
        enum: ["individual", "team_captain", "team_member"], 
        default: "individual" 
      },
      teamId: { type: mongoose.Schema.Types.ObjectId, ref: "TournamentTeam" },
      teamName: { type: String },
      isCaptain: { type: Boolean, default: false },
      bgmiId: { type: String },
      inGameName: { type: String },
      paymentStatus: { 
        type: String, 
        enum: ["pending", "paid", "failed", "refunded"], 
        default: "pending" 
      },
      paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
      checkInStatus: { type: Boolean, default: false },
      checkedInAt: { type: Date },
      status: { 
        type: String, 
        enum: ["active", "disqualified", "withdrawn", "banned"], 
        default: "active" 
      }
    }],
    
    // Registered teams for this tournament
    teams: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "TournamentTeam"
    }],
    
    // Leaderboard (calculated from match results)
    leaderboard: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      teamId: { type: mongoose.Schema.Types.ObjectId, ref: "TournamentTeam" },
      teamName: { type: String },
      totalKills: { type: Number, default: 0 },
      totalPlacementPoints: { type: Number, default: 0 },
      totalBonusPoints: { type: Number, default: 0 },
      totalPoints: { type: Number, default: 0 },
      matchesPlayed: { type: Number, default: 0 },
      avgKills: { type: Number, default: 0 },
      avgPlacement: { type: Number, default: 0 },
      rank: { type: Number },
      previousRank: { type: Number },
      rankChange: { type: Number, default: 0 }
    }],
    
    // Winners (manually assigned by admin)
    winners: [{
      rank: { type: Number, required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      teamId: { type: mongoose.Schema.Types.ObjectId, ref: "TournamentTeam" },
      teamName: { type: String },
      playerName: { type: String },
      prizeAmount: { type: Number, required: true },
      paymentStatus: { 
        type: String, 
        enum: ["pending", "processing", "paid", "cancelled"], 
        default: "pending" 
      },
      paidAt: { type: Date },
      paymentMethod: { type: String },
      transactionId: { type: String }
    }],
    
    // Admin controls
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    isFeatured: { type: Boolean, default: false },
    featuredOrder: { type: Number, default: 0 },
    visibility: { 
      type: String, 
      enum: ["public", "private", "invite_only"], 
      default: "public" 
    },
    inviteCode: { type: String },
    requireApproval: { type: Boolean, default: false },
    
    // Metadata and analytics
    views: { type: Number, default: 0 },
    registrationCount: { type: Number, default: 0 },
    teamCount: { type: Number, default: 0 },
    uniquePlayers: { type: Number, default: 0 },
    
    // Settings
    allowWithdrawal: { type: Boolean, default: true },
    withdrawalDeadline: { type: Date },
    allowSubstitutes: { type: Boolean, default: true },
    maxSubstitutes: { type: Number, default: 2 },
    requireBGMIValidation: { type: Boolean, default: true },
    requirePhoneVerification: { type: Boolean, default: true },
    
    // Social and streaming
    streamLink: { type: String },
    discordLink: { type: String },
    youtubeLink: { type: String },
    commentator: { type: String },
    
    // Custom fields
    customFields: [{
      fieldName: { type: String, required: true },
      fieldType: { type: String, enum: ["text", "number", "select", "checkbox"], required: true },
      isRequired: { type: Boolean, default: false },
      options: [{ type: String }]
    }],
    
    // Audit trail
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelledReason: { type: String },
    
    // System fields
    version: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for registration open status
TournamentSchema.virtual('isRegistrationOpen').get(function() {
  const now = new Date();
  return now >= this.registrationStart && now <= this.registrationEnd;
});

// Virtual for check-in open status
TournamentSchema.virtual('isCheckInOpen').get(function() {
  if (!this.checkInTime) return false;
  const now = new Date();
  const checkInEnd = new Date(this.checkInTime.getTime() + (this.checkInDuration * 60000));
  return now >= this.checkInTime && now <= checkInEnd;
});

// Virtual for tournament live status
TournamentSchema.virtual('isLive').get(function() {
  const now = new Date();
  return now >= this.startDate && (!this.endDate || now <= this.endDate);
});

// Virtual for available slots
TournamentSchema.virtual('availableSlots').get(function() {
  if (this.type === "solo") {
    return this.maxPlayers - this.registrationCount;
  } else {
    return this.maxTeams - this.teamCount;
  }
});

// Virtual for registration percentage
TournamentSchema.virtual('registrationPercentage').get(function() {
  if (this.type === "solo") {
    return (this.registrationCount / this.maxPlayers) * 100;
  } else {
    return (this.teamCount / this.maxTeams) * 100;
  }
});

// Generate slug before saving
TournamentSchema.pre("save", function(next) {
  if (!this.slug || this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }
  
  // Auto-set dates based on type
  if (this.type === "solo") {
    this.teamSize = 1;
    this.minTeamMembers = 1;
    this.maxTeamMembers = 1;
  } else if (this.type === "duo") {
    this.teamSize = 2;
    this.minTeamMembers = 2;
    this.maxTeamMembers = 2;
  } else if (this.type === "squad") {
    this.teamSize = 4;
    this.minTeamMembers = 4;
    this.maxTeamMembers = 4;
  }
  
  // Auto-update registration count
  if (this.isModified('registeredPlayers')) {
    this.registrationCount = this.registeredPlayers.length;
  }
  
  // Auto-update team count
  if (this.isModified('teams')) {
    this.teamCount = this.teams.length;
  }
  
  next();
});

// Update registration count method
TournamentSchema.methods.updateRegistrationCount = function() {
  this.registrationCount = this.registeredPlayers.length;
  return this.save();
};

// Update team count method
TournamentSchema.methods.updateTeamCount = function() {
  this.teamCount = this.teams.length;
  return this.save();
};

// Check if user is registered
TournamentSchema.methods.isUserRegistered = function(userId) {
  return this.registeredPlayers.some(player => 
    player.userId.toString() === userId.toString()
  );
};

// Get user registration
TournamentSchema.methods.getUserRegistration = function(userId) {
  return this.registeredPlayers.find(player => 
    player.userId.toString() === userId.toString()
  );
};

// Register user
TournamentSchema.methods.registerUser = async function(userData) {
  // Check if already registered
  if (this.isUserRegistered(userData.userId)) {
    throw new Error('User already registered for this tournament');
  }
  
  // Check if registration is open
  if (!this.isRegistrationOpen) {
    throw new Error('Registration is closed for this tournament');
  }
  
  // Check available slots
  if (this.availableSlots <= 0) {
    throw new Error('No slots available for this tournament');
  }
  
  // Add to registered players
  this.registeredPlayers.push({
    ...userData,
    registeredAt: new Date()
  });
  
  this.registrationCount = this.registeredPlayers.length;
  
  return this.save();
};

// Unregister user
TournamentSchema.methods.unregisterUser = function(userId) {
  const index = this.registeredPlayers.findIndex(player => 
    player.userId.toString() === userId.toString()
  );
  
  if (index !== -1) {
    this.registeredPlayers.splice(index, 1);
    this.registrationCount = this.registeredPlayers.length;
    return this.save();
  }
  
  return this;
};

// Check in user
TournamentSchema.methods.checkInUser = function(userId) {
  const player = this.registeredPlayers.find(p => 
    p.userId.toString() === userId.toString()
  );
  
  if (player) {
    player.checkInStatus = true;
    player.checkedInAt = new Date();
    return this.save();
  }
  
  throw new Error('Player not registered for this tournament');
};

// Calculate leaderboard
TournamentSchema.methods.calculateLeaderboard = async function() {
  // This would typically fetch match results and calculate
  // For now, return the existing leaderboard
  return this.leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
};

// Indexes for better query performance
TournamentSchema.index({ status: 1, startDate: 1 });
TournamentSchema.index({ type: 1, status: 1 });
TournamentSchema.index({ createdBy: 1 });
TournamentSchema.index({ isFeatured: 1, featuredOrder: 1 });
TournamentSchema.index({ slug: 1 }, { unique: true });
TournamentSchema.index({ registrationStart: 1, registrationEnd: 1 });

module.exports = mongoose.model("Tournament", TournamentSchema);