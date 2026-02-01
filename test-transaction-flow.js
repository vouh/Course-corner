#!/usr/bin/env node
/**
 * Diagnostic tool to test the transaction creation flow
 * This simulates what happens when a payment callback arrives
 */

const firebaseModule = require('./api/utils/firebase');

// Simulate a successful M-Pesa callback
async function testSuccessfulTransaction() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 Testing Successful Transaction Creation');
  console.log('═══════════════════════════════════════════════════════════');

  // Simulate payment in memory (would come from STK Push)
  global.payments = {
    'test-session-123': {
      sessionId: 'test-session-123',
      phoneNumber: '254712345678',
      amount: 100,
      category: 'calculate-cluster-points',
      checkoutRequestId: 'test-checkout-456',
      merchantRequestId: 'test-merchant-789',
      referralCode: null,
      status: 'awaiting_callback'
    }
  };

  console.log('✅ Payment stored in memory:', JSON.stringify(global.payments['test-session-123'], null, 2));

  // Simulate callback data
  const callbackData = {
    Body: {
      stkCallback: {
        CheckoutRequestID: 'test-checkout-456',
        MerchantRequestID: 'test-merchant-789',
        ResultCode: 0,
        ResultDesc: 'Success',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: 100 },
            { Name: 'MpesaReceiptNumber', Value: 'LK451A1K1K1' },
            { Name: 'TransactionDate', Value: 20250201120000 },
            { Name: 'PhoneNumber', Value: 254712345678 }
          ]
        }
      }
    }
  };

  console.log('\n📱 Simulating callback with:', JSON.stringify(callbackData, null, 2));

  // Test saveTransaction function
  try {
    console.log('\n📝 Calling saveTransaction...');
    const transactionData = {
      sessionId: 'test-session-123',
      phoneNumber: '254712345678',
      amount: 100,
      category: 'calculate-cluster-points',
      checkoutRequestId: 'test-checkout-456',
      merchantRequestId: 'test-merchant-789',
      referralCode: null,
      status: 'completed',
      resultDesc: 'Success',
      mpesaReceiptNumber: 'LK451A1K1K1',
      transactionCode: 'LK451A1K1K1',
      metadata: {
        Amount: 100,
        MpesaReceiptNumber: 'LK451A1K1K1',
        TransactionDate: 20250201120000,
        PhoneNumber: 254712345678
      },
      completedAt: new Date().toISOString(),
      callbackReceivedAt: new Date().toISOString()
    };

    console.log('Data to save:', JSON.stringify(transactionData, null, 2));
    
    const transactionId = await firebaseModule.saveTransaction(transactionData);
    
    if (transactionId) {
      console.log('\n✅ SUCCESS! Transaction created with ID:', transactionId);
    } else {
      console.log('\n❌ FAILED! saveTransaction returned null/empty');
    }
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
}

// Run test
testSuccessfulTransaction().catch(console.error);
