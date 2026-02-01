# Payment Status System - Quick Reference

## Files Created/Modified

### ✅ NEW FILES
- `/api/payment/status-handler.js` - Centralized payment status management
- `/api/payment/sync-status.js` - Bulk sync & health checks  
- `/PAYMENT_STATUS_SYSTEM.md` - Complete documentation
- `/debug-payment.sh` - Debug utility script

### 🔧 MODIFIED FILES
- `/api/mpesa/callback.js` - Enhanced M-Pesa code extraction & logging

### ℹ️ VERIFIED (No changes needed)
- `/api/payment/verify-code.js` - Working correctly
- `/admin/index.html` - Revenue auto-calculated safely
- `/server/routes/mpesa.js` - Properly handling callbacks
- `/server/routes/payment.js` - Status verification works

---

## Common Issues & Solutions

### Issue: Payment shows "Pending" but should be "Completed"

**Quick Fix**:
```bash
# Using debug script
./debug-payment.sh
# Select option: 4 (Update transaction status)
# Enter checkout ID

# OR using curl
curl -X POST "https://course-corner-server.vercel.app/api/payment/status-handler" \
  -H "Content-Type: application/json" \
  -d '{"action":"update","checkoutRequestId":"your-checkout-id"}'
```

**Longer Fix**:
1. Check if M-Pesa callback was received (look at server logs)
2. Verify M-Pesa receipt code exists in database
3. Use sync-status endpoint to force sync
4. If still pending after 2 hours, system auto-marks as failed

---

### Issue: M-Pesa Code Not Captured

**Diagnosis**:
- Was the callback received from M-Pesa? (Server logs)
- Did the callback include `MpesaReceiptNumber`?
- Is it stored in Firebase?

**Fix**:
```javascript
// Capture the code manually if missing
curl -X POST "https://course-corner-server.vercel.app/api/payment/status-handler" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "capture",
    "checkoutRequestId": "your-checkout-id",
    "mpesaCode": "XXXXX"
  }'
```

---

### Issue: User Can't Verify Receipt Code

**Checklist**:
- [ ] Payment status = "completed" (not pending/failed)
- [ ] M-Pesa code exists in database
- [ ] Code hasn't been used yet (used = false)
- [ ] Code not expired (created < 30 days ago)
- [ ] Phone number matches (if bound)

**Debug**:
```bash
# Check if code exists
curl -X POST "https://course-corner-server.vercel.app/api/payment/status-handler" \
  -H "Content-Type: application/json" \
  -d '{"action":"verify","mpesaCode":"XXXXX","phoneNumber":"0712345678"}'
```

---

### Issue: Admin Revenue Shows Wrong Amount

**Note**: KSH 3,908 value is **auto-calculated** from completed transactions. It's not hardcoded and can't be manually changed.

**How it's calculated**:
```
For each completed transaction:
  Total = Total + transaction.amount
```

**To verify**:
1. Check admin dashboard transactions table
2. Count completed transactions and their amounts
3. Should match the displayed total revenue

**If incorrect**:
- Some payments may be marked as "pending" instead of "completed"
- Use the bulk sync to fix: `?syncAll=true`
- Revenue will auto-update once statuses are corrected

---

## API Endpoints Quick Reference

### Check Transaction Status
```bash
GET /api/payment/sync-status?checkoutRequestId=xxxxx
```

### Check Phone Transactions
```bash
GET /api/payment/sync-status?phoneNumber=0712345678&limit=50
```

### Verify M-Pesa Code
```bash
POST /api/payment/status-handler
{
  "action": "verify",
  "mpesaCode": "XXXXX",
  "phoneNumber": "0712345678"
}
```

### Update Transaction Status
```bash
POST /api/payment/status-handler
{
  "action": "update",
  "checkoutRequestId": "xxxxx"
}
```

### Capture M-Pesa Code
```bash
POST /api/payment/status-handler
{
  "action": "capture",
  "checkoutRequestId": "xxxxx",
  "mpesaCode": "XXXXX"
}
```

### Bulk Sync Pending
```bash
GET /api/payment/sync-status?syncAll=true&limit=200
```

---

## Payment Status Flow

```
User Initiates Payment
    ↓
POST /api/mpesa/stkpush
    ↓
Status: PENDING
    ↓
M-Pesa Callback Arrives
    ↓
POST /api/mpesa/callback (stores MpesaReceiptNumber)
    ↓
Status: COMPLETED + Receipt Code
    ↓
GET /api/mpesa/status (polls)
    ↓
User sees completed receipt code
    ↓
User verifies code
    ↓
POST /api/payment/verify-code
    ↓
Access granted to results
```

---

## Database Fields to Know

| Field | Meaning | Example |
|-------|---------|---------|
| `status` | Payment status | pending, completed, failed |
| `mpesaReceiptNumber` | M-Pesa receipt code | XXXXX |
| `checkoutRequestId` | M-Pesa checkout ID | ws_co_xxxxx |
| `amount` | Payment amount in KSH | 1 |
| `phoneNumber` | Customer phone | 254712345678 |
| `used` | Code redemption status | true/false |
| `completedAt` | When payment completed | 2026-02-01T... |
| `callbackReceivedAt` | When callback arrived | 2026-02-01T... |

---

## Testing Checklist

- [ ] Create test payment with KSH 1
- [ ] Verify callback received with M-Pesa code
- [ ] Check transaction status shows "completed"
- [ ] Verify user can see receipt code
- [ ] Verify code can only be used once
- [ ] Check admin revenue updated correctly
- [ ] Test bulk sync finds completed transactions
- [ ] Verify old pending payments timeout after 2 hours

---

## Logs to Check

### M-Pesa Callback Logs
Look for:
```
📱 M-Pesa Callback Received
✅ Payment successful
🧾 M-Pesa Receipt Number: XXXXX
📋 Full Metadata: {...}
```

### Status Check Logs
Look for:
```
🔍 Querying M-Pesa for status
✅ M-Pesa confirms payment successful
📋 M-Pesa Query Result: {...}
```

### Sync Logs
Look for:
```
🔄 Payment Status Sync Started
📊 Performing bulk sync
✅ Sync complete
```

---

## Key Numbers

- **Payment timeout**: 2 hours (auto-fail pending)
- **Code expiration**: 30 days
- **One-time use**: Each code redeemable once
- **Min withdrawal**: KES 100
- **Referral commission**: 12%

---

**For detailed documentation, see**: `/PAYMENT_STATUS_SYSTEM.md`

**Last Updated**: February 1, 2026
**System Status**: ✅ Production Ready
