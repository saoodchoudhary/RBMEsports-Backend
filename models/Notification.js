
// models/Notification.js
const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { 
      type: String, 
      enum: [
        "tournament_registration",
        "tournament_start",
        "payment_success",
        "payment_failed",
        "result_published",
        "winner_declared",
        "team_invite",
        "admin_announcement",
        "match_reminder"
      ],
      required: true 
    },
    
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed },
    
    read: { type: Boolean, default: false },
    readAt: { type: Date },
    
    actionUrl: { type: String },
    actionText: { type: String },
    
    expiresAt: { type: Date },
    
    priority: { 
      type: String, 
      enum: ["low", "medium", "high", "urgent"], 
      default: "medium" 
    }
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Notification", NotificationSchema);