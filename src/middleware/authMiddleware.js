import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  let token;
  
  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }
  
  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: "Access denied. No token provided." 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: "User not found. Token invalid." 
      });
    }
    
    if (!user.verified) {
      return res.status(401).json({ 
        success: false,
        message: "Please verify your email before accessing this resource." 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: "Invalid token." 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: "Token expired. Please login again." 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: "Server error during authentication." 
    });
  }
};

export const adminOnly = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ 
      success: false,
      message: "Access denied. Admin privileges required." 
    });
  }
  next();
};

export const merchantOnly = (req, res, next) => {
  if (req.user?.role !== "merchant") {
    return res.status(403).json({ 
      success: false,
      message: "Access denied. Merchant account required." 
    });
  }
  next();
};

// Optional: Middleware to check if profile is completed
export const profileCompleted = (req, res, next) => {
  if (!req.user?.profileCompleted) {
    return res.status(403).json({ 
      success: false,
      message: "Please complete your profile before accessing this resource." 
    });
  }
  next();
};