const router = require("express").Router();
const adminAuth = require("../middlewares/adminAuth");
const authCtrl = require("../controllers/admin.auth.controller");
const adminCtrl = require("../controllers/admin.controller");

router.post('/login', authCtrl.login);
router.put('/profile', adminAuth, authCtrl.updateProfile);

// USERS
router.get("/users", adminAuth, adminCtrl.getAllUsers);
router.post("/users", adminAuth, adminCtrl.createUser);
router.delete("/users/:id", adminAuth, adminCtrl.deleteUser);

// SELLERS
router.get("/sellers", adminAuth, adminCtrl.getAllSellers);
router.delete("/sellers/:id", adminAuth, adminCtrl.deleteSeller);

// CATEGORIES
router.post("/categories", adminAuth, adminCtrl.addCategory);
router.delete("/categories/:id", adminAuth, adminCtrl.deleteCategory);
router.post("/subcategories", adminAuth, adminCtrl.addSubCategory);
router.delete("/subcategories/:id", adminAuth, adminCtrl.deleteSubCategory);
router.post("/categories/sub", adminAuth, adminCtrl.addSubCategory); // Compatibility alias

// ANALYTICS
router.get("/stats", adminAuth, adminCtrl.getStats);

module.exports = router;