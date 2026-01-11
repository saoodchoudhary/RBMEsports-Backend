const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    // Payment type and references
    paymentType: {
      type: String,
      enum: ["individual", "team", "prize_payout", "refund"],
      required: true,
      default: "individual"
    },
    
    // User and tournament reference
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true,
      index: true 
    },
    tournamentId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Tournament", 
      required: true,
      index: true 
    },
    
    // For team payments
    teamId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "TournamentTeam",
      index: true 
    },
    payingCaptainId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    },
    
    // Payment covers multiple users (for team payments)
    coveredUsers: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      bgmiId: { type: String },
      inGameName: { type: String },
      isCaptain: { type: Boolean, default: false }
    }],
    
    // Payment details
    amount: { 
      type: Number, 
      required: true,
      min: 0 
    },
    currency: { 
      type: String, 
      default: "INR",
      enum: ["INR", "USD", "EUR"]
    },
    baseAmount: { type: Number }, // Amount before tax/fees
    taxAmount: { type: Number, default: 0 },
    gatewayFee: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    netAmount: { type: Number }, // Amount received after all fees
    
    // Payment status
    paymentStatus: { 
      type: String, 
      enum: [
        "pending", 
        "processing", 
        "success", 
        "failed", 
        "refunded", 
        "partially_refunded",
        "cancelled", 
        "expired",
        "on_hold"
      ], 
      default: "pending",
      index: true 
    },
    
    // Payment gateway details
    paymentGateway: { 
      type: String, 
      enum: ["razorpay", "paytm", "cashfree", "stripe", "paypal", "manual", "bank_transfer"], 
      required: true,
      index: true 
    },
    gatewayOrderId: { type: String, index: true },
    gatewayPaymentId: { type: String, index: true },
    gatewaySignature: { type: String },
    
    // Transaction details
    transactionId: { 
      type: String, 
      unique: true, 
      sparse: true,
      index: true 
    },
    invoiceId: { 
      type: String, 
      unique: true, 
      sparse: true,
      index: true 
    },
    referenceId: { type: String }, // For bank transfers
    
    // Payment method
    paymentMethod: { 
      type: { 
        type: String, 
        enum: ["card", "netbanking", "upi", "wallet", "emi", "bank_transfer", "cash"] 
      },
      lastFour: String,
      bank: String,
      wallet: String,
      upiId: String,
      cardType: { type: String, enum: ["credit", "debit"] },
      issuer: String
    },
    
    // Timestamps
    initiatedAt: { type: Date, default: Date.now, index: true },
    processingAt: { type: Date },
    completedAt: { type: Date, index: true },
    failedAt: { type: Date },
    refundedAt: { type: Date },
    cancelledAt: { type: Date },
    
    // Customer details (snapshot at time of payment)
    customerDetails: {
      name: String,
      email: String,
      phone: String,
      bgmiId: String,
      inGameName: String
    },
    
    // Billing details
    billingDetails: {
      name: String,
      email: String,
      phone: String,
      address: {
        line1: String,
        line2: String,
        city: String,
        state: String,
        country: String,
        postalCode: String
      },
      taxId: String // GST/PAN number
    },
    
    // Payment description
    description: { type: String },
    notes: { type: String }, // Admin notes
    internalNotes: { type: String }, // For internal use only
    
    // Metadata for additional data
    metadata: { type: mongoose.Schema.Types.Mixed },
    
    // Refund details (if applicable)
    refunds: [{
      refundId: { type: String, required: true },
      amount: { type: Number, required: true },
      reason: { type: String },
      initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      status: { 
        type: String, 
        enum: ["pending", "processed", "failed", "cancelled"] 
      },
      gatewayRefundId: String,
      processedAt: Date,
      notes: String
    }],
    
    // For prize payouts
    payoutDetails: {
      payoutMethod: { type: String, enum: ["bank", "upi", "wallet"] },
      payoutId: String,
      payoutStatus: { 
        type: String, 
        enum: ["pending", "initiated", "processed", "failed"] 
      },
      processedAt: Date,
      transactionReference: String,
      taxDeducted: { type: Number, default: 0 },
      tdsPercentage: { type: Number, default: 0 }
    },
    
    // Webhook and callback data
    webhookData: { type: mongoose.Schema.Types.Mixed },
    callbackUrl: String,
    webhookStatus: { 
      type: String, 
      enum: ["pending", "received", "processed", "failed"] 
    },
    
    // Security and verification
    ipAddress: String,
    userAgent: String,
    deviceId: String,
    isVerified: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date },
    
    // Audit trail
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    
    // Flags
    isTestPayment: { type: Boolean, default: false },
    isAutoRefund: { type: Boolean, default: false },
    requiresManualReview: { type: Boolean, default: false },
    isSuspicious: { type: Boolean, default: false },
    
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

// Virtual for total refund amount
PaymentSchema.virtual('totalRefunded').get(function() {
  return this.refunds.reduce((total, refund) => {
    return total + (refund.status === "processed" ? refund.amount : 0);
  }, 0);
});

// Virtual for is fully refunded
PaymentSchema.virtual('isFullyRefunded').get(function() {
  return this.totalRefunded >= this.amount;
});

// Virtual for payment age in minutes
PaymentSchema.virtual('paymentAgeMinutes').get(function() {
  return Math.floor((Date.now() - this.initiatedAt) / (1000 * 60));
});

// Virtual for is expired (pending payments expire after 30 minutes)
PaymentSchema.virtual('isExpired').get(function() {
  if (this.paymentStatus !== "pending") return false;
  return this.paymentAgeMinutes > 30;
});

