const mongoose = require("mongoose");

const WalletSchema = new mongoose.Schema(
  {
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true,
      unique: true,
      index: true
    },
    
    balance: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    
    // Transactions history
    transactions: [{
      type: {
        type: String,
        enum: ["deposit", "withdrawal", "tournament_fee", "prize_won", "refund"],
        required: true
      },
      amount: { type: Number, required: true },
      description: { type: String },
      tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament" },
      paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
      status: {
        type: String,
        enum: ["pending", "completed", "failed", "cancelled"],
        default: "completed"
      },
      razorpayOrderId: { type: String },
      razorpayPaymentId: { type: String },
      createdAt: { type: Date, default: Date.now }
    }],
    
    // Withdrawal details
    withdrawalInfo: {
      accountHolderName: { type: String },
      accountNumber: { type: String },
      ifscCode: { type: String },
      bankName: { type: String },
      upiId: { type: String },
      method: { type: String, enum: ["bank", "upi"] }
    },
    
    // Pending withdrawals
    pendingWithdrawals: [{
      amount: { type: Number, required: true },
      method: { type: String, enum: ["bank", "upi"], required: true },
      accountDetails: { type: mongoose.Schema.Types.Mixed },
      status: {
        type: String,
        enum: ["pending", "processing", "completed", "rejected"],
        default: "pending"
      },
      requestedAt: { type: Date, default: Date.now },
      processedAt: { type: Date },
      processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      rejectionReason: { type: String },
      transactionId: { type: String }
    }],
    
    // Total stats
    totalDeposited: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    
    isActive: { type: Boolean, default: true },
    isLocked: { type: Boolean, default: false },
    lockReason: { type: String }
  },
  { timestamps: true }
);

// Add money to wallet
WalletSchema.methods.addMoney = function(amount, type, description, metadata = {}) {
  this.balance += amount;
  
  this.transactions.push({
    type,
    amount,
    description,
    ...metadata,
    status: "completed"
  });
  
  if (type === "deposit") {
    this.totalDeposited += amount;
  } else if (type === "prize_won") {
    this.totalEarned += amount;
  } else if (type === "refund") {
    this.totalEarned += amount;
  }
  
  return this.save();
};

// Deduct money from wallet
WalletSchema.methods.deductMoney = function(amount, type, description, metadata = {}) {
  if (this.balance < amount) {
    throw new Error("Insufficient balance");
  }
  
  if (this.isLocked) {
    throw new Error("Wallet is locked");
  }
  
  this.balance -= amount;
  
  this.transactions.push({
    type,
    amount: -amount,
    description,
    ...metadata,
    status: "completed"
  });
  
  if (type === "tournament_fee") {
    this.totalSpent += amount;
  } else if (type === "withdrawal") {
    this.totalWithdrawn += amount;
  }
  
  return this.save();
};

// Request withdrawal
WalletSchema.methods.requestWithdrawal = function(amount, method, accountDetails) {
  if (this.balance < amount) {
    throw new Error("Insufficient balance");
  }
  
  if (amount < 100) {
    throw new Error("Minimum withdrawal amount is ₹100");
  }
  
  // Hold the amount
  this.balance -= amount;
  
  this.pendingWithdrawals.push({
    amount,
    method,
    accountDetails,
    status: "pending"
  });
  
  return this.save();
};

module.exports = mongoose.model("Wallet", WalletSchema);