const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const mongoose = require("mongoose");
const User = require("../models/User");

router.use(authenticate);

// GET /api/search?q=john&role=student
router.get(
  "/",
  requireRole("admin", "manager", "lecturer", "superadmin"),
  async (req, res) => {
    try {
      const { q, role } = req.query;

      if (!q || q.trim().length < 2) {
        return res.status(400).json({ error: "Query must be at least 2 characters" });
      }

      // Get company ID safely regardless of how it's stored
      let companyId = req.user.company;
      if (companyId && typeof companyId === 'object' && companyId._id) {
        companyId = companyId._id;
      }

      console.log("Search query:", q, "Company:", companyId, "Role filter:", role);

      const searchRegex = new RegExp(q.trim(), "i");

      const filter = {
        company: companyId,
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { indexNumber: searchRegex },
          { employeeId: searchRegex },
        ],
      };

      // Exclude self
      if (req.user._id) {
        filter._id = { $ne: req.user._id };
      }

      if (role && role !== "all") {
        filter.role = role;
      }

      console.log("Search filter:", JSON.stringify(filter));

      const users = await User.find(filter)
        .select("name email indexNumber employeeId role isActive createdAt department")
        .limit(50)
        .lean();

      console.log("Search results:", users.length);

      return res.json({ users });
    } catch (e) {
      console.error("Search error:", e);
      return res.status(500).json({ error: "Search failed: " + e.message });
    }
  }
);

module.exports = router;
