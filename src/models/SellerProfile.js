const mongoose = require('mongoose');

const sellerProfileSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    shopName: { type: String, required: true },
    businessPhone: { type: String },
    address: { type: String },
    gstNumber: { type: String },
    categories: [{ type: String }],
    whatsappNumber: { type: String },
    pincode: { type: Number },
    area: { type: String },
    bankDetails: {
        accountName: { type: String },
        accountNumber: { type: String },
        bankName: { type: String },
        ifscCode: { type: String }
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SellerProfile', sellerProfileSchema);