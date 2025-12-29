const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');

const {
    getSalesSummary,
    getSalesGraph,
    getTopProducts,
    getCategorySales

} = require('../controllers/sellerAnalytics.controller');

router.get("/summary", authenticate, getSalesSummary);
router.get("/graph", authenticate, getSalesGraph);
router.get("/top-products", authenticate, getTopProducts);
router.get("/category-sales", authenticate, getCategorySales);

module.exports = router;