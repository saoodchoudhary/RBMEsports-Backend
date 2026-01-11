const express = require('express');
const router = express.Router();
const tournamentController = require('../controllers/tournament.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { validateRequest } = require('../middleware/validation.middleware');
const Joi = require('joi');

// Validation schemas
const createTournamentSchema = Joi.object({
  name: Joi.string().required().min(5).max(100),
  description: Joi.string().required().min(20).max(2000),
  type: Joi.string().valid('solo', 'duo', 'squad', 'custom').required(),
  startDate: Joi.date().required(),
  endDate: Joi.date().allow(null),
  registrationStart: Joi.date().required(),
  registrationEnd: Joi.date().required(),
  isPaid: Joi.boolean().required(),
  serviceFee: Joi.when('isPaid', {
    is: true,
    then: Joi.number().min(0).required(),
    otherwise: Joi.number().min(0).default(0)
  }),
  prizePool: Joi.number().min(0).required(),
  maxTeams: Joi.number().min(4).max(100).required(),
  rules: Joi.array().items(Joi.string()),
  scoringSystem: Joi.object(),
  totalMatches: Joi.number().min(1).max(10).default(3)
});

const updateTournamentSchema = Joi.object({
  name: Joi.string().min(5).max(100),
  description: Joi.string().min(20).max(2000),
  type: Joi.string().valid('solo', 'duo', 'squad', 'custom'),
  startDate: Joi.date(),
  endDate: Joi.date().allow(null),
  registrationStart: Joi.date(),
  registrationEnd: Joi.date(),
  isPaid: Joi.boolean(),
  serviceFee: Joi.number().min(0),
  prizePool: Joi.number().min(0),
  maxTeams: Joi.number().min(4).max(100),
  rules: Joi.array().items(Joi.string()),
  scoringSystem: Joi.object(),
  totalMatches: Joi.number().min(1).max(10),
  status: Joi.string().valid(
    'draft', 'upcoming', 'registration_open', 'registration_closed',
    'check_in_open', 'live', 'completed', 'cancelled'
  )
});

const registerIndividualSchema = Joi.object({
  bgmiId: Joi.string().pattern(/^[0-9]{10,12}$/).required(),
  inGameName: Joi.string().min(2).max(20).required()
});

const registerTeamSchema = Joi.object({
  teamName: Joi.string().required().min(3).max(50),
  teamTag: Joi.string().max(4),
  members: Joi.array().items(
    Joi.object({
      userId: Joi.string().required(),
      bgmiId: Joi.string().pattern(/^[0-9]{10,12}$/).required(),
      inGameName: Joi.string().min(2).max(20).required(),
      phone: Joi.string().pattern(/^[0-9]{10}$/).required(),
      position: Joi.string().valid(
        'assault', 'sniper', 'support', 'flex', 'leader', 'fragger'
      ).default('flex')
    })
  ).required()
});

const updateStatusSchema = Joi.object({
  status: Joi.string().valid(
    'draft', 'upcoming', 'registration_open', 'registration_closed',
    'check_in_open', 'live', 'completed', 'cancelled'
  ).required()
});

// Public routes
router.get('/', tournamentController.getAllTournaments);
router.get('/:id', tournamentController.getTournament);
router.get('/:tournamentId/leaderboard', tournamentController.getLeaderboard);
router.get('/:tournamentId/participants', tournamentController.getParticipants);

// Protected routes
router.use(authMiddleware.verifyToken);

// User routes
router.get('/user/registrations', tournamentController.getMyRegistrations);
router.post('/:tournamentId/register/individual', 
  authMiddleware.isProfileComplete,
  validateRequest(registerIndividualSchema),
  tournamentController.registerIndividual
);
router.post('/:tournamentId/register/team',
  authMiddleware.isProfileComplete,
  validateRequest(registerTeamSchema),
  tournamentController.registerTeam
);
router.delete('/:tournamentId/unregister', tournamentController.unregister);

// Admin routes
router.use(authMiddleware.isAdmin);

router.post('/', 
  validateRequest(createTournamentSchema),
  tournamentController.createTournament
);
router.put('/:id',
  validateRequest(updateTournamentSchema),
  tournamentController.updateTournament
);
router.delete('/:id', tournamentController.deleteTournament);
router.put('/:tournamentId/status',
  validateRequest(updateStatusSchema),
  tournamentController.updateStatus
);

module.exports = router;