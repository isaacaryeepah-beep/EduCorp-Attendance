const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const mongoose = require("mongoose");
const User = require("../models/User");

router.use(authenticate);

// GET /api/search?q=john&role=student
router.get(
  "/",
  requireRole("admin", "manager", "lecturer", "superadmin"),
  companyIsolation,
  async (req, res) => {
    try {
      const { q, role } = req.query;

      if (!q || q.trim().length < 2) {
        return res.status(400).json({ error: "Query must be at least 2 characters" });
      }

      const companyId = req.user.company?._id || req.user.company;
      const searchRegex = new RegExp(q.trim(), "i");

      const filter = {
        company: new mongoose.Types.ObjectId(String(companyId)),
        _id: { $ne: req.user._id },
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { indexNumber: searchRegex },
          { employeeId: searchRegex },
        ],
      };

      if (role && role !== "all") {
        filter.role = role;
      }

      const users = await User.find(filter)
        .select("name email indexNumber employeeId role isActive createdAt department")
        .limit(50)
        .lean();

      return res.json({ users });
    } catch (e) {
      console.error("Search error:", e);
      return res.status(500).json({ error: "Search failed" });
    }
  }
);

module.exports = router;
