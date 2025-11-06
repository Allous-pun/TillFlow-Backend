// Utility functions for M-Pesa operations and validation

export class MpesaUtils {
  // Validate M-Pesa webhook origin and data integrity
  static validateMpesaWebhook(req, res, next) {
    try {
      // Check if request has basic M-Pesa structure
      const requiredFields = ['TransID', 'TransAmount', 'MSISDN', 'BusinessShortCode'];
      const hasRequiredFields = requiredFields.every(field => req.body[field]);
      
      if (!hasRequiredFields) {
        console.warn('🚨 Webhook missing required fields');
        return res.json({
          ResultCode: 1,
          ResultDesc: "Rejected - Invalid webhook data"
        });
      }

      // Validate amount format
      const amount = parseFloat(req.body.TransAmount);
      if (isNaN(amount) || amount <= 0 || amount > 150000) {
        console.warn('🚨 Invalid transaction amount');
        return res.json({
          ResultCode: 1,
          ResultDesc: "Rejected - Invalid amount"
        });
      }

      // Validate phone number format
      const phoneNumber = req.body.MSISDN;
      if (!this.isValidMpesaPhoneNumber(phoneNumber)) {
        console.warn('🚨 Invalid phone number format');
        return res.json({
          ResultCode: 1,
          ResultDesc: "Rejected - Invalid phone number"
        });
      }

      console.log('✅ Webhook validation passed');
      next();

    } catch (error) {
      console.error('❌ Webhook validation error:', error);
      return res.json({
        ResultCode: 1,
        ResultDesc: "Rejected - Validation error"
      });
    }
  }

  // Validate M-Pesa phone number format
  static isValidMpesaPhoneNumber(phoneNumber) {
    // M-Pesa numbers should be in 254XXXXXXXXX format
    const phoneRegex = /^254(1|7)\d{8}$/;
    return phoneRegex.test(phoneNumber);
  }

  // Format phone number to M-Pesa format (254XXXXXXXXX)
  static formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;

    // Remove any non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');

    // Convert to 254 format
    if (cleaned.startsWith('0')) {
      return `254${cleaned.substring(1)}`;
    } else if (cleaned.startsWith('+254')) {
      return cleaned.substring(1);
    } else if (cleaned.startsWith('254')) {
      return cleaned;
    } else if (cleaned.length === 9) {
      return `254${cleaned}`;
    }

