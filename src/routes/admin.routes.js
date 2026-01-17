const router = require("express").Router();
const adminAuth = require("../middlewares/adminAuth");
const authCtrl = require("../controllers/admin.auth.controller");
const adminCtrl = require("../controllers/admin.controller");

router.post('/login', authCtrl.login);
router.put('/profile', adminAuth, authCtrl.updateProfile);

// USERS
router.get("/users", adminAuth, adminCtrl.getAllUsers);
router.post("/users", adminAuth, adminCtrl.createUser);
router.get("/users/:id", adminAuth, adminCtrl.getUserById);
router.get("/users/:id/orders", adminAuth, adminCtrl.getUserOrders);
router.delete("/users/:id", adminAuth, adminCtrl.deleteUser);

// SELLERS
router.get("/sellers", adminAuth, adminCtrl.getAllSellers);
router.get("/sellers/:id", adminAuth, adminCtrl.getSellerById);
router.get("/sellers/:id/orders", adminAuth, adminCtrl.getSellerOrders);
router.put("/sellers/:id", adminAuth, adminCtrl.updateSeller);
router.delete("/sellers/:id", adminAuth, adminCtrl.deleteSeller);

// ORDERS
router.get("/orders", adminAuth, adminCtrl.getAllOrders);
router.post("/orders/:id/assign", adminAuth, adminCtrl.assignOrderToPartner);
router.put("/orders/:id/status", adminAuth, adminCtrl.updateOrderStatus);
router.put("/orders/:id", adminAuth, adminCtrl.updateOrder);
router.delete("/orders/:id", adminAuth, adminCtrl.deleteOrder);

// DELIVERY PARTNERS
router.post("/delivery-partners", adminAuth, adminCtrl.createDeliveryPartner);
router.get("/delivery-partners", adminAuth, adminCtrl.getAllDeliveryPartners);
router.put("/delivery-partners/:id", adminAuth, adminCtrl.updateDeliveryPartner);
router.delete("/delivery-partners/:id", adminAuth, adminCtrl.deleteDeliveryPartner);

// CATEGORIES
router.post("/categories", adminAuth, adminCtrl.addCategory);
router.delete("/categories/:id", adminAuth, adminCtrl.deleteCategory);
router.post("/subcategories", adminAuth, adminCtrl.addSubCategory);
router.delete("/subcategories/:id", adminAuth, adminCtrl.deleteSubCategory);
router.post("/categories/sub", adminAuth, adminCtrl.addSubCategory); // Compatibility alias

// ANALYTICS
router.get("/stats", adminAuth, adminCtrl.getStats);
router.get("/analytics", adminAuth, adminCtrl.getAllAnalytics);
router.get("/analytics/download/excel", adminAuth, adminCtrl.downloadAnalyticsExcel);
router.get("/analytics/download/pdf", adminAuth, adminCtrl.downloadAnalyticsPDF);
router.put("/analytics/:id", adminAuth, adminCtrl.updateAnalytics);
router.delete("/analytics/:id", adminAuth, adminCtrl.deleteAnalytics);

// OFFERS
router.post("/offer", adminAuth, adminCtrl.createOffer);
router.get("/offers", adminAuth, adminCtrl.getAllOffers); // Admin only
router.get("/offers/active", adminCtrl.getActiveOffers); // Public/Buyer
router.delete("/offer/:id", adminAuth, adminCtrl.deleteOffer);
router.put("/offer/:id", adminAuth, adminCtrl.updateOffer);
router.post("/offer/apply", adminCtrl.applyOffer); // Public/Buyer route

// VARIANTS
router.get("/variants", adminAuth, adminCtrl.getAllVariants);
router.put("/variants/:id", adminAuth, adminCtrl.updateVariant);
router.delete("/variants/:id", adminAuth, adminCtrl.deleteVariant);

module.exports = router;
