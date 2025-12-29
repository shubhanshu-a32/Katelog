const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    price: { type: Number, required: true },
    stock: { type: Number, default: 0 },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "OUT_OF_STOCK", "DISABLED"],
    },
    images: [{ type: String }],
    rating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    sellerName: String,
  },
  { timestamps: true }
);

productSchema.index({ title: "text", description: "text" });

module.exports = mongoose.model("Product", productSchema);
