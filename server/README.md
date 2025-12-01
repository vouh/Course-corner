# Course Corner M-Pesa Backend Server

Complete M-Pesa payment integration for Course Corner platform.

## Features

- ✅ STK Push Payment Initiation
- ✅ Payment Status Polling
- ✅ Callback Handling
- ✅ Payment Verification
- ✅ In-Memory Payment Storage
- ✅ Admin Statistics & Reporting
- ✅ CORS Enabled for Frontend Integration

## Project Structure

```
server/
├── server.js                 # Main Express server
├── package.json              # Dependencies
├── routes/
│   ├── mpesa.js             # M-Pesa payment routes
│   └── payment.js           # Payment approval routes
├── models/
│   └── PaymentStore.js      # In-memory payment storage
├── utils/
│   ├── mpesaUtil.js         # M-Pesa utilities
│   └── helpers.js           # Helper functions
└── README.md                # This file
```

## Installation

### 1. Prerequisites

- Node.js 18.x or higher
- npm or yarn
- M-Pesa credentials from Safaricom

### 2. Install Dependencies

```bash
cd server
npm install
```

### 3. Environment Variables

Create a `.env` file in the project root:

```env
# M-Pesa Credentials
CONSUMER_KEY=your_consumer_key
CONSUMER_SECRET=your_consumer_secret
BusinessShortCode=175359
MPESA_PASSKEY=your_mpesa_passkey
TILL_NUMBER=3648019

# Server Configuration
PORT=8080
NODE_ENV=development
CALLBACK_URL=https://your-vercel-domain.vercel.app
```

## Running Locally

### Development Mode

```bash
npm run dev
```

The server will start on `http://localhost:8080`

### Production Mode

```bash
npm start
```

## API Endpoints

### 1. Initiate STK Push Payment

**POST** `/api/mpesa/stkpush`

Request body:
```json
{
  "phoneNumber": "0712345678",
  "category": "calculate-cluster-points"
}
```

Response:
```json
{
  "success": true,
  "message": "STK Push initiated successfully",
  "data": {
    "sessionId": "abc123...",
    "checkoutRequestId": "ws_co_...",
    "amount": 150,
    "category": "calculate-cluster-points"
  }
}
```

**Payment Categories & Amounts:**
- `calculate-cluster-points` - KSH 150
- `courses-only` - KSH 150
- `point-and-courses` - KSH 160

### 2. Check Payment Status

**GET** `/api/mpesa/status/:sessionId`

Response:
```json
{
  "success": true,
  "data": {
    "sessionId": "abc123...",
    "category": "calculate-cluster-points",
    "amount": 150,
    "status": "completed|pending|failed"
  }
}
```

### 3. M-Pesa Callback

**POST** `/api/mpesa/callback`

Automatically receives M-Pesa payment confirmations. No manual action required.

### 4. Verify Payment

**POST** `/api/mpesa/verify`

Request body:
```json
{
  "sessionId": "abc123..."
}
```

### 5. Check Access

**POST** `/api/payment/has-access`

Request body:
```json
{
  "sessionId": "abc123...",
  "category": "calculate-cluster-points"
}
```

### 6. Approve Access

**POST** `/api/payment/approve`

Request body:
```json
{
  "sessionId": "abc123..."
}
```

Response:
```json
{
  "success": true,
  "message": "Payment verified and approved",
  "data": {
    "approved": true,
    "accessToken": "base64_encoded_token",
    "expiresAt": "2025-12-02T12:00:00Z"
  }
}
```

### 7. Get Payment Details

**GET** `/api/payment/details/:sessionId`

### 8. Admin: Get Completed Payments

**GET** `/api/mpesa/admin/completed`

### 9. Admin: Get Statistics

**GET** `/api/mpesa/admin/stats`

Response:
```json
{
  "success": true,
  "data": {
    "totalPayments": 100,
    "completed": 85,
    "pending": 10,
    "failed": 5,
    "totalAmount": 14250
  }
}
```

