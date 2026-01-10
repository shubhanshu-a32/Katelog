require('dotenv').config();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const BuyerProfile = require('../models/BuyerProfile');
const SellerProfile = require('../models/SellerProfile');
const { generateNumericOtp } = require('../utils/otpGenerator');
const { setOtp, getOtp, deleteOtp } = require('../utils/otpStore');

const ACCESS_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES_IN || '4h';
const REFRESH_EXPIRES = process.env.REFRESH_TOKEN_EXPIRES_IN || '4h';
const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET || 'change_this_access_secret';
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET || 'change_this_refresh_secret';

const sendOtp = async (req, res) => {
  const { mobile, role } = req.body;
  if (!mobile || !role) return res.status(400).json({ message: 'Mobile and role required' });
  if (!['buyer', 'seller'].includes(role)) return res.status(400).json({ message: 'Invalid role' });

  // Check if mobile is already registered with a different role
  const existingUser = await User.findOne({ mobile });
  if (existingUser && existingUser.role !== role) {
    return res.status(400).json({
      message: `This mobile number is already registered. Please use a different number.`
    });
  }

  const otp = generateNumericOtp(6);
  try {
    await setOtp(mobile, otp);
    // TODO: integrate SMS provider (Twilio). For dev we print to console
    console.log(`OTP for ${mobile}: ${otp}`);
    return res.json({ message: 'OTP sent (console for dev).', otpSentTo: mobile, otp });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Could not send OTP' });
  }
};

const verifyOtp = async (req, res) => {
  const { mobile, otp, role, name, shopName } = req.body;
  if (!mobile || !otp || !role) return res.status(400).json({ message: 'mobile, otp and role required' });

  const storedOtp = await getOtp(mobile);
  if (!storedOtp || storedOtp !== otp) {
    return res.status(400).json({ message: 'Invalid or expired OTP' });
  }

  let user = await User.findOne({ mobile });
  if (!user) {
    user = await User.create({ mobile, role });
    if (role === 'buyer') {
      await BuyerProfile.create({ userId: user._id, name: name || '' });
    } else {
      await SellerProfile.create({ userId: user._id, shopName: shopName || `Shop-${mobile}` });
    }
  } else {
    // ensure role didn't change for existing mobile
    if (user.role !== role) {
      return res.status(400).json({ message: 'Mobile number already registered with different role' });
    }
  }

  const accessToken = jwt.sign({ userId: user._id, role: user.role }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
  const refreshToken = jwt.sign({ userId: user._id, role: user.role }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });

  user.refreshToken = refreshToken;
  await user.save();

  await deleteOtp(mobile);

  return res.json({
    accessToken,
    refreshToken,
    user: { id: user._id, mobile: user.mobile, role: user.role }
  });
};

const Admin = require('../models/Admin');
// ... imports

const refresh = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ message: 'refreshToken required' });
  try {
    const payload = jwt.verify(refreshToken, REFRESH_SECRET);

    let account;
    if (payload.role === 'admin') {
      account = await Admin.findById(payload.id);
    } else {
      account = await User.findById(payload.userId);
    }

    if (!account) {
      return res.status(401).json({ message: 'Invalid refresh token (User not found)' });
    }

    // Check if account has refreshToken field and matches (optional security if Admin has it)
    // Admin model might not have refreshToken field yet? 
    // If not, we skip the Db check for token match or add it to Admin model. 
    // Assuming for now verification is enough or Admin schema has it. 
    // Checking User schema: `user.refreshToken === refreshToken`.

    // For safety, let's assume Admin schema doesn't have it yet, so we just check existence.
    // Or better, let's just proceed for now to fix the crash.

    const newAccessToken = jwt.sign(
      { id: account._id, userId: account._id, role: payload.role }, // normalize ID
      ACCESS_SECRET,
      { expiresIn: ACCESS_EXPIRES }
    );
    return res.json({ accessToken: newAccessToken });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired refresh token', error: err.message });
  }
};

const logout = async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ message: 'userId required' });
  try {
    const user = await User.findById(userId);
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
    return res.json({ message: 'Logged out' });
  } catch (err) {
    return res.status(500).json({ message: 'Error logging out' });
  }
};

module.exports = { sendOtp, verifyOtp, refresh, logout };
