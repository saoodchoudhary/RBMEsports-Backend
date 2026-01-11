const Joi = require('joi');

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { 
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/['"]/g, '')
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }
    
    next();
  };
};

// Common validation schemas
const schemas = {
  objectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
  email: Joi.string().email().lowercase().trim(),
  phone: Joi.string().pattern(/^[0-9]{10}$/),
  bgmiId: Joi.string().pattern(/^[0-9]{10,12}$/),
  password: Joi.string().min(6).max(30),
  name: Joi.string().min(2).max(50),
  url: Joi.string().uri()
};

module.exports = {
  validateRequest,
  schemas
};