const mongoose = require("mongoose");

const TournamentSchema = new mongoose.Schema(
  {
    title: { 
      type: String, 
      required: true, 
      trim: true,
      index: true 
    },
    description: { type: String, required: true },
    
    // Tournament type
    tournamentType: { 
      type: String, 
      enum: ["solo", "duo", "squad"], 
      required: true,
      index: true
    },
    teamSize: { 
      type: Number, 
      required: true,
      min: 1,
      max: 4,
      default: function() {
        return this.tournamentType === "solo" ? 1 : 
               this.tournamentType === "duo" ? 2 : 4;
      }
    },
    
    // Registration
    maxParticipants: { type: Number, required: true, min: 1 },
    currentParticipants: { type: Number, default: 0 },
    registrationStartDate: { type: Date, required: true },
    registrationEndDate: { type: Date, required: true },
    
    // Tournament dates
    tournamentStartDate: { type: Date, required: true },
    tournamentEndDate: { type: Date, required: true },
    
    // Pricing
    isFree: { type: Boolean, default: false },
    serviceFee: { type: Number, default: 0, min: 0 },
    
    // Prize pool
    prizePool: { type: Number, required: true, min: 0 },
    prizeDistribution: [{
      rank: { type: Number, required: true },
      amount: { type: Number, required: true },
      percentage: { type: Number }
    }],
    
    // Rules & Scoring
    rules: { type: String },
    killPoints: { type: Number, default: 1 },
    placementPoints: [{
      placement: { type: Number, required: true },
      points: { type: Number, required: true }
    }],
    
    // Tournament details
    totalMatches: { type: Number, default: 1, min: 1 },
    matchesPerDay: { type: Number, default: 1 },
    map: { 
      type: String, 
      enum: ["Erangel", "Miramar", "Sanhok", "Vikendi", "Livik", "Karakin", "Deston"],
      default: "Erangel"
    },
    perspective: { 
      type: String, 
      enum: ["TPP", "FPP"], 
      default: "TPP" 
    },
    
    // Status
    status: { 
      type: String, 
      enum: ["draft", "upcoming", "registration_open", "registration_closed", "ongoing", "completed", "cancelled"],
      default: "draft",
      index: true
    },
    
    // Featured
    isFeatured: { type: Boolean, default: false },
    featuredImage: { type: String },
    bannerImage: { type: String },
    
    // Participants (for solo/duo)
    participants: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      bgmiId: { type: String },
      inGameName: { type: String },
      registeredAt: { type: Date, default: Date.now },
      paymentStatus: { 
        type: String, 
        enum: ["pending", "paid", "failed"], 
        default: "pending" 
      },
      paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
      totalKills: { type: Number, default: 0 },
      totalPoints: { type: Number, default: 0 },
      finalRank: { type: Number },
      partnerInfo: {
        bgmiId: { type: String },
        inGameName: { type: String }
      }
    }],
    
    // Winners
    winners: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      teamId: { type: mongoose.Schema.Types.ObjectId, ref: "TournamentTeam" },
      rank: { type: Number, required: true },
      prizeAmount: { type: Number, required: true },
      isPaid: { type: Boolean, default: false }
    }],
    
    // Admin
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    
    // Meta
    viewCount: { type: Number, default: 0 },
    registrationCount: { type: Number, default: 0 },
    
    // Discord/Contact
    discordLink: { type: String },
    contactNumber: { type: String },
    
    // Room details
    roomId: { type: String },
    roomPassword: { type: String }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// FIXED: Registration check based on dates and capacity only
TournamentSchema.virtual('isRegistrationOpen').get(function() {
  const now = new Date();
  
  // Check time window
  const isWithinTimeWindow = now >= this.registrationStartDate && now <= this.registrationEndDate;
  
  // Check capacity
  const hasCapacity = this.currentParticipants < this.maxParticipants;
  
  // Registration is open if within time window AND has capacity
  return isWithinTimeWindow && hasCapacity;
});

TournamentSchema.virtual('isFull').get(function() {
  return this.currentParticipants >= this.maxParticipants;
});

TournamentSchema.virtual('spotsRemaining').get(function() {
  return Math.max(0, this.maxParticipants - this.currentParticipants);
});

// Auto-update status based on dates
TournamentSchema.pre("save", function() {
  const now = new Date();
  
  if (this.status === "draft") {
    return;
  }
  
  if (now < this.registrationStartDate) {
    this.status = "upcoming";
  } else if (now >= this.registrationStartDate && now <= this.registrationEndDate) {
    this.status = "registration_open";
  } else if (now > this.registrationEndDate && now < this.tournamentStartDate) {
    this.status = "registration_closed";
  } else if (now >= this.tournamentStartDate && now <= this.tournamentEndDate) {
    this.status = "ongoing";
  } else if (now > this.tournamentEndDate) {
    this.status = "completed";
  }
});

// Indexes
TournamentSchema.index({ status: 1, tournamentStartDate: -1 });
TournamentSchema.index({ isFeatured: 1, createdAt: -1 });
TournamentSchema.index({ createdBy: 1 });

module.exports = mongoose.model("Tournament", TournamentSchema);