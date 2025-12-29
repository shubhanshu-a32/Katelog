const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/auth");
const { getSellerProfile, updateSellerProfile, getPublicSellerProfile, getAllSellers } = require("../controllers/sellerProfile.controller");

router.get("/", authenticate, getSellerProfile);
router.put("/", authenticate, updateSellerProfile);
router.get("/list", getAllSellers);
router.get("/:id", getPublicSellerProfile);

module.exports = router;