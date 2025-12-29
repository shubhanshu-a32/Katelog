const Admin = require("../models/Admin");
const jwt = require("jsonwebtoken");
const bcrypt = require('bcryptjs');

exports.login = async (req, res) => {
    const { email, password } = req.body;

    // Check if any admin exists
    const adminCount = await Admin.countDocuments();
    let admin;

    if (adminCount === 0) {
        // First login: Auto-create admin with provided credentials
        const hashedPassword = await bcrypt.hash(password, 10);
        admin = await Admin.create({
            name: "Admin",
            email: email,
            password: hashedPassword,
            role: "admin"
        });
    } else {
        // Normal login
        admin = await Admin.findOne({ email });
        if (!admin) return res.status(400).json({ message: 'Invalid credentials' });

        const match = await bcrypt.compare(password, admin.password);
        if (!match) return res.status(400).json({ message: 'Invalid credentials' });
    }

    const accessToken = jwt.sign(
        { id: admin._id, role: 'admin' },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: '1d' }
    );
    const refreshToken = jwt.sign(
        { id: admin._id, role: 'admin' },
        process.env.REFRESH_TOKEN_SECRET || 'fallback_refresh_secret',
        { expiresIn: '7d' }
    );

    res.json({ accessToken, refreshToken, admin: { name: admin.name, email: admin.email, mobile: admin.mobile } });
};

exports.updateProfile = async (req, res) => {
    // Expects: { mobile, currentPassword, newPassword }
    // Only updates if currentPassword matches (for password change)
    // Mobile can be updated freely or requiring password? Usually free or simple.
    // Let's implement robust secure update.

    const { mobile, currentPassword, newPassword } = req.body;
    const adminId = req.user.id; // From middleware

    try {
        const admin = await Admin.findById(adminId);
        if (!admin) return res.status(404).json({ message: "Admin not found" });

        // Update basic info
        if (mobile !== undefined) admin.mobile = mobile;

        // Update password if provided
        if (newPassword && currentPassword) {
            const match = await bcrypt.compare(currentPassword, admin.password);
            if (!match) return res.status(400).json({ message: "Incorrect current password" });

            admin.password = await bcrypt.hash(newPassword, 10);
        } else if (newPassword) {
            return res.status(400).json({ message: "Current password required to set new password" });
        }

        await admin.save();
        res.json({ message: "Profile updated successfully", admin: { name: admin.name, email: admin.email, mobile: admin.mobile } });
    } catch (err) {
        res.status(500).json({ message: "Error updating profile", error: err.message });
    }
};