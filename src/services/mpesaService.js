import axios from "axios";

class MpesaService {
  constructor() {
    this.baseURL = process.env.MPESA_ENVIRONMENT === 'production' 
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
    
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  // Generate access token for Daraja API
  async generateAccessToken() {
    try {
      // Check if token is still valid
      if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }

      console.log('🔑 Generating new access token...');
      
      const credentials = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
      
      const response = await axios.get(`${this.baseURL}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 minute buffer

      console.log('✅ Access token generated successfully');
      return this.accessToken;

    } catch (error) {
      console.error('❌ Failed to generate access token:', error.response?.data || error.message);
      throw new Error(`Token generation failed: ${error.response?.data?.error_message || error.message}`);
    }
  }

  // Generate Lipa Na M-Pesa password
  generateLNMPassword() {
    const timestamp = this.getCurrentTimestamp();
    const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');
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

  // Initiate STK Push (Lipa Na M-Pesa)
  async initiateSTKPush(paymentData) {
    try {
      const token = await this.generateAccessToken();
      const { password, timestamp } = this.generateLNMPassword();

      const {
        phoneNumber,
        amount,
        accountReference,
        transactionDesc = 'Payment'
      } = paymentData;

      // Validate input
      if (!phoneNumber || !amount || !accountReference) {
        throw new Error('phoneNumber, amount, and accountReference are required');
      }

      // Format phone number to 254 format
      const formattedPhone = phoneNumber.startsWith('254') ? phoneNumber : 
                            phoneNumber.startsWith('0') ? `254${phoneNumber.substring(1)}` : 
                            `254${phoneNumber}`;

      const payload = {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.floor(amount),
        PartyA: formattedPhone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: formattedPhone,
        // CHANGED: Remove "mpesa" from STK callback URL too
        CallBackURL: `${process.env.MPESA_CALLBACK_BASE_URL}/api/webhook/stk-callback`,
        AccountReference: accountReference.substring(0, 12),
        TransactionDesc: transactionDesc.substring(0, 13)
      };

      console.log('📱 Initiating STK Push:', {
        phone: formattedPhone,
        amount,
        reference: accountReference
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
        responseCode: response.data.ResponseCode
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

  // Check STK Push transaction status
  async checkSTKTransactionStatus(checkoutRequestId) {
    try {
      const token = await this.generateAccessToken();
      const { password, timestamp } = this.generateLNMPassword();

      const payload = {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId
      };

      console.log('🔍 Checking STK transaction status:', checkoutRequestId);

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
        checkoutRequestId: result.CheckoutRequestID
      };

    } catch (error) {
      console.error('❌ STK Query failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errorMessage || error.message
      };
    }
  }

  // Register C2B validation and confirmation URLs
  async registerC2BUrls() {
    try {
      const token = await this.generateAccessToken();

      const payload = {
        ShortCode: process.env.MPESA_SHORTCODE,
        ResponseType: 'Completed',
        // CHANGED: Remove "mpesa" from the URL paths
        ConfirmationURL: `${process.env.MPESA_CALLBACK_BASE_URL}/api/webhook/confirmation`,
        ValidationURL: `${process.env.MPESA_CALLBACK_BASE_URL}/api/webhook/validation`
      };

      console.log('🌐 Registering C2B URLs');

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