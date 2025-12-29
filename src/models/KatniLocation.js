const mongoose = require("mongoose");

const katniLocationSchema = new mongoose.Schema({
    area: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    pincode: {
        type: Number,
        required: true
    },
    district: {
        type: String,
        default: "Katni"
    },
    state: {
        type: String,
        default: "Madhya Pradesh"
    }
}, { timestamps: true });

module.exports = mongoose.model("KatniLocation", katniLocationSchema);
