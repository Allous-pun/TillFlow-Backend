import User from '../models/User.js';
import UserSecurity from '../models/UserSecurity.js';
import { TOTPService } from '../services/totpService.js';
import { SecurityChallengeService } from '../services/securityChallengeService.js';
import { ChallengeUtils } from '../utils/challengeUtils.js';
import jwt from 'jsonwebtoken';

// Utility to generate JWT
const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "1d" });

// Registration - Step 1: Create user account
export const registerUser = async (req, res) => {
  try {
    const { email, password, fullName, phoneNumber } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { phoneNumber }] 
    });
    
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ 
          success: false,
          message: "Email already registered" 
        });
      }
      if (existingUser.phoneNumber === phoneNumber) {
        return res.status(400).json({ 
          success: false,
          message: "Phone number already registered" 
        });
      }
    }

    // Create user (not verified yet)
    const user = await User.create({ 
      email, 
      password, 
      fullName, 
      phoneNumber,
      verified: false // Will be set to true after verification
    });

    // Generate verification options for the user
    const verificationOptions = await generateVerificationOptions(user);

    res.status(201).json({ 
      success: true,
      message: "User created successfully. Please complete verification.", 
      userId: user._id,
      verificationOptions
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        message: messages.join(', ') 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: "Server error during registration" 
    });
  }
};

// Admin Registration - Creates admin account directly (bypasses verification)
export const registerAdmin = async (req, res) => {
  try {
    const { email, password, fullName, phoneNumber, adminSecret } = req.body;

    // Verify admin secret
    if (adminSecret !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ 
        success: false,
        message: "Invalid admin secret" 
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { phoneNumber }] 
    });
    
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ 
          success: false,
          message: "Email already registered" 
        });
      }
      if (existingUser.phoneNumber === phoneNumber) {
        return res.status(400).json({ 
          success: false,
          message: "Phone number already registered" 
        });
      }
    }

    // Create admin user (pre-verified, no TOTP required)
    const user = await User.create({ 
      email, 
      password, 
      fullName, 
      phoneNumber,
      role: 'admin',
      verified: true // Skip verification for admin
    });

    res.status(201).json({ 
      success: true,
      message: "Admin user created successfully", 
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        verified: user.verified
      },
      token: generateToken(user._id, user.role) // Auto-login after registration
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        message: messages.join(', ') 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: "Server error during admin registration" 
    });
  }
};

// Generate verification options for user
const generateVerificationOptions = async (user) => {
  const options = {
    methods: ['totp', 'security_questions'],
    totp: null,
    securityQuestions: null,
    mathChallenge: null
  };

  // Generate TOTP setup
  const totpSecret = TOTPService.generateSecret(user.email);
  const qrCodeDataURL = await TOTPService.generateQRCodeDataURL(totpSecret.otpauth_url);
  
  options.totp = {
    secret: totpSecret.base32,
    qrCode: qrCodeDataURL,
    manualEntryCode: totpSecret.base32
  };

  // Generate security questions options
  const securityQuestionTexts = SecurityChallengeService.generateSecurityQuestions();
  options.securityQuestions = securityQuestionTexts;

  // Generate math challenge
  options.mathChallenge = ChallengeUtils.generateMathChallenge();

  // Store initial security data - ONLY store TOTP secret initially
  // Don't store security questions until user provides answers
  await UserSecurity.create({
    userId: user._id,
    totpSecret: totpSecret.base32,
    securityQuestions: [] // Empty array initially - will be set during verification
  });

  return options;
};

