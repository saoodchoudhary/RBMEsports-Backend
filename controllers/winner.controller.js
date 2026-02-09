const WinnerProfile = require("../models/WinnerProfile");

// GET /api/winners/recent?limit=10
exports.getRecentWinners = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;

    const winners = await WinnerProfile.find()
      .populate("userId", "name inGameName bgmiId profileImage")
      .populate("tournamentId", "title tournamentType bannerImage map prizePool")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      count: winners.length,
      data: winners,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/winners/featured
exports.getFeaturedWinners = async (req, res, next) => {
  try {
    const winners = await WinnerProfile.find({ isFeatured: true })
      .populate("userId", "name inGameName bgmiId profileImage")
      .populate("tournamentId", "title tournamentType bannerImage map prizePool")
      .sort({ displayOrder: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: winners.length,
      data: winners,
    });
  } catch (error) {
    next(error);
  }
};