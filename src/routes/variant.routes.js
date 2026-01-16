const express = require("express");
const router = express.Router();
const variantCtrl = require("../controllers/variant.controller");
const authenticate = require("../middlewares/auth");

// Public
router.get("/product/:productId", variantCtrl.getVariantsByProduct);
router.get("/:id", variantCtrl.getVariantById);

// Protected (Seller/Admin)
router.get("/", authenticate, variantCtrl.getAllVariants);
router.post("/", authenticate, variantCtrl.createVariant);
router.put("/:id", authenticate, variantCtrl.updateVariant);
router.delete("/:id", authenticate, variantCtrl.deleteVariant);

module.exports = router;
