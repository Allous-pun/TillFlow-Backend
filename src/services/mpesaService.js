import axios from "axios";
import Business from "../models/Business.js";

class MpesaService {
  constructor() {
    this.baseURL = process.env.MPESA_ENVIRONMENT === 'production' 
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
    
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  // NEW: Get business credentials from database
  async getBusinessCredentials(businessId, merchantId = null) {
    try {
      // Build query - if merchantId is provided, verify ownership
      const query = { _id: businessId, isActive: true };
      if (merchantId) {
        query.owner = merchantId;
      }

      const business = await Business.findOne(query).select(
        'businessName mpesaShortCode mpesaConsumerKey mpesaConsumerSecret mpesaPassKey businessType isActive'
      );

      if (!business) {
        return {
          success: false,
          message: "Business not found or you don't have permission to access it"
        };
      }

      // Validate that all required credentials are present
      const requiredFields = ['mpesaShortCode', 'mpesaConsumerKey', 'mpesaConsumerSecret', 'mpesaPassKey'];
      const missingFields = requiredFields.filter(field => !business[field]);

      if (missingFields.length > 0) {
        return {
          success: false,
          message: `Business missing required M-Pesa credentials: ${missingFields.join(', ')}`
        };
      }

      return {
        success: true,
        businessName: business.businessName,
        shortCode: business.mpesaShortCode,
        consumerKey: business.mpesaConsumerKey,
        consumerSecret: business.mpesaConsumerSecret,
        passKey: business.mpesaPassKey,
        businessType: business.businessType
      };

    } catch (error) {
      console.error('Get business credentials error:', error);
      return {
        success: false,
        message: "Error retrieving business credentials",
        error: error.message
      };
    }
  }

  // Generate access token for Daraja API
  async generateAccessToken(consumerKey = null, consumerSecret = null) {
    try {
      // Use provided credentials or fall back to environment variables
      const credKey = consumerKey || process.env.MPESA_CONSUMER_KEY;
      const credSecret = consumerSecret || process.env.MPESA_CONSUMER_SECRET;

      // Check if token is still valid (only for default credentials)
      if (!consumerKey && !consumerSecret && this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }

      console.log('🔑 Generating new access token...');
      
      const credentials = Buffer.from(`${credKey}:${credSecret}`).toString('base64');
      
      const response = await axios.get(`${this.baseURL}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      // Only cache token if using default credentials
      if (!consumerKey && !consumerSecret) {
        this.accessToken = response.data.access_token;
        this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 minute buffer
      }

      console.log('✅ Access token generated successfully');
      return response.data.access_token;

    } catch (error) {
      console.error('❌ Failed to generate access token:', error.response?.data || error.message);
      throw new Error(`Token generation failed: ${error.response?.data?.error_message || error.message}`);
    }
  }

  // Generate Lipa Na M-Pesa password
  generateLNMPassword(shortCode = null, passKey = null) {
    const timestamp = this.getCurrentTimestamp();
    const businessShortCode = shortCode || process.env.MPESA_SHORTCODE;
    const businessPassKey = passKey || process.env.MPESA_PASSKEY;
    const password = Buffer.from(`${businessShortCode}${businessPassKey}${timestamp}`).toString('base64');
    return { password, timestamp };
  }

  // Get current timestamp in YYYYMMDDHHMMSS format
  getCurrentTimestamp() {
    const now = new Date();
    return now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
  }

  // Initiate STK Push (Lipa Na M-Pesa) - UPDATED to support business credentials
  async initiateSTKPush(paymentData) {
    try {
      const {
        phoneNumber,
        amount,
        accountReference,
        transactionDesc = 'Payment',
        // NEW: Business-specific credentials (optional)
        businessShortCode = null,
        consumerKey = null,
        consumerSecret = null,
        passKey = null
      } = paymentData;

      // Validate input
      if (!phoneNumber || !amount || !accountReference) {
        throw new Error('phoneNumber, amount, and accountReference are required');
      }

      // Use business credentials if provided, otherwise use environment variables
      const shortCode = businessShortCode || process.env.MPESA_SHORTCODE;
      const token = await this.generateAccessToken(consumerKey, consumerSecret);
      const { password, timestamp } = this.generateLNMPassword(shortCode, passKey);

      // Format phone number to 254 format
      const formattedPhone = phoneNumber.startsWith('254') ? phoneNumber : 
                            phoneNumber.startsWith('0') ? `254${phoneNumber.substring(1)}` : 
                            `254${phoneNumber}`;

      const payload = {
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.floor(amount),
        PartyA: formattedPhone,
        PartyB: shortCode,
        PhoneNumber: formattedPhone,
        CallBackURL: `${process.env.MPESA_CALLBACK_BASE_URL}/api/webhook/stk-callback`,
        AccountReference: accountReference.substring(0, 12),
        TransactionDesc: transactionDesc.substring(0, 13)
      };

      console.log('📱 Initiating STK Push:', {
        phone: formattedPhone,
        amount,
        reference: accountReference,
        shortCode: shortCode,
        usingBusinessCredentials: !!businessShortCode
      });

      const response = await axios.post(
        `${this.baseURL}/mpesa/stkpush/v1/processrequest`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      console.log('✅ STK Push initiated successfully');

      return {
        success: true,
        checkoutRequestId: response.data.CheckoutRequestID,
        customerMessage: response.data.CustomerMessage,
        responseCode: response.data.ResponseCode,
        merchantRequestId: response.data.MerchantRequestID
      };

    } catch (error) {
      console.error('❌ STK Push failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.errorMessage || error.message,
        errorCode: error.response?.data?.errorCode || 'UNKNOWN_ERROR'
      };
    }
  }

  // Check STK Push transaction status - UPDATED to support business credentials
  async checkSTKTransactionStatus(checkoutRequestId, businessCredentials = null) {
    try {
      let token;
      let shortCode;
      let passKey;

      if (businessCredentials) {
        // Use business credentials
        token = await this.generateAccessToken(businessCredentials.consumerKey, businessCredentials.consumerSecret);
        shortCode = businessCredentials.shortCode;
        passKey = businessCredentials.passKey;
      } else {
        // Use default credentials
        token = await this.generateAccessToken();
        shortCode = process.env.MPESA_SHORTCODE;
        passKey = process.env.MPESA_PASSKEY;
      }

      const { password, timestamp } = this.generateLNMPassword(shortCode, passKey);

      const payload = {
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId
      };

      console.log('🔍 Checking STK transaction status:', {
        checkoutRequestId,
        usingBusinessCredentials: !!businessCredentials
      });

      const response = await axios.post(
        `${this.baseURL}/mpesa/stkpushquery/v1/query`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const result = response.data;
      
      return {
        success: true,
        resultCode: result.ResultCode,
        resultDesc: result.ResultDesc,
        checkoutRequestId: result.CheckoutRequestID,
        merchantRequestId: result.MerchantRequestID
      };

    } catch (error) {
      console.error('❌ STK Query failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errorMessage || error.message
      };
    }
  }

  // Register C2B validation and confirmation URLs - UPDATED to support business credentials
  async registerC2BUrls(businessCredentials = null) {
    try {
      let token;
      let shortCode;

      if (businessCredentials) {
        // Use business credentials
        token = await this.generateAccessToken(businessCredentials.consumerKey, businessCredentials.consumerSecret);
        shortCode = businessCredentials.shortCode;
      } else {
        // Use default credentials
        token = await this.generateAccessToken();
        shortCode = process.env.MPESA_SHORTCODE;
      }

      const payload = {
        ShortCode: shortCode,
        ResponseType: 'Completed',
        ConfirmationURL: `${process.env.MPESA_CALLBACK_BASE_URL}/api/webhook/confirmation`,
        ValidationURL: `${process.env.MPESA_CALLBACK_BASE_URL}/api/webhook/validation`
      };

      console.log('🌐 Registering C2B URLs:', {
        shortCode,
        usingBusinessCredentials: !!businessCredentials
      });

      const response = await axios.post(
        `${this.baseURL}/mpesa/c2b/v1/registerurl`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      console.log('✅ C2B URLs registered successfully');

      return {
        success: true,
        conversationId: response.data.ConversationID,
        responseDescription: response.data.ResponseDescription
      };

    } catch (error) {
      console.error('❌ C2B URL registration failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errorMessage || error.message
      };
    }
  }

  // Health check for M-Pesa service
  async healthCheck() {
    try {
      const token = await this.generateAccessToken();
      
      return {
        status: 'healthy',
        environment: process.env.MPESA_ENVIRONMENT || 'sandbox',
        tokenValid: !!token,
        shortCode: process.env.MPESA_SHORTCODE,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
const mpesaService = new MpesaService();
export default mpesaService;