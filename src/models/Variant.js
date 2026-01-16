const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    attributes: [
        {
            name: { type: String, required: true }, // e.g. "Size", "Color"
            value: { type: String, required: true } // e.g. "Small", "Red"
        }
    ],
    price: { type: Number, required: true },
    stock: { type: Number, required: true, default: 0 },
    images: [{ type: String }],
    sku: { type: String },
    isActive: { type: Boolean, default: true },
    name: { type: String } // e.g. "Small / Red" - Added for easier display
}, { timestamps: true });

module.exports = mongoose.model("Variant", variantSchema);
