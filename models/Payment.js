const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    paymentType: {
      type: String,
      enum: ["individual", "team", "prize_payout", "refund"],
      required: true,
      default: "individual"
    },
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
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "TournamentTeam" },
    payingCaptainId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    coveredUsers: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      bgmiId: { type: String },
      inGameName: { type: String },
      isCaptain: { type: Boolean, default: false }
    }],
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR", enum: ["INR", "USD", "EUR"] },
    baseAmount: { type: Number },
    taxAmount: { type: Number, default: 0 },
    gatewayFee: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    netAmount: { type: Number },
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
    paymentGateway: { 
      type: String, 
      enum: ["razorpay", "paytm", "cashfree", "stripe", "paypal", "manual", "bank_transfer"], 
      required: true,
      index: true 
    },
    gatewayOrderId: { type: String },
    gatewayPaymentId: { type: String },
    gatewaySignature: { type: String },
    transactionId: { type: String },
    invoiceId: { type: String },
    referenceId: { type: String },
    paymentMethod: { 
      type: { type: String, enum: ["card", "netbanking", "upi", "wallet", "emi", "bank_transfer", "cash"] },
      lastFour: String,
      bank: String,
      wallet: String,
      upiId: String,
      cardType: { type: String, enum: ["credit", "debit"] },
      issuer: String
    },
    initiatedAt: { type: Date, default: Date.now, index: true },
    processingAt: { type: Date },
    completedAt: { type: Date },
    failedAt: { type: Date },
    refundedAt: { type: Date },
    cancelledAt: { type: Date },
    customerDetails: {
      name: String,
      email: String,
      phone: String,
      bgmiId: String,
      inGameName: String
    },
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
      taxId: String
    },
    description: { type: String },
    notes: { type: String },
    internalNotes: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    refunds: [{
      refundId: { type: String, required: true },
      amount: { type: Number, required: true },
      reason: { type: String },
      initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      status: { type: String, enum: ["pending", "processed", "failed", "cancelled"] },
      gatewayRefundId: String,
      processedAt: Date,
      notes: String
    }],
    payoutDetails: {
      payoutMethod: { type: String, enum: ["bank", "upi", "wallet"] },
      payoutId: String,
      payoutStatus: { type: String, enum: ["pending", "initiated", "processed", "failed"] },
      processedAt: Date,
      transactionReference: String,
      taxDeducted: { type: Number, default: 0 },
      tdsPercentage: { type: Number, default: 0 }
    },
    webhookData: { type: mongoose.Schema.Types.Mixed },
    callbackUrl: String,
    webhookStatus: { type: String, enum: ["pending", "received", "processed", "failed"] },
    ipAddress: String,
    userAgent: String,
    deviceId: String,
    isVerified: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isTestPayment: { type: Boolean, default: false },
    isAutoRefund: { type: Boolean, default: false },
    requiresManualReview: { type: Boolean, default: false },
    isSuspicious: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtuals
PaymentSchema.virtual('totalRefunded').get(function() {
  return this.refunds.reduce((total, refund) => {
    return total + (refund.status === "processed" ? refund.amount : 0);
  }, 0);
});

PaymentSchema.virtual('isFullyRefunded').get(function() {
  return this.totalRefunded >= this.amount;
});

PaymentSchema.virtual('paymentAgeMinutes').get(function() {
  return Math.floor((Date.now() - this.initiatedAt) / (1000 * 60));
});

PaymentSchema.virtual('isExpired').get(function() {
  if (this.paymentStatus !== "pending") return false;
  return this.paymentAgeMinutes > 30;
});

// Auto-calculate amounts and generate IDs
PaymentSchema.pre("save", function() {
  // Generate invoice ID
  if (!this.invoiceId && this.paymentType !== "refund") {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const prefix = this.paymentType === "prize_payout" ? "POUT" : "INV";
    this.invoiceId = `${prefix}-${timestamp}${random}`;
  }
  
  // Generate transaction ID
  if (!this.transactionId && this.paymentStatus === "success") {
    const timestamp = Date.now().toString().slice(-10);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.transactionId = `TXN${timestamp}${random}`;
  }
  
  // Calculate net amount
  if (this.isModified('amount') || this.isModified('taxAmount') || 
      this.isModified('gatewayFee') || this.isModified('platformFee')) {
    this.netAmount = this.amount - (this.taxAmount || 0) - (this.gatewayFee || 0) - (this.platformFee || 0);
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
});

// Indexes
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