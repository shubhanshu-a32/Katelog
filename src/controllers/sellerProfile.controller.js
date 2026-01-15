const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");

exports.getSellerProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "mobile role shopName ownerName address lat lng profilePicture coverPhoto"
    );

    if (!user || user.role !== "seller") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Fetch additional details from SellerProfile model
    const sellerProfile = await SellerProfile.findOne({ userId: req.user._id });

    // Merge data
    const responseData = {
      ...user.toObject(),
      pincode: sellerProfile?.pincode,
      area: sellerProfile?.area,
      gstNumber: sellerProfile?.gstNumber,
      bankDetails: sellerProfile?.bankDetails
    };

    res.json(responseData);
  } catch (err) {
    console.error("getSellerProfile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateSellerProfile = async (req, res) => {
  try {
    console.log("updateSellerProfile: START");
    const { shopName, ownerName, address, lat, lng, pincode, area, gstNumber, bankDetails } = req.body;
    console.log("updateSellerProfile: Body:", req.body);
    console.log("updateSellerProfile: Files:", req.files);

    const user = await User.findById(req.user._id);

    if (!user || user.role !== "seller") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Update User model (essential fields)
    user.shopName = shopName ?? user.shopName;
    user.ownerName = ownerName ?? user.ownerName;
    user.address = address ?? user.address;
    user.lat = lat ?? user.lat;
    user.lng = lng ?? user.lng;

    // Handle File Uploads (Fields)
    if (req.files) {
      if (req.files['profilePicture'] && req.files['profilePicture'][0]) {
        user.profilePicture = req.files['profilePicture'][0].path;
      }
      if (req.files['coverPhoto'] && req.files['coverPhoto'][0]) {
        user.coverPhoto = req.files['coverPhoto'][0].path;
      }
    }

    console.log("updateSellerProfile: Saving user...");
    await user.save();
    console.log("updateSellerProfile: User saved.");

    // Sync with SellerProfile model (for filtering)
    // Upsert logic
    await SellerProfile.findOneAndUpdate(
      { userId: req.user._id },
      {
        userId: req.user._id,
        shopName: user.shopName,
        businessPhone: user.mobile,
        address: user.address,
        pincode: pincode ? Number(pincode) : undefined, // Ensure number
        area: area,
        gstNumber: gstNumber,
        bankDetails: bankDetails
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Fetch updated merged profile to return
    const updatedProfile = await SellerProfile.findOne({ userId: req.user._id });

    res.json({
      ...user.toObject(),
      pincode: updatedProfile?.pincode,
      area: updatedProfile?.area,
      gstNumber: updatedProfile?.gstNumber,
      bankDetails: updatedProfile?.bankDetails
    });
  } catch (err) {
    console.error("updateSellerProfile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getPublicSellerProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const seller = await User.findOne({ _id: id, role: "seller" }).select(
      "shopName ownerName mobile address lat lng profilePicture coverPhoto"
    );

    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    res.json(seller);
  } catch (err) {
    console.error("getPublicSellerProfile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAllSellers = async (req, res) => {
  try {
    const { pincode } = req.query;
    let filter = { role: "seller" };

    if (pincode) {
      // Find seller profiles with this pincode
      const profiles = await SellerProfile.find({ pincode: Number(pincode) }).select("userId");
      const userIds = profiles.map(p => p.userId);

      // If no sellers found in this pincode, return empty
      if (userIds.length === 0) {
        return res.json([]);
      }

      filter._id = { $in: userIds };
    }

    const sellers = await User.find(filter)
      .select("shopName ownerName _id address profilePicture coverPhoto")
      .limit(10); // Limit to popular/recent 10 for now

    res.json(sellers);
  } catch (err) {
    console.error("getAllSellers error:", err);
    res.status(500).json({ message: "Server error" });
  }
};