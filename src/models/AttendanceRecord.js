const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const { enforceLogoutRestriction } = require("../middleware/deviceValidation");
const attendanceController = require("../controllers/attendanceController");
const AttendanceRecord = require("../models/AttendanceRecord");
const AttendanceSession = require("../models/AttendanceSession");
const router = express.Router();

router.use(authenticate);
router.use(requireActiveSubscription);

router.post("/start", requireRole("admin", "manager", "lecturer", "superadmin"), companyIsolation, attendanceController.startSession);
router.post("/:id/stop", requireRole("admin", "manager", "lecturer", "superadmin"), companyIsolation, attendanceController.stopSession);
router.get("/", requireRole("manager", "lecturer", "admin", "superadmin"), companyIsolation, attendanceController.listSessions);
router.get("/active", companyIsolation, attendanceController.getActiveSession);
router.get("/my-attendance", attendanceController.getMyAttendance);
router.get("/sign-in-status", attendanceController.getSignInStatus);
router.post("/sign-in", requireRole("employee"), attendanceController.employeeSignIn);
router.post("/sign-out", requireRole("employee"), attendanceController.employeeSignOut);
router.get("/:id", companyIsolation, attendanceController.getSession);

// Original live mark route
router.post("/mark", enforceLogoutRestriction, attendanceController.markAttendance);

// ── Offline sync route ──────────────────────────────────────────────────────
// POST /api/attendance-sessions/sync-offline
//
// Called by the frontend offline queue when connection returns.
// Handles duplicates gracefully using the unique index { session, user }.
// Returns:
//   200 — marked successfully
//   409 — already marked (client should remove from queue)
//   400 — session not found or closed (client should remove from queue)
//   401 — token expired (client stops sync, keeps queue)
//   500 — unexpected error
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sync-offline", enforceLogoutRestriction, async (req, res) => {
  try {
    const userId = req.user._id;
    const companyId = req.user.company?._id || req.user.company;
    const { code, qrToken, method, sessionId, meetingId } = req.body;

    // ── Step 1: Find the active session ───────────────────────────────────
    let session = null;

    if (sessionId) {
      // If frontend stored sessionId explicitly
      session = await AttendanceSession.findOne({
        _id: sessionId,
        company: companyId,
      });
    } else {
      // Otherwise find the most recent active session for this company
      // (same logic the markAttendance controller uses)
      session = await AttendanceSession.findOne({
        company: companyId,
        status: "active",
      }).sort({ startedAt: -1 });
    }

    if (!session) {
      // Session not found or already stopped — remove from queue
      return res.status(400).json({
        error: "Session not found or already closed. Record removed from queue.",
        removeFromQueue: true,
      });
    }

    // ── Step 2: Check for existing record (duplicate) ─────────────────────
    const existing = await AttendanceRecord.findOne({
      session: session._id,
      user: userId,
    });

    if (existing) {
      // Already marked — tell client to remove from queue
      return res.status(409).json({
        alreadyMarked: true,
        message: "Attendance already recorded for this session.",
        removeFromQueue: true,
      });
    }

    // ── Step 3: Create the attendance record ──────────────────────────────
    const recordMethod = method || "code_mark";

    const record = new AttendanceRecord({
      session: session._id,
      user: userId,
      company: companyId,
      method: recordMethod,
      status: "present",
      checkInTime: new Date(),
    });

    await record.save();

    return res.status(200).json({
      message: "Attendance synced successfully.",
      record: {
        session: session._id,
        method: recordMethod,
        checkInTime: record.checkInTime,
      },
    });

  } catch (e) {
    // MongoDB duplicate key error (race condition — two syncs at once)
    if (e.code === 11000) {
      return res.status(409).json({
        alreadyMarked: true,
        message: "Attendance already recorded (duplicate key).",
        removeFromQueue: true,
      });
    }

    console.error("[sync-offline] Unexpected error:", e.message);
    return res.status(500).json({ error: "Sync failed: " + e.message });
  }
});

module.exports = router;