    return null;
  }

  // Parse M-Pesa timestamp (YYYYMMDDHHMMSS) to Date object
  static parseMpesaTimestamp(timestamp) {
    if (!timestamp || timestamp.length !== 14) {
      return new Date();
    }

    try {
      const year = timestamp.substring(0, 4);
      const month = timestamp.substring(4, 6);
      const day = timestamp.substring(6, 8);
      const hour = timestamp.substring(8, 10);
      const minute = timestamp.substring(10, 12);
      const second = timestamp.substring(12, 14);
      
      return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    } catch (error) {
      console.error('Error parsing M-Pesa timestamp:', error);
      return new Date();
    }
  }

  // Generate unique transaction reference
  static generateTransactionReference(prefix = 'TXN') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 8);
    return `${prefix}-${timestamp}-${random}`.toUpperCase();
  }

  // Format currency for display
  static formatCurrency(amount, currency = 'KES') {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  }

  // Calculate transaction fee based on amount (M-Pesa rates)
  static calculateTransactionFee(amount) {
    // M-Pesa transaction fees (approximate rates)
    const fees = [
      { min: 1, max: 49, fee: 0 },
      { min: 50, max: 100, fee: 0 },
      { min: 101, max: 500, fee: 6 },
      { min: 501, max: 1000, fee: 12 },
      { min: 1001, max: 1500, fee: 22 },
      { min: 1501, max: 2500, fee: 32 },
      { min: 2501, max: 3500, fee: 51 },
      { min: 3501, max: 5000, fee: 55 },
      { min: 5001, max: 7500, fee: 75 },
      { min: 7501, max: 10000, fee: 85 },
      { min: 10001, max: 15000, fee: 95 },
      { min: 15001, max: 20000, fee: 100 },
      { min: 20001, max: 35000, fee: 110 },
      { min: 35001, max: 50000, fee: 165 },
      { min: 50001, max: 150000, fee: 330 }
    ];

    const feeStructure = fees.find(f => amount >= f.min && amount <= f.max);
    return feeStructure ? feeStructure.fee : 0;
  }

  // Validate STK Push parameters
  static validateSTKParameters(phoneNumber, amount, accountReference) {
    const errors = [];

    // Phone number validation
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    if (!formattedPhone || !this.isValidMpesaPhoneNumber(formattedPhone)) {
      errors.push('Invalid phone number format. Use 07XXXXXXXX or 2547XXXXXXXX');
    }

    // Amount validation
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 1 || amountNum > 150000) {
      errors.push('Amount must be between KES 1 and KES 150,000');
    }

    // Account reference validation
    if (!accountReference || accountReference.trim().length === 0) {
      errors.push('Account reference is required');
    } else if (accountReference.length > 12) {
      errors.push('Account reference must be 12 characters or less');
    }

    return {
      isValid: errors.length === 0,
      errors,
      formattedPhone: formattedPhone,
      amount: amountNum
    };
  }

  // Parse M-Pesa error codes to user-friendly messages
  static parseErrorCode(errorCode) {
    const errorMap = {
      '0': 'Success',
      '1': 'Insufficient funds',
      '2': 'Less than minimum transaction value',
      '3': 'More than maximum transaction value',
      '4': 'Would exceed daily transfer limit',
      '5': 'Would exceed minimum balance',
      '6': 'Unresolved primary party',
      '7': 'Unresolved receiver party',
      '8': 'Would exceed maximum balance',
      '11': 'Debit account invalid',
      '12': 'Credit account invalid',
      '13': 'Unresolved debit account',
      '14': 'Unresolved credit account',
      '15': 'Duplicate transaction',
      '17': 'Internal failure',
      '20': 'Unresolved reject reason',
      '26': 'Transaction cancelled by user',
      '1032': 'Transaction cancelled by user',
      '1037': 'Transaction timed out',
      '2001': 'Transaction in progress'
    };

    return errorMap[errorCode] || `Unknown error (Code: ${errorCode})`;
  }

  // Sanitize transaction data for logging (remove sensitive info)
  static sanitizeForLogging(transactionData) {
    const sanitized = { ...transactionData };
    
    // Remove sensitive fields
    delete sanitized.rawMpesaResponse;
    
    // Mask phone number for logging
    if (sanitized.customer?.phoneNumber) {
      const phone = sanitized.customer.phoneNumber;
      sanitized.customer.phoneNumber = `${phone.substring(0, 6)}***${phone.substring(9)}`;
    }

    return sanitized;
  }

  // Calculate transaction statistics
  static calculateTransactionStats(transactions) {
    if (!transactions || transactions.length === 0) {
      return {
        totalTransactions: 0,
        totalAmount: 0,
        averageAmount: 0,
        highestAmount: 0,
        lowestAmount: 0
      };
    }

    const amounts = transactions.map(t => t.amount);
    const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0);

    return {
      totalTransactions: transactions.length,
      totalAmount,
      averageAmount: totalAmount / transactions.length,
      highestAmount: Math.max(...amounts),
      lowestAmount: Math.min(...amounts),
      totalFees: transactions.reduce((sum, t) => sum + this.calculateTransactionFee(t.amount), 0)
    };
  }

  // Generate test transaction data for development
  static generateTestTransaction() {
    const testPhones = [
      '254712345678',
      '254723456789',
      '254734567890',
      '254745678901',
      '254756789012'
    ];

    const testReferences = [
      'ORDER-001',
      'INV-2024-001',
      'SALE-001',
      'PAYMENT-001',
      'DEPOSIT-001'
    ];

    return {
      TransID: `TEST${Date.now()}${Math.random().toString(36).substr(2, 5)}`.toUpperCase(),
      TransTime: this.getCurrentTimestamp(),
      TransAmount: (Math.random() * 1000 + 10).toFixed(2),
      BusinessShortCode: process.env.MPESA_SHORTCODE || '174379',
      BillRefNumber: testReferences[Math.floor(Math.random() * testReferences.length)],
      MSISDN: testPhones[Math.floor(Math.random() * testPhones.length)],
      FirstName: 'Test',
      LastName: 'User',
      OrgAccountBalance: '45000.00'
    };
  }

  // Get current timestamp in YYYYMMDDHHMMSS format
  static getCurrentTimestamp() {
    const now = new Date();
    return now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
  }
}