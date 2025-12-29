const User = require("../models/User");
const BuyerProfile = require("../models/BuyerProfile");

exports.getBuyerProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "mobile role fullName addresses"
    );

    if (!user || user.role !== "buyer") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const plain = user.toObject();

    // Fetch detailed profile
    const buyerProfile = await BuyerProfile.findOne({ userId: req.user._id });

    if (buyerProfile && buyerProfile.addresses && buyerProfile.addresses.length > 0) {
      const mainAddr = buyerProfile.addresses[0];
      plain.address = mainAddr.addressLine || "";
      plain.city = mainAddr.city || "";
      plain.state = mainAddr.state || "";
      plain.pincode = mainAddr.pincode || "";
    } else {
      // Fallback to legacy user address string
      plain.address = (plain.addresses && plain.addresses[0]) || "";
      plain.city = "";
      plain.state = "";
      plain.pincode = "";
    }

    res.json(plain);
  } catch (err) {
    console.error("getBuyerProfile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateBuyerProfile = async (req, res) => {
  try {
    const {
      fullName,
      address, // treating as addressLine
      newAddress, // for quick add (legacy support, maybe unused by new form)
      city,
      state,
      pincode,
    } = req.body;

    const user = await User.findById(req.user._id);

    if (!user || user.role !== "buyer") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Update User Common Fields
    if (fullName) user.fullName = fullName;

    // Construct string representation for legacy support
    // specific logic: if we are updating the main profile address
    if (address !== undefined) {
      const parts = [address];
      if (city) parts.push(city);
      if (state) parts.push(state);
      if (pincode) parts.push(`- ${pincode}`);

      const fullString = parts.join(", ");

      if (!Array.isArray(user.addresses)) user.addresses = [];
      if (user.addresses.length === 0) {
        user.addresses.push(fullString);
      } else {
        user.addresses[0] = fullString;
      }
    }

    if (newAddress) {
      // Legacy quick add
      if (!Array.isArray(user.addresses)) user.addresses = [];
      user.addresses.push(newAddress);
    }

    await user.save();

    // Sync with BuyerProfile
    let buyerProfile = await BuyerProfile.findOne({ userId: req.user._id });

    if (!buyerProfile) {
      buyerProfile = new BuyerProfile({ userId: req.user._id });
    }

    if (fullName) buyerProfile.fullName = fullName;

    if (address !== undefined) {
      const addressObj = {
        label: "Home",
        addressLine: address,
        city: city || "",
        state: state || "",
        pincode: pincode || "",
      };

      if (!buyerProfile.addresses) buyerProfile.addresses = [];

      if (buyerProfile.addresses.length > 0) {
        // Update first address
        buyerProfile.addresses[0] = { ...buyerProfile.addresses[0].toObject(), ...addressObj };
      } else {
        buyerProfile.addresses.push(addressObj);
      }
    }

    if (newAddress) {
      // Add as new entry
      buyerProfile.addresses.push({
        label: "Other",
        addressLine: newAddress,
        city: "", state: "", pincode: ""
      });
    }

    await buyerProfile.save();

    // Construct response similar to getBuyerProfile
    const plain = user.toObject();
    if (buyerProfile.addresses.length > 0) {
      const mainAddr = buyerProfile.addresses[0];
      plain.address = mainAddr.addressLine || "";
      plain.city = mainAddr.city || "";
      plain.state = mainAddr.state || "";
      plain.pincode = mainAddr.pincode || "";
    }

    res.json(plain);
  } catch (err) {
    console.error("updateBuyerProfile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};