import mongoose from 'mongoose';

const { Schema } = mongoose;

const securityQuestionSchema = new Schema({
  question: {
    type: String,
    required: true
  },
  answer: {
    type: String,
    required: true
  }
});

const backupCodeSchema = new Schema({
  code: {
    type: String,
    required: true
  },
  used: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const userSecuritySchema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // This already creates an index
    // Removed index: true to avoid duplicate
  },
  // TOTP Settings
  totpSecret: {
    type: String,
    select: false // Don't return in queries by default
  },
  totpEnabled: {
    type: Boolean,
    default: false
  },
  totpVerified: {
    type: Boolean,
    default: false
  },
  
  // Security Questions
  securityQuestions: [securityQuestionSchema],
  securityQuestionsSet: {
    type: Boolean,
    default: false
  },
  
  // Backup Codes
  backupCodes: [backupCodeSchema],
  backupCodesEnabled: {
    type: Boolean,
    default: false
  },
  
  // Verification Method Preference
  preferredVerificationMethod: {
    type: String,
    enum: ['totp', 'security_questions', 'backup_codes'],
    default: 'totp'
  },
  
  // Security Settings
  lastVerificationAttempt: Date,
  failedVerificationAttempts: {
    type: Number,
    default: 0
  },
  verificationLockUntil: Date
}, {
  timestamps: true
});

// REMOVE THIS LINE to avoid duplicate index:
// userSecuritySchema.index({ userId: 1 });

// Virtual for checking if verification is locked
userSecuritySchema.virtual('isVerificationLocked').get(function() {
  return !!(this.verificationLockUntil && this.verificationLockUntil > Date.now());
});

// Method to check if user has setup any verification
userSecuritySchema.methods.hasVerificationSetup = function() {
  return this.totpEnabled || this.securityQuestionsSet || this.backupCodesEnabled;
};

// Method to get available verification methods
userSecuritySchema.methods.getAvailableMethods = function() {
  const methods = [];
  if (this.totpEnabled) methods.push('totp');
  if (this.securityQuestionsSet) methods.push('security_questions');
  if (this.backupCodesEnabled && this.backupCodes.some(code => !code.used)) {
    methods.push('backup_codes');
  }
  return methods;
};

const UserSecurity = mongoose.model('UserSecurity', userSecuritySchema);
export default UserSecurity;