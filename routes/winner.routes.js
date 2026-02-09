const express = require("express");
const router = express.Router();

const { getRecentWinners, getFeaturedWinners } = require("../controllers/winner.controller");
const { getMyWinnings } = require("../controllers/winner.me.controller");
const { protect } = require("../middleware/auth.middleware");

router.get("/winners/recent", getRecentWinners);
router.get("/winners/featured", getFeaturedWinners);

// NEW
router.get("/winners/my", protect, getMyWinnings);

module.exports = router;