// Generate invoice ID before saving
PaymentSchema.pre("save", function(next) {
  if (!this.invoiceId && this.paymentType !== "refund") {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const prefix = this.paymentType === "prize_payout" ? "POUT" : "INV";
    this.invoiceId = `${prefix}-${timestamp}${random}`;
  }
  
  // Generate transaction ID if not present
  if (!this.transactionId && this.paymentStatus === "success") {
    const timestamp = Date.now().toString().slice(-10);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.transactionId = `TXN${timestamp}${random}`;
  }
  
  // Calculate net amount
  if (this.isModified('amount') || this.isModified('taxAmount') || 
      this.isModified('gatewayFee') || this.isModified('platformFee')) {
    this.netAmount = this.amount - this.taxAmount - this.gatewayFee - this.platformFee;
  }
  
  // Update timestamps based on status
  if (this.isModified('paymentStatus')) {
    const now = new Date();
    switch (this.paymentStatus) {
      case "processing":
        this.processingAt = this.processingAt || now;
        break;
      case "success":
        this.completedAt = this.completedAt || now;
        break;
      case "failed":
        this.failedAt = this.failedAt || now;
        break;
      case "refunded":
      case "partially_refunded":
        this.refundedAt = this.refundedAt || now;
        break;
      case "cancelled":
        this.cancelledAt = this.cancelledAt || now;
        break;
    }
  }
  
  next();
});

// Method to mark payment as success
PaymentSchema.methods.markAsSuccess = function(gatewayData = {}) {
  this.paymentStatus = "success";
  this.gatewayPaymentId = gatewayData.paymentId || this.gatewayPaymentId;
  this.gatewayOrderId = gatewayData.orderId || this.gatewayOrderId;
  this.transactionId = gatewayData.transactionId || this.transactionId;
  this.completedAt = new Date();
  this.isVerified = true;
  
  return this.save();
};

// Method to mark payment as failed
PaymentSchema.methods.markAsFailed = function(reason = "") {
  this.paymentStatus = "failed";
  this.failedAt = new Date();
  this.notes = this.notes ? `${this.notes} | ${reason}` : reason;
  
  return this.save();
};

// Method to initiate refund
PaymentSchema.methods.initiateRefund = function(refundData) {
  const refundId = `REF${Date.now().toString().slice(-10)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  
  this.refunds.push({
    refundId,
    amount: refundData.amount,
    reason: refundData.reason,
    initiatedBy: refundData.initiatedBy,
    status: "pending"
  });
  
  // Update payment status if full refund
  if (refundData.amount >= this.amount) {
    this.paymentStatus = "refunded";
  } else if (this.refunds.some(r => r.status === "processed")) {
    this.paymentStatus = "partially_refunded";
  }
  
  return this.save();
};

// Method to process refund
PaymentSchema.methods.processRefund = function(refundId, gatewayRefundId) {
  const refund = this.refunds.find(r => r.refundId === refundId);
  if (refund) {
    refund.status = "processed";
    refund.gatewayRefundId = gatewayRefundId;
    refund.processedAt = new Date();
    
    // Check if all refunds are processed
    const allProcessed = this.refunds.every(r => r.status === "processed");
    if (allProcessed && this.totalRefunded >= this.amount) {
      this.paymentStatus = "refunded";
      this.refundedAt = new Date();
    } else if (this.totalRefunded > 0) {
      this.paymentStatus = "partially_refunded";
    }
    
    return this.save();
  }
  
  throw new Error(`Refund with ID ${refundId} not found`);
};

// Method to get payment summary
PaymentSchema.methods.getSummary = function() {
  return {
    id: this._id,
    invoiceId: this.invoiceId,
    transactionId: this.transactionId,
    amount: this.amount,
    currency: this.currency,
    status: this.paymentStatus,
    type: this.paymentType,
    tournamentId: this.tournamentId,
    userId: this.userId,
    teamId: this.teamId,
    initiatedAt: this.initiatedAt,
    completedAt: this.completedAt,
    netAmount: this.netAmount,
    totalRefunded: this.totalRefunded,
    isExpired: this.isExpired
  };
};

// Static method to find by invoice ID
PaymentSchema.statics.findByInvoiceId = function(invoiceId) {
  return this.findOne({ invoiceId });
};

// Static method to find by transaction ID
PaymentSchema.statics.findByTransactionId = function(transactionId) {
  return this.findOne({ transactionId });
};

// Static method to find pending payments older than X minutes
PaymentSchema.statics.findExpiredPayments = function(minutes = 30) {
  const cutoffTime = new Date(Date.now() - minutes * 60000);
  return this.find({
    paymentStatus: "pending",
    initiatedAt: { $lt: cutoffTime }
  });
};

// Indexes for better query performance
PaymentSchema.index({ userId: 1, tournamentId: 1 });
PaymentSchema.index({ tournamentId: 1, paymentStatus: 1 });
PaymentSchema.index({ paymentStatus: 1, initiatedAt: 1 });
PaymentSchema.index({ gatewayOrderId: 1 });
PaymentSchema.index({ gatewayPaymentId: 1 });
PaymentSchema.index({ invoiceId: 1 }, { unique: true, sparse: true });
PaymentSchema.index({ transactionId: 1 }, { unique: true, sparse: true });
PaymentSchema.index({ paymentType: 1, paymentStatus: 1 });
PaymentSchema.index({ teamId: 1 });
PaymentSchema.index({ completedAt: 1 });
PaymentSchema.index({ createdBy: 1 });

module.exports = mongoose.model("Payment", PaymentSchema);