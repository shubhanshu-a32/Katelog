const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
    email: { type: String, unique: true },
    password: { type: String, required: true },
    name: String,
    mobile: { type: String, default: "" },
    role: { type: String, default: "admin" }
}, { timestamps: true }
);

module.exports = mongoose.model("Admin", adminSchema);