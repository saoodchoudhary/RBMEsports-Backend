const Payment = require("../models/Payment");
const Tournament = require("../models/Tournament");
const TournamentTeam = require("../models/TournamentTeam");
const { markCouponUsed } = require("../utils/coupon.utils");


// ✅ NEW: List manual payments for review
// GET /api/admin/manual-payments?status=on_hold|success|failed
exports.getManualPayments = async (req, res, next) => {
  try {
    const { status = "on_hold" } = req.query;

    const query = {
      paymentGateway: "manual",
      requiresManualReview: true
    };

    if (status) query.paymentStatus = status;

    const payments = await Payment.find(query)
      .populate("userId", "name email phone bgmiId inGameName")
      .populate("tournamentId", "title tournamentType")
      .sort({ updatedAt: -1 });

    return res.status(200).json({ success: true, data: payments });
  } catch (e) {
    next(e);
  }
};

// ✅ NEW: Approve/Reject manual payment
// PUT /api/admin/manual-payments/:id/decision
exports.decideManualPayment = async (req, res, next) => {
  try {
    const { decision, transactionId, rejectionReason } = req.body;

    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });

    if (payment.paymentGateway !== "manual") {
      return res.status(400).json({ success: false, message: "Not a manual payment" });
    }

    const tournament = await Tournament.findById(payment.tournamentId);

    if (decision === "approve") {
      if (!transactionId) {
        return res.status(400).json({ success: false, message: "transactionId is required to approve" });
      }

      payment.paymentStatus = "success";
      payment.transactionId = String(transactionId).trim();
      payment.isVerified = true;
      payment.verifiedBy = req.user.id;
      payment.verifiedAt = new Date();
      payment.internalNotes = `Approved by admin ${req.user.id}`;

      await payment.save();

      if (payment.paymentType === "team") {
        await TournamentTeam.findByIdAndUpdate(payment.teamId, { paymentStatus: "paid" });
      } else if (tournament) {
        const idx = tournament.participants.findIndex(
          (p) => p.userId.toString() === payment.userId.toString()
        );
        if (idx !== -1) {
          tournament.participants[idx].paymentStatus = "paid";
          await tournament.save();
        }
      }

      return res.status(200).json({ success: true, message: "Approved", data: payment });
    }

    if (decision === "reject") {
      if (!rejectionReason) {
        return res.status(400).json({ success: false, message: "rejectionReason is required" });
      }

      payment.paymentStatus = "failed";
      payment.isVerified = false;
      payment.failedAt = new Date();
      payment.internalNotes = `Rejected by admin ${req.user.id}: ${String(rejectionReason).trim()}`;
      payment.metadata = {
        ...(payment.metadata || {}),
        rejection: {
          reason: String(rejectionReason).trim(),
          rejectedBy: req.user.id,
          rejectedAt: new Date().toISOString()
        }
      };

      await payment.save();

      // free slot
      if (payment.paymentType === "team" && payment.teamId) {
        await TournamentTeam.findByIdAndDelete(payment.teamId);
        if (tournament && typeof tournament.currentParticipants === "number") {
          tournament.currentParticipants = Math.max(0, tournament.currentParticipants - 1);
          await tournament.save();
        }
      } else if (tournament) {
        const before = tournament.participants.length;
        tournament.participants = tournament.participants.filter(
          (p) => p.userId.toString() !== payment.userId.toString()
        );
        const removed = before - tournament.participants.length;
        if (typeof tournament.currentParticipants === "number") {
          tournament.currentParticipants = Math.max(0, tournament.currentParticipants - removed);
        }
        await tournament.save();
      }

      return res.status(200).json({ success: true, message: "Rejected", data: payment });
    }

    return res.status(400).json({ success: false, message: "Invalid decision" });
  } catch (e) {
    next(e);
  }
};