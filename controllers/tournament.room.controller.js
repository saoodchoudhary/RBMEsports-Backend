const Tournament = require("../models/Tournament");
const TournamentTeam = require("../models/TournamentTeam");

// helper: check if user is registered + paid
const isUserPaidForTournament = async ({ tournament, userId }) => {
  if (tournament.tournamentType === "squad") {
    const team = await TournamentTeam.findOne({
      tournamentId: tournament._id,
      "captain.userId": userId,
      paymentStatus: "paid",
    }).select("_id");
    return Boolean(team);
  }

  // solo/duo
  const participant = tournament.participants.find(
    (p) => p.userId && p.userId.toString() === userId.toString() && p.paymentStatus === "paid"
  );
  return Boolean(participant);
};

// GET /api/tournaments/:id/room  (protect + paid user OR admin)
exports.getTournamentRoom = async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id).select(
      "title tournamentType roomId roomPassword participants"
    );

    if (!tournament) {
      return res.status(404).json({ success: false, message: "Tournament not found" });
    }

    // admin can view always
    const isAdmin = req.user && (req.user.role === "admin" || req.user.role === "super_admin");
    if (!isAdmin) {
      const ok = await isUserPaidForTournament({ tournament, userId: req.user.id });
      if (!ok) {
        return res.status(403).json({
          success: false,
          message: "Room details are available only for registered & paid participants.",
        });
      }
    }
const data = tournament.toObject();

res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};