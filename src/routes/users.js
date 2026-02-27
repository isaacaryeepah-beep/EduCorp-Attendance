const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole, requireMinRole } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const userController = require("../controllers/userController");

const router = express.Router();

router.use(authenticate);

router.get("/", requireMinRole("employee"), companyIsolation, userController.listUsers);
router.post("/", requireMinRole("manager"), companyIsolation, userController.createUser);
router.post("/bulk", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.bulkAction);
router.patch("/:id", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.updateUser);
router.patch("/:id/activate", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.activateUser);
router.delete("/:id", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.deactivateUser);
router.delete("/:id/permanent", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.deleteUser);

module.exports = router;
