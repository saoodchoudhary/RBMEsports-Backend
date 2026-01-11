const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { validateRequest } = require('../middleware/validation.middleware');
const Joi = require('joi');

// Admin only routes
router.use(authMiddleware.verifyToken);
router.use(authMiddleware.isAdmin);

// Validation schemas
const createUserSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('user', 'admin', 'super_admin').default('user'),
  phone: Joi.string().pattern(/^[0-9]{10}$/),
  bgmiId: Joi.string().pattern(/^[0-9]{10,12}$/)
});

const updateUserSchema = Joi.object({
  name: Joi.string(),
  email: Joi.string().email(),
  role: Joi.string().valid('user', 'admin', 'super_admin'),
  phone: Joi.string().pattern(/^[0-9]{10}$/),
  bgmiId: Joi.string().pattern(/^[0-9]{10,12}$/),
  isActive: Joi.boolean()
});

const matchResultSchema = Joi.object({
  tournamentId: Joi.string().required(),
  matchNumber: Joi.number().required(),
  results: Joi.array().items(
    Joi.object({
      userId: Joi.string().required(),
      kills: Joi.number().min(0).default(0),
      placement: Joi.number().min(1).required(),
      damageDealt: Joi.number().min(0).default(0),
      survivalTime: Joi.number().min(0).default(0)
    })
  ).required(),
  map: Joi.string().valid(
    'Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Livik', 'Karakin', 'Deston'
  ).default('Erangel'),
  matchType: Joi.string().valid('TPP', 'FPP').default('TPP'),
  screenshots: Joi.array().items(Joi.string().uri())
});

const winnerSchema = Joi.object({
  tournamentId: Joi.string().required(),
  winners: Joi.array().items(
    Joi.object({
      rank: Joi.number().min(1).required(),
      userId: Joi.string().required(),
      teamId: Joi.string().allow(null),
      prizeAmount: Joi.number().min(0).required()
    })
  ).required()
});

// User management
router.get('/users', adminController.getAllUsers);
router.post('/users', validateRequest(createUserSchema), adminController.createUser);
router.get('/users/:userId', adminController.getUser);
router.put('/users/:userId', validateRequest(updateUserSchema), adminController.updateUser);
router.delete('/users/:userId', adminController.deleteUser);

// Tournament management
router.get('/tournaments/stats', adminController.getTournamentStats);
router.get('/tournaments/:tournamentId/analytics', adminController.getTournamentAnalytics);

// Match results
router.post('/match-results', 
  validateRequest(matchResultSchema),
  adminController.createMatchResult
);
router.put('/match-results/:matchId',
  validateRequest(matchResultSchema),
  adminController.updateMatchResult
);
router.delete('/match-results/:matchId', adminController.deleteMatchResult);

// Winner management
router.post('/winners', 
  validateRequest(winnerSchema),
  adminController.declareWinners
);

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// System
router.get('/system/stats', adminController.getSystemStats);
router.post('/system/backup', adminController.createBackup);

module.exports = router;