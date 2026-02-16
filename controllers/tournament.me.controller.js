const Tournament = require("../models/Tournament");
const TournamentTeam = require("../models/TournamentTeam");
const Payment = require("../models/Payment");

/**
 * @desc    Get current user's registration status for a tournament
 * @route   GET /api/tournaments/:id/my-registration
 * @access  Private
 */
exports.getMyTournamentRegistration = async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found"
      });
    }

    const userId = req.user.id;

    // Check if user is registered
    let registered = false;
    let paymentId = null;
    let paymentStatus = null;
    let teammates = null;

    if (tournament.tournamentType === "squad") {
      // Check in TournamentTeam
      const team = await TournamentTeam.findOne({
        tournamentId: tournament._id,
        "captain.userId": userId
      }).populate("paymentId");

      if (team) {
        registered = true;
        paymentId = team.paymentId?._id || team.paymentId;
        paymentStatus = team.paymentStatus;

        // ✅ Return teammate data for pre-filling
        teammates = {
          teamName: team.teamName,
          members: team.members.map(m => ({
            bgmiId: m.bgmiId,
            inGameName: m.inGameName
          }))
        };
      }
    } else {
      // Check in tournament.participants (solo/duo)
      const participant = tournament.participants.find(
        p => p.userId.toString() === userId
      );

      if (participant) {
        registered = true;
        paymentId = participant.paymentId;
        paymentStatus = participant.paymentStatus;

        // ✅ Return duo partner data for pre-filling
        if (tournament.tournamentType === "duo" && participant.partnerInfo) {
          teammates = {
            partnerInfo: {
              bgmiId: participant.partnerInfo.bgmiId,
              inGameName: participant.partnerInfo.inGameName
            }
          };
        }
      }
    }

    // If registered, get payment details
    if (registered && paymentId) {
      try {
        const payment = await Payment.findById(paymentId);
        if (payment) {
          paymentStatus = payment.paymentStatus;
        }
      } catch (err) {
        console.error("Error fetching payment:", err);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        registered,
        tournamentType: tournament.tournamentType,
        paymentId,
        paymentStatus,
        teammates // ✅ NEW: Send teammate data back
      }
    });
  } catch (error) {
    console.error("Error checking registration:", error);
    next(error);
  }
};