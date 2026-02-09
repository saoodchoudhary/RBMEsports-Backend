const express = require('express');
const router = express.Router();
const {
  getAllTournaments,
  getTournament,
  registerForTournament,
  registerSquad,
  getLeaderboard,
  getTournamentParticipants
} = require('../controllers/tournament.controller');
const { protect, optionalAuth } = require('../middleware/auth.middleware');

// NEW
const { blockBanned } = require("../middleware/ban.middleware");

// Public routes
router.get('/', optionalAuth, getAllTournaments);
router.get('/:id', optionalAuth, getTournament);
router.get('/:id/leaderboard', getLeaderboard);
router.get('/:id/participants', getTournamentParticipants);

// Protected routes
router.post('/:id/register', protect, blockBanned, registerForTournament);
router.post('/:id/register-squad', protect, blockBanned, registerSquad);

module.exports = router;