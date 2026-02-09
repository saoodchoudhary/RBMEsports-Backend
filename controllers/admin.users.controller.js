const User = require("../models/User");

// GET /api/admin/users?q=...&role=...&banned=true|false&page=1&limit=20
exports.getUsers = async (req, res, next) => {
  try {
    const { q, role, banned, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (role) filter.role = role;
    if (typeof banned !== "undefined") filter.isBanned = banned === "true";

    if (q) {
      const query = q.trim();
      filter.$or = [
        { name: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
        { phone: { $regex: query, $options: "i" } },
        { bgmiId: { $regex: query, $options: "i" } },
        { inGameName: { $regex: query, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("name email phone bgmiId inGameName role isBanned banReason bannedAt lastActive createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/admin/users/:id/ban
exports.banUser = async (req, res, next) => {
  try {
    const { reason } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        isBanned: true,
        banReason: reason || "Violation of fair play rules",
        bannedAt: new Date(),
        bannedBy: req.user.id,
      },
      { new: true }
    ).select("name email isBanned banReason bannedAt");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({ success: true, message: "User banned", data: user });
  } catch (error) {
    next(error);
  }
};

// PUT /api/admin/users/:id/unban
exports.unbanUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        isBanned: false,
        banReason: null,
        bannedAt: null,
        bannedBy: null,
      },
      { new: true }
    ).select("name email isBanned banReason bannedAt");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({ success: true, message: "User unbanned", data: user });
  } catch (error) {
    next(error);
  }
};