const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema({
    provider: {
        type: String,
        default: "KETALOG OFFER"
    },
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    tagline: {
        type: String,
        required: true
    },
    conditionType: {
        type: String, // e.g., "percentage", "flat"
        default: "flat"
    },
    conditionValue: {
        type: Number,
        required: true,
        min: 0
    },
    minCartAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    expiryDate: {
        type: Date,
        default: null
    },
    expiryDate: {
        type: Date,
        default: null
    },
    // usageLimitPerBuyer removed
    applicableCategories: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category"
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    usageHistory: [
        {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            originalAmount: Number,
            discountAmount: Number,
            finalAmount: Number,
            productContext: mongoose.Schema.Types.Mixed,
            appliedAt: { type: Date, default: Date.now }
        }
    ],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Offer", offerSchema);
