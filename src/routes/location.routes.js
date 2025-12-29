const router = require("express").Router();
const locationCtrl = require("../controllers/location.controller");
const adminAuth = require("../middlewares/adminAuth"); // Assuming we protect write ops

router.get("/", locationCtrl.getLocations);
router.post("/", adminAuth, locationCtrl.addLocation);
router.delete("/:id", adminAuth, locationCtrl.deleteLocation);

module.exports = router;