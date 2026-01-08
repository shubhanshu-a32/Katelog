const mongoose = require("mongoose");

const sellerAnalyticsSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            required: true,
        },
        platformCommission: {
            type: Number,
            required: true,
        },
        totalCommissionPercentage: {
            type: Number,
            default: 0
        },
        sellerEarning: {
            type: Number,
            required: true,
        },
        deliveryPartnerFee: {
            type: Number,
            required: true,
        },
        platformCommissionStatus: {
            type: String,
            enum: ['PENDING', 'COMPLETED'],
            default: 'PENDING'
        },
        deliveryPartnerFeeStatus: {
            type: String,
            enum: ['PENDING', 'COMPLETED'],
            default: 'PENDING'
        },
        sellerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("SellerAnalytics", sellerAnalyticsSchema);
