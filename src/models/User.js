import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const { Schema } = mongoose;

// Helper function to validate full name
function validateFullName(name) {
  const parts = name.trim().split(" ");
  if (parts.length === 0) return false;
  for (const part of parts) {
    if (!/^[A-Za-z]+$/.test(part)) return false;
    if (!/^([A-Z][a-z]*|[a-z]+)$/.test(part)) return false;
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
    
    // UPDATED: Business relationships
    businesses: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
    }],
    
    // NEW: Currently selected business for session
    currentBusiness: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
    },
    
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

// Virtual for business count
userSchema.virtual('businessCount').get(function() {
  return this.businesses ? this.businesses.length : 0;
});

// Virtual for active business
userSchema.virtual('activeBusiness').get(function() {
  return this.currentBusiness || (this.businesses && this.businesses[0]);
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

// Static Methods
userSchema.statics = {
  // Find user by email with business population
  findByEmail(email) {
    return this.findOne({ email })
      .populate('businesses', 'businessName mpesaShortCode businessType isActive')
      .populate('currentBusiness', 'businessName mpesaShortCode businessType')
      .exec();
  },

  // Find user by ID with business population
  findByIdWithBusinesses(userId) {
    return this.findById(userId)
      .populate('businesses', 'businessName mpesaShortCode businessType isActive')
      .populate('currentBusiness', 'businessName mpesaShortCode businessType')
      .exec();
  }
};

// Instance Methods
userSchema.methods = {
  // Compare password
  comparePassword: async function (enteredPassword) {
    if (this.isLocked) {
      throw new Error('Account is temporarily locked due to too many failed attempts');
    }
    
    const isMatch = await bcrypt.compare(enteredPassword, this.password);
    
    if (isMatch) {
      if (this.failedLoginAttempts > 0) {
        this.failedLoginAttempts = 0;
        this.lockUntil = undefined;
        await this.save();
      }
      return true;
    } else {
      this.failedLoginAttempts += 1;
      if (this.failedLoginAttempts >= 5) {
        this.lockUntil = Date.now() + 30 * 60 * 1000;
      }
      await this.save();
      return false;
    }
  },

  // Generate email verification token
  generateEmailVerificationToken: function() {
    const token = crypto.randomBytes(20).toString('hex');
    this.emailVerificationToken = token;
    this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    return token;
  },

  // Update last login
  updateLastLogin: function() {
    this.lastLogin = new Date();
    return this.save();
  },

  // Add business to user
  addBusiness: function(businessId) {
    if (!this.businesses.includes(businessId)) {
      this.businesses.push(businessId);
      // Set as current business if this is the first one
      if (!this.currentBusiness) {
        this.currentBusiness = businessId;
      }
    }
    return this.save();
  },

  // Set current business
  setCurrentBusiness: function(businessId) {
    if (this.businesses.includes(businessId)) {
      this.currentBusiness = businessId;
      return this.save();
    }
    throw new Error('Business not associated with this user');
  },

  // Get user summary
  getSummary: function() {
    return {
      id: this._id,
      email: this.email,
      fullName: this.fullName,
      phoneNumber: this.phoneNumber,
      role: this.role,
      verified: this.verified,
      profileCompleted: this.profileCompleted,
      businessCount: this.businessCount,
      currentBusiness: this.currentBusiness,
      lastLogin: this.lastLogin,
      createdAt: this.createdAt
    };
  },

  // Get user with business details
  getFullDetails: function() {
    return {
      ...this.getSummary(),
      businesses: this.businesses
    };
  }
};

// Add subscription relationship virtual
userSchema.virtual('subscriptions', {
  ref: 'Subscription',
  localField: '_id',
  foreignField: 'user'
});

// Add method to get user's subscriptions
userSchema.methods.getSubscriptions = function() {
  return this.populate({
    path: 'subscriptions',
    populate: [
      { path: 'business', select: 'businessName mpesaShortCode businessType' },
      { path: 'currentToken', populate: { path: 'plan' } }
    ]
  });
};

const User = mongoose.model("User", userSchema);
export default User;