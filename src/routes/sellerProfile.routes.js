const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/auth");
const { getSellerProfile, updateSellerProfile, getPublicSellerProfile, getAllSellers } = require("../controllers/sellerProfile.controller");

const upload = require("../middlewares/upload");

router.get("/", authenticate, getSellerProfile);
router.put("/", authenticate, upload.fields([
    { name: 'profilePicture', maxCount: 1 },
    { name: 'coverPhoto', maxCount: 1 }
]), updateSellerProfile);
router.get("/list", getAllSellers);
router.get("/:id", getPublicSellerProfile);

module.exports = router;