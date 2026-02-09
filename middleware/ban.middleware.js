/**
 * Block banned users from sensitive actions like tournament registration/payment.
 * Use after protect middleware (req.user available).
 */
exports.blockBanned = (req, res, next) => {
  if (!req.user) return next();

  if (req.user.isBanned) {
    return res.status(403).json({
      success: false,
      message: req.user.banReason
        ? `You are banned: ${req.user.banReason}`
        : "You are banned from this platform.",
    });
  }

  next();
};