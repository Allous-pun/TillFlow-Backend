import User from "../models/User.js";
import UserSecurity from "../models/UserSecurity.js"; // ADDED THIS IMPORT
import jwt from "jsonwebtoken";

// Utility to generate JWT
const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "1d" });

// Login (no OTP required after initial verification)
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid credentials" 
      });
    }
    
    if (!user.verified) {
      return res.status(400).json({ 
        success: false,
        message: "Please complete account verification before logging in" 
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid credentials" 
      });
    }

    // Update last login
    await user.updateLastLogin();

    res.json({ 
      success: true,
      token: generateToken(user._id, user.role),
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        profileCompleted: user.profileCompleted,
        verified: user.verified
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    if (error.message === 'Account is temporarily locked due to too many failed attempts') {
      return res.status(423).json({ 
        success: false,
        message: error.message 
      });
    }
    res.status(500).json({ 
      success: false,
      message: "Server error during login" 
    });
  }
};

// Admin Login
export const adminLogin = async (req, res) => {
  try {
    const { email, password, adminSecret } = req.body;

    if (adminSecret !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ 
        success: false,
        message: "Invalid admin secret" 
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid credentials" 
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid credentials" 
      });
    }

    user.role = "admin";
    await user.save();
    await user.updateLastLogin();

    res.json({ 
      success: true,
      token: generateToken(user._id, user.role),
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error during admin login" 
    });
  }
};

// Get User Profile
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    res.json({
      success: true,
      user: {
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
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching profile" 
    });
  }
};

// Update User Profile
export const updateUserProfile = async (req, res) => {
  try {
    const { fullName, phoneNumber } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    // Check if phone number is being changed and if it's already taken
    if (phoneNumber && phoneNumber !== user.phoneNumber) {
      const existingPhone = await User.findOne({ phoneNumber });
      if (existingPhone) {
        return res.status(400).json({ 
          success: false,
          message: "Phone number already registered" 
        });
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
      success: true,
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
    console.error('Update profile error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        message: messages.join(', ') 
      });
    }
    res.status(500).json({ 
      success: false,
      message: "Server error while updating profile" 
    });
  }
};

// Change Password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false,
        message: "Current password is incorrect" 
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({ 
      success: true,
      message: "Password updated successfully" 
    });
  } catch (error) {
    console.error('Change password error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        message: messages.join(', ') 
      });
    }
    res.status(500).json({ 
      success: false,
      message: "Server error while changing password" 
    });
  }
};

// Update User Role (Admin only)
export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['merchant', 'admin'].includes(role)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid role" 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    user.role = role;
    await user.save();

    res.json({ 
      success: true,
      message: "User role updated successfully",
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error while updating user role" 
    });
  }
};

// Get all users (Admin only)
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -emailVerificationToken -emailVerificationExpires')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching users" 
    });
  }
};

// Get user by ID (Admin only)
export const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select('-password -emailVerificationToken -emailVerificationExpires');

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching user" 
    });
  }
};

// Delete user (Admin only)
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ 
        success: false,
        message: "Cannot delete your own account" 
      });
    }

    await User.findByIdAndDelete(userId);
    
    // Also delete associated UserSecurity record
    await UserSecurity.findOneAndDelete({ userId });

    res.json({ 
      success: true,
      message: "User deleted successfully" 
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error while deleting user" 
    });
  }
};

// Get users statistics (Admin only)
export const getUserStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ verified: true });
    const adminUsers = await User.countDocuments({ role: 'admin' });
    const merchantUsers = await User.countDocuments({ role: 'merchant' });
    
    // Users created in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentUsers = await User.countDocuments({ 
      createdAt: { $gte: sevenDaysAgo } 
    });

    res.json({
      success: true,
      stats: {
        totalUsers,
        verifiedUsers,
        adminUsers,
        merchantUsers,
        recentUsers,
        unverifiedUsers: totalUsers - verifiedUsers
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching user statistics" 
    });
  }
};