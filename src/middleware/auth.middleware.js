const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = {
  // Verify JWT token
  verifyToken: async (req, res, next) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. No token provided.'
        });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token. User not found.'
        });
      }

      req.user = user;
      req.token = token;
      next();
    } catch (error) {
      console.error('Token verification error:', error);
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token.'
        });
      }
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired. Please login again.'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Server error during authentication.'
      });
    }
  },

  // Check if user is admin
  isAdmin: (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }
    next();
  },

  // Check if user is super admin
  isSuperAdmin: (req, res, next) => {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super admin privileges required.'
      });
    }
    next();
  },

  // Check if user has completed profile
  isProfileComplete: (req, res, next) => {
    if (!req.user.profileCompleted) {
      return res.status(403).json({
        success: false,
        message: 'Please complete your profile first. Add BGMI ID and phone number.'
      });
    }
    next();
  },

  // Rate limiting middleware
  rateLimiter: require('express-rate-limit')({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later.'
    }
  }),

  // Validate request body
  validateRequest: (schema) => {
    return (req, res, next) => {
      const { error } = schema.validate(req.body, { abortEarly: false });
      
      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors
        });
      }
      next();
    };
  },

  // Check tournament registration status
  checkTournamentRegistration: async (req, res, next) => {
    try {
      const tournament = await Tournament.findById(req.params.tournamentId);
      
      if (!tournament) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }

      if (!tournament.isRegistrationOpen) {
        return res.status(400).json({
          success: false,
          message: 'Registration is closed for this tournament'
        });
      }

      req.tournament = tournament;
      next();
    } catch (error) {
      console.error('Tournament check error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  },

  // Upload middleware for images
  upload: require('../utils/upload')
};

module.exports = authMiddleware;