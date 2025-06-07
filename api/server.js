// M-Pesa Integration - Backend Server
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const moment = require('moment');
const dotenv = require('dotenv');
const crypto = require('crypto');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// M-Pesa Configuration
const config = {
  shortCode: process.env.MPESA_SHORT_CODE || '772900',
  passkey: process.env.MPESA_PASSKEY || '97841647ad1b3a2d88ac5b1b8e6d82d2593b207df718ff88bdbd61b7557a6b50',
  consumerKey: process.env.MPESA_CONSUMER_KEY || 'OmywOTi8qAKcZbGA6BIp09fr8ckR8PyjHGAMcia6xgCnzhN6',
  consumerSecret: process.env.MPESA_CONSUMER_SECRET || 'c7sWtD8ig5JHZlY2529pGG4EeTYfVJUOD6ukBeUfPuGABxVwG3IT4HpMKfAi8fab',
  environment: process.env.MPESA_ENVIRONMENT || 'production',
  callbackUrl: process.env.CALLBACK_URL || 'https://your-callback-url.com/callback',
  baseUrl: process.env.MPESA_ENVIRONMENT === 'sandbox' 
    ? 'https://sandbox.safaricom.co.ke' 
    : 'https://api.safaricom.co.ke'
};

// Helper functions
const getTimestamp = () => {
  return moment().format('YYYYMMDDHHmmss');
};

const getPassword = (shortCode, passkey, timestamp) => {
  const password = `${shortCode}${passkey}${timestamp}`;
  return Buffer.from(password).toString('base64');
};

// Get access token
const getAccessToken = async () => {
  try {
    const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
    const url = `${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`;
    
    console.log(`Getting access token from: ${url}`);
    console.log(`Using auth: Basic ${auth}`);
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });
    
    console.log('Access token response:', JSON.stringify(response.data));
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error.message);
    if (error.response) {
      console.error('Error Response Data:', JSON.stringify(error.response.data));
      console.error('Error Response Status:', error.response.status);
      console.error('Error Response Headers:', JSON.stringify(error.response.headers));
    }
    throw new Error(`Failed to get access token: ${error.message}`);
  }
};

// STK Push (C2B)
app.post('/api/stk-push', async (req, res) => {
  try {
    const { phoneNumber, amount, reference = 'Payment' } = req.body;
    
    if (!phoneNumber || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number and amount are required' 
      });
    }
    
    // Format phone number (remove leading zero if present)
    const formattedPhone = phoneNumber.startsWith('0') 
      ? `254${phoneNumber.substring(1)}` 
      : phoneNumber;
    
    const accessToken = await getAccessToken();
    const timestamp = getTimestamp();
    const password = getPassword(config.shortCode, config.passkey, timestamp);
    
    const url = `${config.baseUrl}/mpesa/stkpush/v1/processrequest`;
    const data = {
      BusinessShortCode: config.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: config.shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: `${config.callbackUrl}/stk-callback`,
      AccountReference: reference || 'Payment',
      TransactionDesc: reference || 'Payment'
    };
    
    console.log('STK Push request:', JSON.stringify(data));
    
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('STK Push response:', JSON.stringify(response.data));
    
    return res.status(200).json({
      success: true,
      message: 'STK push sent successfully',
      data: response.data
    });
  } catch (error) {
    console.error('STK Push error:', error.message);
    if (error.response) {
      console.error('Error Response Data:', JSON.stringify(error.response.data));
      console.error('Error Response Status:', error.response.status);
      console.error('Error Response Headers:', JSON.stringify(error.response.headers));
    }
    
    return res.status(500).json({
      success: false,
      message: `STK push failed: ${error.message}`,
      error: error.response ? error.response.data : null
    });
  }
});

// B2C Payment
app.post('/api/b2c', async (req, res) => {
  try {
    const { phoneNumber, amount, reason = 'Salary' } = req.body;
    
    if (!phoneNumber || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number and amount are required' 
      });
    }
    
    // Format phone number (remove leading zero if present)
    const formattedPhone = phoneNumber.startsWith('0') 
      ? `254${phoneNumber.substring(1)}` 
      : phoneNumber;
    
    const accessToken = await getAccessToken();
    
    const url = `${config.baseUrl}/mpesa/b2c/v1/paymentrequest`;
    const data = {
      InitiatorName: 'testapi',
      SecurityCredential: config.securityCredential,
      CommandID: 'BusinessPayment',
      Amount: amount,
      PartyA: config.shortCode,
      PartyB: formattedPhone,
      Remarks: reason || 'Payment',
      QueueTimeOutURL: `${config.callbackUrl}/b2c-timeout`,
      ResultURL: `${config.callbackUrl}/b2c-result`,
      Occasion: ''
    };
    
    console.log('B2C request:', JSON.stringify(data));
    
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('B2C response:', JSON.stringify(response.data));
    
    return res.status(200).json({
      success: true,
      message: 'B2C payment initiated successfully',
      data: response.data
    });
  } catch (error) {
    console.error('B2C error:', error.message);
    if (error.response) {
      console.error('Error Response Data:', JSON.stringify(error.response.data));
      console.error('Error Response Status:', error.response.status);
      console.error('Error Response Headers:', JSON.stringify(error.response.headers));
    }
    
    return res.status(500).json({
      success: false,
      message: `B2C payment failed: ${error.message}`,
      error: error.response ? error.response.data : null
    });
  }
});

