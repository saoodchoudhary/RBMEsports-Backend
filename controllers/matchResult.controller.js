const MatchResult = require("../models/MatchResult");

// GET /api/tournaments/:id/match-results
exports.getTournamentMatchResults = async (req, res, next) => {
  try {
    const tournamentId = req.params.id;

    const results = await MatchResult.find({ tournamentId })
      .sort({ matchDay: 1, matchNumber: 1, createdAt: 1 })
      .populate("submittedBy", "name email")
      .populate("results.userId", "name inGameName bgmiId");

    res.status(200).json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};