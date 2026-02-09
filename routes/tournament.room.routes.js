const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/auth.middleware");
const { getTournamentRoom } = require("../controllers/tournament.room.controller");

router.get("/:id/room", protect, getTournamentRoom);

module.exports = router;