// C2B Registration
app.post('/api/c2b/register', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    
    const url = `${config.baseUrl}/mpesa/c2b/v1/registerurl`;
    const data = {
      ShortCode: config.shortCode,
      ResponseType: 'Completed',
      ConfirmationURL: `${config.callbackUrl}/c2b-confirmation`,
      ValidationURL: `${config.callbackUrl}/c2b-validation`
    };
    
    console.log('C2B registration request:', JSON.stringify(data));
    
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('C2B registration response:', JSON.stringify(response.data));
    
    return res.status(200).json({
      success: true,
      message: 'C2B URLs registered successfully',
      data: response.data
    });
  } catch (error) {
    console.error('C2B registration error:', error.message);
    if (error.response) {
      console.error('Error Response Data:', JSON.stringify(error.response.data));
      console.error('Error Response Status:', error.response.status);
      console.error('Error Response Headers:', JSON.stringify(error.response.headers));
    }
    
    return res.status(500).json({
      success: false,
      message: `C2B registration failed: ${error.message}`,
      error: error.response ? error.response.data : null
    });
  }
});

// Transaction Status
app.post('/api/transaction-status', async (req, res) => {
  try {
    const { transactionId } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Transaction ID is required' 
      });
    }
    
    const accessToken = await getAccessToken();
    
    const url = `${config.baseUrl}/mpesa/transactionstatus/v1/query`;
    const data = {
      Initiator: 'testapi',
      SecurityCredential: config.securityCredential,
      CommandID: 'TransactionStatusQuery',
      TransactionID: transactionId,
      PartyA: config.shortCode,
      IdentifierType: '4',
      ResultURL: `${config.callbackUrl}/transaction-status-result`,
      QueueTimeOutURL: `${config.callbackUrl}/transaction-status-timeout`,
      Remarks: 'Transaction status query',
      Occasion: ''
    };
    
    console.log('Transaction status request:', JSON.stringify(data));
    
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Transaction status response:', JSON.stringify(response.data));
    
    return res.status(200).json({
      success: true,
      message: 'Transaction status query initiated successfully',
      data: response.data
    });
  } catch (error) {
    console.error('Transaction status error:', error.message);
    if (error.response) {
      console.error('Error Response Data:', JSON.stringify(error.response.data));
      console.error('Error Response Status:', error.response.status);
      console.error('Error Response Headers:', JSON.stringify(error.response.headers));
    }
    
    return res.status(500).json({
      success: false,
      message: `Transaction status query failed: ${error.message}`,
      error: error.response ? error.response.data : null
    });
  }
});

// Bill Manager
app.post('/api/bill-manager', async (req, res) => {
  try {
    const { billReference, amount, phoneNumber } = req.body;
    
    if (!billReference || !amount || !phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Bill reference, amount, and phone number are required' 
      });
    }
    
    // Format phone number (remove leading zero if present)
    const formattedPhone = phoneNumber.startsWith('0') 
      ? `254${phoneNumber.substring(1)}` 
      : phoneNumber;
    
    const accessToken = await getAccessToken();
    
    const url = `${config.baseUrl}/mpesa/billmanager/v1/paymentrequest`;
    const data = {
      ExternalReference: billReference,
      Amount: amount,
      MSISDN: formattedPhone,
      AccountReference: billReference,
      CallBackURL: `${config.callbackUrl}/bill-manager-callback`
    };
    
    console.log('Bill manager request:', JSON.stringify(data));
    
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Bill manager response:', JSON.stringify(response.data));
    
    return res.status(200).json({
      success: true,
      message: 'Bill payment initiated successfully',
      data: response.data
    });
  } catch (error) {
    console.error('Bill manager error:', error.message);
    if (error.response) {
      console.error('Error Response Data:', JSON.stringify(error.response.data));
      console.error('Error Response Status:', error.response.status);
      console.error('Error Response Headers:', JSON.stringify(error.response.headers));
    }
    
    return res.status(500).json({
      success: false,
      message: `Bill payment failed: ${error.message}`,
      error: error.response ? error.response.data : null
    });
  }
});

// Callback endpoints
app.post('/callback/stk-callback', (req, res) => {
  console.log('STK callback received:', JSON.stringify(req.body));
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
});

app.post('/callback/b2c-result', (req, res) => {
  console.log('B2C result callback received:', JSON.stringify(req.body));
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
});

app.post('/callback/b2c-timeout', (req, res) => {
  console.log('B2C timeout callback received:', JSON.stringify(req.body));
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
});

app.post('/callback/c2b-confirmation', (req, res) => {
  console.log('C2B confirmation callback received:', JSON.stringify(req.body));
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
});

app.post('/callback/c2b-validation', (req, res) => {
  console.log('C2B validation callback received:', JSON.stringify(req.body));
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
});

app.post('/callback/transaction-status-result', (req, res) => {
  console.log('Transaction status result callback received:', JSON.stringify(req.body));
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
});

app.post('/callback/transaction-status-timeout', (req, res) => {
  console.log('Transaction status timeout callback received:', JSON.stringify(req.body));
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
});

app.post('/callback/bill-manager-callback', (req, res) => {
  console.log('Bill manager callback received:', JSON.stringify(req.body));
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
});

// Get transaction history (mock implementation)
app.get('/api/transactions', (req, res) => {
  // In a real implementation, this would fetch from a database
  const transactions = [
    {
      id: '1',
      type: 'STK Push',
      amount: '100',
      phoneNumber: '254728240104',
      status: 'Completed',
      timestamp: new Date().toISOString()
    }
  ];
  
  res.status(200).json({
    success: true,
    data: transactions
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${config.environment}`);
  console.log(`Base URL: ${config.baseUrl}`);
});
