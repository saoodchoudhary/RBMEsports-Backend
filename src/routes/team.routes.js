const express = require('express');
const router = express.Router();
const teamController = require('../controllers/team.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { validateRequest } = require('../middleware/validation.middleware');
const Joi = require('joi');

// Validation schemas
const createTeamSchema = Joi.object({
  name: Joi.string().required().min(3).max(50),
  tag: Joi.string().max(6),
  bio: Joi.string().max(1000),
  logo: Joi.string().uri()
});

const updateTeamSchema = Joi.object({
  name: Joi.string().min(3).max(50),
  tag: Joi.string().max(6),
  bio: Joi.string().max(1000),
  logo: Joi.string().uri(),
  captain: Joi.string()
});

const addMemberSchema = Joi.object({
  userId: Joi.string().required(),
  role: Joi.string().valid(
    'owner', 'captain', 'co_captain', 'player', 'substitute', 
    'coach', 'manager', 'analyst', 'content_creator'
  ).default('player'),
  position: Joi.string().valid(
    'assault', 'sniper', 'support', 'flex', 'leader', 'fragger'
  ).default('flex')
});

const joinTeamSchema = Joi.object({
  joinCode: Joi.string().length(6).required()
});

// Public routes
router.get('/search', teamController.searchTeams);
router.get('/:teamId', teamController.getTeam);

// Protected routes
router.use(authMiddleware.verifyToken);
router.use(authMiddleware.isProfileComplete);

router.get('/user/teams', teamController.getMyTeams);
router.post('/create', 
  validateRequest(createTeamSchema),
  teamController.createTeam
);
router.put('/:teamId',
  validateRequest(updateTeamSchema),
  teamController.updateTeam
);
router.post('/:teamId/members',
  validateRequest(addMemberSchema),
  teamController.addMember
);
router.delete('/:teamId/members/:memberId', teamController.removeMember);

// Tournament team routes
router.post('/tournament/join',
  validateRequest(joinTeamSchema),
  teamController.joinTournamentTeam
);
router.get('/tournament/:teamId', teamController.getTournamentTeam);
router.post('/tournament/:teamId/confirm/:memberId', teamController.confirmTeamMember);

module.exports = router;