// Verify with TOTP
export const verifyWithTOTP = async (req, res) => {
  try {
    const { userId, totpCode } = req.body;

    if (!userId || !totpCode) {
      return res.status(400).json({ 
        success: false,
        message: "User ID and TOTP code are required" 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    const userSecurity = await UserSecurity.findOne({ userId }).select('+totpSecret');
    if (!userSecurity || !userSecurity.totpSecret) {
      return res.status(400).json({ 
        success: false,
        message: "TOTP not setup for this user" 
      });
    }

    // Verify TOTP code
    const isValid = TOTPService.verifyToken(userSecurity.totpSecret, totpCode);
    if (!isValid) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid TOTP code" 
      });
    }

    // Mark TOTP as verified and enable it
    userSecurity.totpEnabled = true;
    userSecurity.totpVerified = true;
    userSecurity.preferredVerificationMethod = 'totp';
    await userSecurity.save();

    // Verify user account
    user.verified = true;
    await user.save();

    // Generate backup codes
    const backupCodes = TOTPService.generateBackupCodes(5);
    userSecurity.backupCodes = backupCodes;
    userSecurity.backupCodesEnabled = true;
    await userSecurity.save();

    res.json({ 
      success: true,
      message: "Account verified successfully with TOTP",
      token: generateToken(user._id, user.role),
      backupCodes: backupCodes.map(bc => ({ code: bc.code, used: bc.used })),
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        verified: user.verified
      }
    });
  } catch (error) {
    console.error('TOTP verification error:', error);
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Setup security questions
export const setupSecurityQuestions = async (req, res) => {
  try {
    const { userId, questionsWithAnswers } = req.body;

    if (!userId || !questionsWithAnswers) {
      return res.status(400).json({ 
        success: false,
        message: "User ID and security questions are required" 
      });
    }

    // Validate that all questions have answers
    const hasEmptyAnswers = questionsWithAnswers.some(q => !q.answer || q.answer.trim() === '');
    if (hasEmptyAnswers) {
      return res.status(400).json({ 
        success: false,
        message: "All security questions must have answers" 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    const userSecurity = await UserSecurity.findOne({ userId });
    if (!userSecurity) {
      return res.status(400).json({ 
        success: false,
        message: "Security setup not found for user" 
      });
    }

    // Update security questions with answers
    userSecurity.securityQuestions = questionsWithAnswers.map(q => ({
      question: q.question,
      answer: q.answer.trim() // Ensure answers are trimmed
    }));
    userSecurity.securityQuestionsSet = true;
    userSecurity.preferredVerificationMethod = 'security_questions';
    await userSecurity.save();

    // Verify user account
    user.verified = true;
    await user.save();

    res.json({ 
      success: true,
      message: "Security questions setup successfully",
      token: generateToken(user._id, user.role),
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        verified: user.verified
      }
    });
  } catch (error) {
    console.error('Security questions setup error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        message: messages.join(', ') 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Verify with security questions
export const verifyWithSecurityQuestions = async (req, res) => {
  try {
    const { userId, answers, mathChallengeAnswer } = req.body;

    if (!userId || !answers) {
      return res.status(400).json({ 
        success: false,
        message: "User ID and answers are required" 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    const userSecurity = await UserSecurity.findOne({ userId });
    if (!userSecurity || !userSecurity.securityQuestionsSet) {
      return res.status(400).json({ 
        success: false,
        message: "Security questions not setup for this user" 
      });
    }

    // Verify security questions answers
    const isValid = SecurityChallengeService.verifySecurityQuestions(
      userSecurity.securityQuestions, 
      answers
    );

    if (!isValid) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid security answers" 
      });
    }

    // Verify user account
    user.verified = true;
    await user.save();

    userSecurity.preferredVerificationMethod = 'security_questions';
    await userSecurity.save();

    res.json({ 
      success: true,
      message: "Account verified successfully with security questions",
      token: generateToken(user._id, user.role),
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        verified: user.verified
      }
    });
  } catch (error) {
    console.error('Security questions verification error:', error);
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Get verification status
export const getVerificationStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    const userSecurity = await UserSecurity.findOne({ userId });
    
    res.json({ 
      success: true,
      verified: user.verified,
      verificationMethods: userSecurity ? userSecurity.getAvailableMethods() : [],
      hasSecuritySetup: userSecurity ? userSecurity.hasVerificationSetup() : false
    });
  } catch (error) {
    console.error('Verification status error:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching verification status" 
    });
  }
};

// Get backup codes
export const getBackupCodes = async (req, res) => {
  try {
    const userSecurity = await UserSecurity.findOne({ userId: req.user.id });
    
    if (!userSecurity || !userSecurity.backupCodesEnabled) {
      return res.status(400).json({ 
        success: false,
        message: "Backup codes not available" 
      });
    }

    const unusedCodes = userSecurity.backupCodes
      .filter(code => !code.used)
      .map(code => ({ code: code.code, used: code.used }));

    res.json({ 
      success: true,
      backupCodes: unusedCodes
    });
  } catch (error) {
    console.error('Get backup codes error:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching backup codes" 
    });
  }
};

// Regenerate backup codes
export const regenerateBackupCodes = async (req, res) => {
  try {
    const userSecurity = await UserSecurity.findOne({ userId: req.user.id });
    
    if (!userSecurity) {
      return res.status(400).json({ 
        success: false,
        message: "Security setup not found" 
      });
    }

    const newBackupCodes = TOTPService.generateBackupCodes(5);
    userSecurity.backupCodes = newBackupCodes;
    await userSecurity.save();

    res.json({ 
      success: true,
      message: "Backup codes regenerated successfully",
      backupCodes: newBackupCodes.map(bc => ({ code: bc.code, used: bc.used }))
    });
  } catch (error) {
    console.error('Regenerate backup codes error:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error while regenerating backup codes" 
    });
  }
};