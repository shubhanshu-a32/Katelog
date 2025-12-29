const User = require("../models/User");

exports.getSellerProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "mobile role shopName ownerName address lat lng"
    );

    if (!user || user.role !== "seller") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    res.json(user);
  } catch (err) {
    console.error("getSellerProfile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateSellerProfile = async (req, res) => {
  try {
    const { shopName, ownerName, address, lat, lng } = req.body;

    const user = await User.findById(req.user._id);

    if (!user || user.role !== "seller") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    user.shopName = shopName ?? user.shopName;
    user.ownerName = ownerName ?? user.ownerName;
    user.address = address ?? user.address;
    user.lat = lat ?? user.lat;
    user.lng = lng ?? user.lng;

    await user.save();

    res.json(user);
  } catch (err) {
    console.error("updateSellerProfile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getPublicSellerProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const seller = await User.findOne({ _id: id, role: "seller" }).select(
      "shopName ownerName mobile address lat lng"
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
    const sellers = await User.find({ role: "seller" })
      .select("shopName ownerName _id address")
      .limit(10); // Limit to popular/recent 10 for now

    res.json(sellers);
  } catch (err) {
    console.error("getAllSellers error:", err);
    res.status(500).json({ message: "Server error" });
  }
};