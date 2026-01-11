const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { validateRequest } = require('../middleware/validation.middleware');
const Joi = require('joi');

// Validation schemas
const registerSchema = Joi.object({
  name: Joi.string().required().min(2).max(50),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().pattern(/^[0-9]{10}$/).required(),
  bgmiId: Joi.string().pattern(/^[0-9]{10,12}$/).required(),
  inGameName: Joi.string().min(2).max(20).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(50),
  phone: Joi.string().pattern(/^[0-9]{10}$/),
  bgmiId: Joi.string().pattern(/^[0-9]{10,12}$/),
  inGameName: Joi.string().min(2).max(20),
  profileImage: Joi.string().uri()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required()
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required()
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: Joi.string().min(6).required()
});

// Public routes
router.post('/register', validateRequest(registerSchema), authController.register);
router.post('/login', validateRequest(loginSchema), authController.login);
router.post('/forgot-password', validateRequest(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validateRequest(resetPasswordSchema), authController.resetPassword);
router.get('/verify-email/:token', authController.verifyEmail);

// Protected routes
router.use(authMiddleware.verifyToken);

router.get('/profile', authController.getProfile);
router.put('/profile', validateRequest(updateProfileSchema), authController.updateProfile);
router.put('/change-password', validateRequest(changePasswordSchema), authController.changePassword);
router.post('/resend-verification', authController.resendVerification);
router.post('/logout', authController.logout);

module.exports = router;