const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      required: true,
      unique: true
    },
    role: {
      type: String,
      enum: ["buyer", "seller", "delivery_partner"],
      required: true
    },
    // FOR SELLER
    shopName: {
      type: String,
      default: "",
    },
    ownerName: {
      type: String,
      default: ""
    },
    profilePicture: {
      type: String,
      default: ""
    },
    // SELLER LOCATION
    address: {
      type: String,
      default: "",
    },
    lat: {
      type: Number,
      default: null,
    },
    lng: {
      type: Number,
      default: null,
    },

    // FOR BUYER
    fullName: {
      type: String,
      default: ""
    },

    // FOR EVERYONE (SELLER, BUYER)
    addresses: [
      {
        type: String,
      },
    ],
    refreshToken: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
