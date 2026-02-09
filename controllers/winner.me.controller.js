const WinnerProfile = require("../models/WinnerProfile");
const TournamentTeam = require("../models/TournamentTeam");

// GET /api/winners/my
exports.getMyWinnings = async (req, res, next) => {
  try {
    // 1) Individual winnings (solo/duo)
    const individual = await WinnerProfile.find({ userId: req.user.id })
      .populate("tournamentId", "title tournamentType")
      .sort({ createdAt: -1 });

    // 2) Squad captain winnings (if your teamId won and you are captain)
    const myTeams = await TournamentTeam.find({ "captain.userId": req.user.id }).select("_id");
    const myTeamIds = myTeams.map((t) => t._id);

    const squadCaptain = await WinnerProfile.find({ teamId: { $in: myTeamIds } })
      .populate("tournamentId", "title tournamentType")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        individual,
        squadCaptain
      }
    });
  } catch (e) {
    next(e);
  }
};