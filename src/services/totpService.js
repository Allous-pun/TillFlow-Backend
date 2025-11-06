import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export class TOTPService {
  // Generate a TOTP secret for a user
  static generateSecret(userEmail) {
    return speakeasy.generateSecret({
      name: `TillFlow (${userEmail})`,
      issuer: 'TillFlow'
    });
  }

  // Generate QR code URL for authenticator app
  static async generateQRCodeDataURL(otpauthUrl) {
    try {
      return await QRCode.toDataURL(otpauthUrl);
    } catch (error) {
      console.error('QR code generation failed:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  // Verify TOTP token
  static verifyToken(secret, token) {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 1, // Allow 30-second clock drift
      step: 30   // 30-second steps
    });
  }

  // Generate a time-based token (for testing)
  static generateToken(secret) {
    return speakeasy.totp({
      secret: secret,
      encoding: 'base32',
      step: 30
    });
  }

  // Generate backup codes (8-digit)
  static generateBackupCodes(count = 5) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      codes.push({
        code: Math.floor(10000000 + Math.random() * 90000000).toString(),
        used: false
      });
    }
    return codes;
  }

  // Verify backup code
  static verifyBackupCode(backupCodes, enteredCode) {
    const codeIndex = backupCodes.findIndex(
      bc => bc.code === enteredCode && !bc.used
    );
    
    if (codeIndex !== -1) {
      backupCodes[codeIndex].used = true;
      return true;
    }
    return false;
  }
}