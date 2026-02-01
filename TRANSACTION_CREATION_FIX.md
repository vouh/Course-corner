# Transaction Creation Flow - Fixed

## Problem
Successful M-Pesa transactions were not being saved to Firebase. The user would pay successfully but the transaction would disappear.

## Root Causes
1. **Serverless Cold Starts**: API callback is a different Vercel invocation than STK Push
   - STK Push stores payment in `global.payments`
   - Callback has fresh empty `global.payments` (cold start)
   - Payment lookup fails, transaction never created

2. **Missing Fallback**: When payment not found in memory, callback would just fail
   - No attempt to extract data from M-Pesa callback metadata
   - No way to recover from cold starts

## Solution Implemented

### 1. API Callback (Vercel Serverless) - `api/mpesa/callback.js`
**Two-tier approach:**

**Tier 1: Normal case** (payment in memory)
- Lookup payment by `checkoutRequestId`
- Create transaction with payment details + callback receipt
- Include referral code if available

**Tier 2: Fallback** (cold start - payment not in memory)
- Extract `phoneNumber` and `amount` from M-Pesa metadata
- Extract receipt number (case-insensitive `MpesaReceiptNumber`)
- Create transaction with available data
- Ensures payment is saved even on cold starts

### 2. Server Callback - `server/routes/mpesa.js`
**Two-tier approach:**

**Tier 1: Normal case** (payment in PaymentStore)
- Lookup payment by `checkoutRequestId`
- Create transaction with complete details

**Tier 2: Fallback** (payment not found)
- Extract data from M-Pesa metadata
- Create transaction for both success AND failure cases

## Transaction Status Flow
```
Payment Initiated → STK Push
├─ Stored in-memory (Tier 1) or empty (Tier 2)

User Pays in M-Pesa
├─ M-Pesa sends callback

Callback Arrives
├─ Check if payment in memory
│  ├─ YES → Create transaction with full details
│  └─ NO → Extract from callback metadata, create transaction
├─ Extract M-Pesa receipt (case-insensitive)
├─ Save to Firebase
└─ Transaction appears in admin

Admin Dashboard
└─ Shows transaction with receipt code
```

## Status Values
- **Never "pending"** - eliminated entirely
- **Only "completed"** or **"failed"** appear
- Transactions only exist once M-Pesa callback arrives

## Key Improvements
1. ✅ Handles serverless cold starts gracefully
2. ✅ Case-insensitive receipt extraction
3. ✅ Fallback mechanism for orphan callbacks
4. ✅ Complete transaction data captured from M-Pesa
5. ✅ No more "pending" limbo states
6. ✅ Every successful payment is saved

## Testing
To verify transactions are being created:
1. Initiate M-Pesa payment
2. Complete payment on phone
3. Check admin dashboard for transaction
4. Verify receipt code is captured
5. Check server logs for creation confirmation

## Files Modified
- `api/mpesa/callback.js` - Added fallback transaction creation
- `api/mpesa/stkpush.js` - Stores payment in memory only
- `server/routes/mpesa.js` - Added fallback transaction creation
