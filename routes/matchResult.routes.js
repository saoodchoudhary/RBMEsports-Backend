const express = require("express");
const router = express.Router();

const { getTournamentMatchResults } = require("../controllers/matchResult.controller");

// Public
router.get("/tournaments/:id/match-results", getTournamentMatchResults);

module.exports = router;