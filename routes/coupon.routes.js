const express = require("express");
const router = express.Router();

const {
  createCoupon,
  getCoupons,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
} = require("../controllers/coupon.controller");

const { protect, adminOnly, optionalAuth } = require("../middleware/auth.middleware");

// Public/Optional auth validation endpoint
router.post("/validate", optionalAuth, validateCoupon);

// Admin CRUD
router.use(protect);
router.use(adminOnly);

router.post("/", createCoupon);
router.get("/", getCoupons);
router.put("/:id", updateCoupon);
router.delete("/:id", deleteCoupon);

module.exports = router;