import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto"; // Added missing import

const { Schema } = mongoose;

// Helper function to validate full name
function validateFullName(name) {
  const parts = name.trim().split(" ");
  if (parts.length === 0) return false;
  for (const part of parts) {
    if (!/^[A-Za-z]+$/.test(part)) return false; // only letters
    if (!/^([A-Z][a-z]*|[a-z]+)$/.test(part)) return false; // strict capitalization
  }
  return true;
}

// Helper function to validate password strength
function validatePassword(password) {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  return password.length >= minLength && 
         hasUpperCase && 
         hasLowerCase && 
         hasNumbers && 
         hasSpecialChar;
}

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, "Invalid email format"],
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      validate: {
        validator: validatePassword,
        message: "Password must be at least 8 characters with uppercase, lowercase, number and special character"
      }
    },
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      validate: [validateFullName, "Full Name must be capitalized or all lowercase, letters only"],
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      match: [/^\+?\d{10,15}$/, "Invalid phone number format"],
      index: true,
    },
    role: {
      type: String,
      enum: ["merchant", "admin"],
      default: "merchant",
    },
    verified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    lastLogin: Date,
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: Date,
    businesses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Business",
      },
    ],
    profileCompleted: {
      type: Boolean,
      default: false,
    }
  },
  { 
    timestamps: true,
    toJSON: {
      transform: function(doc, ret) {
        delete ret.password;
        delete ret.emailVerificationToken;
        delete ret.emailVerificationExpires;
        return ret;
      }
    }
  }
);

// Virtual for checking if account is locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save hook to hash password
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save hook to update profileCompleted
userSchema.pre("save", function (next) {
  if (this.isModified('fullName') || this.isModified('phoneNumber')) {
    this.profileCompleted = !!(this.fullName && this.phoneNumber);
  }
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function (enteredPassword) {
  if (this.isLocked) {
    throw new Error('Account is temporarily locked due to too many failed attempts');
  }
  
  const isMatch = await bcrypt.compare(enteredPassword, this.password);
  
  if (isMatch) {
    // Reset failed attempts on successful login
    if (this.failedLoginAttempts > 0) {
      this.failedLoginAttempts = 0;
      this.lockUntil = undefined;
      await this.save();
    }
    return true;
  } else {
    // Increment failed attempts
    this.failedLoginAttempts += 1;
    
    // Lock account after 5 failed attempts for 30 minutes
    if (this.failedLoginAttempts >= 5) {
      this.lockUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
    }
    
    await this.save();
    return false;
  }
};

// Method to generate email verification token
userSchema.methods.generateEmailVerificationToken = function() {
  const token = crypto.randomBytes(20).toString('hex');
  this.emailVerificationToken = token;
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

// Method to update last login
userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save();
};

// Static method to find by verification token
userSchema.statics.findByVerificationToken = function(token) {
  return this.findOne({
    emailVerificationToken: token,
    emailVerificationExpires: { $gt: Date.now() }
  });
};

const User = mongoose.model("User", userSchema);
export default User;