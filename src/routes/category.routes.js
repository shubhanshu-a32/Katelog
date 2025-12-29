const express = require('express');
const router = express.Router();
const categoryCtrl = require('../controllers/category.controller');

// Public: List all categories
router.get('/', categoryCtrl.listCategories);

// Secure (Seller/Admin only? Or public? Usually public to browse)
// Keeping creation public or protected? The original code had product routes here.
// Reverting to standard category management routes.

// Admin/Seller only for creation (Assuming admin should do this primarily)
// But for now, let's keep it simple as per the controller.
router.post('/', categoryCtrl.createCategory);

module.exports = router;