### 10. Health Check

**GET** `/api/health`

## Deployment to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "Add M-Pesa backend server"
git push origin main
```

### 2. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Or connect your GitHub repo to Vercel dashboard.

### 3. Set Environment Variables in Vercel

Go to Vercel Dashboard → Project Settings → Environment Variables

Add all variables from your `.env` file:
- `CONSUMER_KEY`
- `CONSUMER_SECRET`
- `BusinessShortCode`
- `MPESA_PASSKEY`
- `TILL_NUMBER`
- `PORT`
- `CALLBACK_URL` (set to your Vercel domain)

### 4. Update Frontend Callback URL

In `paymentHandler.js`, update the server URL:

```javascript
const handler = new PaymentHandler('https://your-vercel-domain.vercel.app/api');
```

## Frontend Integration

### Include Payment Handler

```html
<script src="paymentHandler.js"></script>
```

### Modify Payment Buttons

```javascript
// Initialize payment handler
const paymentHandler = new PaymentHandler('https://your-server/api');

// On button click
document.getElementById('calculateBtn').addEventListener('click', async () => {
  try {
    const phoneNumber = prompt('Enter your phone number');
    const category = 'calculate-cluster-points';

    // Initiate payment
    const result = await paymentHandler.initiatePayment(phoneNumber, category);

    // Show STK prompt message
    Swal.fire({
      icon: 'info',
      title: 'Check Your Phone',
      text: 'A payment prompt has been sent to your phone. Enter your M-Pesa PIN to complete the payment.'
    });

    // Poll for payment completion
    try {
      await paymentHandler.pollPaymentStatus();
      
      // Payment successful - approve access
      await paymentHandler.approveAccess();
      
      // Show results
      document.getElementById('results').classList.remove('hidden');
      
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Payment Failed',
        text: error.message
      });
    }

  } catch (error) {
    console.error('Error:', error);
  }
});
```

## Testing

### Test Phone Numbers (Sandbox)

- `+254712345678`
- `254712345678`
- `0712345678`

All formats are accepted.

### Test M-Pesa PIN

In sandbox mode, use any 4-digit number for M-Pesa PIN.

## Security Notes

⚠️ **Important for Production:**

1. **Never commit `.env` file** - Keep credentials private
2. **Use HTTPS only** - All payment data must be encrypted
3. **Verify signatures** - Implement callback signature verification
4. **Rate limiting** - Add rate limiting to prevent abuse
5. **Input validation** - Always validate all inputs on server
6. **CORS configuration** - Restrict CORS to your domain only

## Error Handling

The API returns standardized error responses:

```json
{
  "success": false,
  "message": "Error description"
}
```

Common errors:
- `400` - Bad Request (missing/invalid parameters)
- `404` - Not Found (session/payment not found)
- `500` - Server Error (M-Pesa connectivity issue)

## Troubleshooting

### STK Push Not Appearing

1. Check phone number format (must start with 254)
2. Verify M-Pesa is active on the number
3. Check Safaricom credentials in `.env`
4. Review server logs for errors

### Callback Not Received

1. Verify callback URL is correct and public
2. Check firewall/security rules
3. Ensure server is running and accessible
4. Review M-Pesa callback format

### Payment Status Stuck on Pending

1. Increase polling timeout
2. Check M-Pesa account balance
3. Verify transaction in M-Pesa dashboard
4. Manually query STK status

## Database Consideration

Current implementation uses in-memory storage. For production:

1. **PostgreSQL** - Recommended for relational data
2. **MongoDB** - For flexible schema
3. **Firebase** - Serverless option

Add a database model to `models/` directory.

## License

MIT

## Support

For issues or questions:
1. Check error logs
2. Review M-Pesa API documentation
3. Contact Safaricom support
4. Open an issue in the repository

---

**Created for Course Corner Platform**
Last Updated: December 2025
