import User from "../models/User.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";

// Utility to generate JWT
const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "1d" });

// Utility to generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Registration (first-time user)
export const registerUser = async (req, res) => {
  try {
    const { email, password, fullName, phoneNumber } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { phoneNumber }] 
    });
    
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ message: "Email already registered" });
      }
      if (existingUser.phoneNumber === phoneNumber) {
        return res.status(400).json({ message: "Phone number already registered" });
      }
    }

    const user = await User.create({ email, password, fullName, phoneNumber });

    // Generate OTP
    const otp = generateOTP();
    // Here you would send OTP via Resend API (email)
    // For now, send in response for testing
    res.status(201).json({ 
      message: "User created successfully. Please verify your email with the OTP.", 
      userId: user._id, 
      otp // Remove in production
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: "Server error during registration" });
  }
};

// Verify OTP
export const verifyOTP = async (req, res) => {
  try {
    const { userId, otp } = req.body;
    
    // For MVP, assume OTP is correct (replace with DB stored OTP in real implementation)
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.verified = true;
    await user.save();
    
    res.json({ 
      message: "Email verified successfully",
      token: generateToken(user._id, user.role)
    });
  } catch (error) {
    res.status(500).json({ message: "Server error during OTP verification" });
  }
};

// Login
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });
    
    if (!user.verified) return res.status(400).json({ message: "Please verify your email before logging in" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    // Update last login
    await user.updateLastLogin();

    res.json({ 
      token: generateToken(user._id, user.role),
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        profileCompleted: user.profileCompleted
      }
    });
  } catch (error) {
    if (error.message === 'Account is temporarily locked due to too many failed attempts') {
      return res.status(423).json({ message: error.message });
    }
    res.status(500).json({ message: "Server error during login" });
  }
};

// Admin Login
export const adminLogin = async (req, res) => {
  try {
    const { email, password, adminSecret } = req.body;

    if (adminSecret !== process.env.ADMIN_SECRET_KEY)
      return res.status(403).json({ message: "Invalid admin secret" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    user.role = "admin";
    await user.save();
    await user.updateLastLogin();

    res.json({ 
      token: generateToken(user._id, user.role),
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error during admin login" });
  }
};

// Get User Profile
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      verified: user.verified,
      profileCompleted: user.profileCompleted,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    res.status(500).json({ message: "Server error while fetching profile" });
  }
};

// Update User Profile
export const updateUserProfile = async (req, res) => {
  try {
    const { fullName, phoneNumber } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check if phone number is being changed and if it's already taken
    if (phoneNumber && phoneNumber !== user.phoneNumber) {
      const existingPhone = await User.findOne({ phoneNumber });
      if (existingPhone) {
        return res.status(400).json({ message: "Phone number already registered" });
      }
    }

    const updateData = {};
    if (fullName) updateData.fullName = fullName;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      message: "Profile updated successfully",
      user: {
        id: updatedUser._id,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        phoneNumber: updatedUser.phoneNumber,
        role: updatedUser.role,
        profileCompleted: updatedUser.profileCompleted
      }
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: "Server error while updating profile" });
  }
};

// Change Password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ message: "Current password is incorrect" });

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: "Server error while changing password" });
  }
};

// Update Email (requires verification)
export const updateEmail = async (req, res) => {
  try {
    const { newEmail } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check if new email is already taken
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Generate verification token for new email
    const verificationToken = crypto.randomBytes(20).toString('hex');
    
    // In production, store this token and send verification email
    // For MVP, we'll simulate the verification
    
    user.email = newEmail;
    user.verified = false; // Require re-verification
    await user.save();

    // Generate OTP for testing
    const otp = generateOTP();
    
    res.json({ 
      message: "Email updated. Please verify your new email address.",
      otp, // Remove in production
      requiresVerification: true
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: "Server error while updating email" });
  }
};

// Verify Email Update
export const verifyEmailUpdate = async (req, res) => {
  try {
    const { userId, otp } = req.body;
    
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.verified = true;
    await user.save();
    
    res.json({ 
      message: "Email verified successfully",
      token: generateToken(user._id, user.role)
    });
  } catch (error) {
    res.status(500).json({ message: "Server error during email verification" });
  }
};

// Update User Role (Admin only)
export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['merchant', 'admin'].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.role = role;
    await user.save();

    res.json({ 
      message: "User role updated successfully",
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error while updating user role" });
  }
};