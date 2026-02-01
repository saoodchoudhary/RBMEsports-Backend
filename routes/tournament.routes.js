const express = require('express');
const router = express.Router();
const {
  getAllTournaments,
  getTournament,
  registerForTournament,
  registerSquad,
  getLeaderboard,
  getTournamentParticipants  // Add this
} = require('../controllers/tournament.controller');
const { protect, optionalAuth } = require('../middleware/auth.middleware');

// Public routes
router.get('/', optionalAuth, getAllTournaments);
router.get('/:id', optionalAuth, getTournament);
router.get('/:id/leaderboard', getLeaderboard);
router.get('/:id/participants', getTournamentParticipants);  // Add this route

// Protected routes
router.post('/:id/register', protect, registerForTournament);
router.post('/:id/register-squad', protect, registerSquad);

module.exports = router;