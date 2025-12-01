# 🚀 M-Pesa Integration - Quick Start Guide

## What's Been Created

Your Course Corner project now has a complete M-Pesa payment system! Here's what you got:

```
📦 Complete Payment System
├── 💻 Backend Server (Node.js + Express)
├── 🔐 M-Pesa Integration
├── 📱 Frontend Payment Handler
├── 📚 Full Documentation
└── 🚀 Vercel Ready
```

## 3 Simple Steps to Get Started

### Step 1️⃣ Copy Environment File
```bash
cd server
cp ..\.env .env
```

### Step 2️⃣ Install Dependencies
```bash
npm install
```

### Step 3️⃣ Start Server
```bash
npm run dev
```

That's it! Your server is running at `http://localhost:8080` 🎉

## Payment System Architecture

```
┌─────────────────────────────────────────────────┐
│           Browser / Frontend                     │
│         (index.html + calculator.js)             │
├─────────────────────────────────────────────────┤
│         paymentHandler.js (Client SDK)          │
│   (Manages payment flow & user interaction)     │
├─────────────────────────────────────────────────┤
│  HTTP/HTTPS Requests (JSON API)                 │
├─────────────────────────────────────────────────┤
│         Backend Server (Node.js)                │
│  (server/server.js on localhost:8080)           │
├─────────────────────────────────────────────────┤
│         M-Pesa Routes                           │
│  ├─ POST /api/mpesa/stkpush (Initiate)         │
│  ├─ GET /api/mpesa/status (Check status)       │
│  ├─ POST /api/mpesa/callback (Receive result)  │
│  └─ POST /api/payment/approve (Unlock)         │
├─────────────────────────────────────────────────┤
│         Safaricom M-Pesa API                    │
│    (Handles actual payments in Kenya)           │
└─────────────────────────────────────────────────┘
```

## Three Payment Options

| Button | Amount | Purpose |
|--------|--------|---------|
| 🧮 Calculate Cluster Points | KSH 150 | Just calculate points |
| 📚 Courses Only | KSH 150 | View eligible courses |
| ⭐ Point & Courses | KSH 160 | Both options |

## Payment Flow (What Happens)

```
1. User Clicks Button
   ↓
2. Enters Phone Number
   ↓
3. Server Sends STK Push
   ↓
4. User Gets Prompt on Phone
   ↓
5. User Enters M-Pesa PIN
   ↓
6. M-Pesa Confirms Payment
   ↓
7. Server Receives Callback
   ↓
8. Frontend Shows Results
```

## File Guide

### 🔧 Backend Files

| File | Purpose |
|------|---------|
| `server/server.js` | Main app that handles requests |
| `server/routes/mpesa.js` | Payment endpoints |
| `server/routes/payment.js` | Access control |
| `server/utils/mpesaUtil.js` | M-Pesa API calls |
| `server/models/PaymentStore.js` | Store payment data |

### 📱 Frontend Files

| File | Purpose |
|------|---------|
| `paymentHandler.js` | Handles payments on client side |
| `index.html` | Your main website |

### 📋 Config Files

| File | Purpose |
|------|---------|
| `vercel.json` | Deployment config |
| `server/.env` | Your credentials |
| `server/package.json` | Dependencies |

## How to Use Each File

### 1. Server Setup (`server/.env`)
```env
CONSUMER_KEY=your_key
CONSUMER_SECRET=your_secret
BusinessShortCode=175359
MPESA_PASSKEY=your_passkey
TILL_NUMBER=3648019
PORT=8080
```

### 2. Start Backend
```bash
cd server
npm install    # Install packages
npm run dev    # Start server
```

### 3. Update Frontend (in index.html)
```html
<!-- Add in <head> -->
<script src="paymentHandler.js"></script>

<!-- Add this before </body> -->
<script>
  const handler = new PaymentHandler('http://localhost:8080/api');
  // Handler manages payment flow
</script>
```

## Testing Locally

```javascript
// Test Phone Numbers (any of these work)
0712345678
254712345678
+254712345678

// Test M-Pesa PIN
Any 4 digits
```

## Deployment (When Ready)

```bash
# 1. Push to GitHub
git add .
git commit -m "Add M-Pesa backend"
git push

# 2. Deploy to Vercel
vercel

# 3. Set environment variables in Vercel dashboard

# 4. Update frontend URL to production URL
```

## Check If It's Working

### Local Testing
```bash
# Terminal 1: Start server
cd server && npm run dev

# Terminal 2: Check if running
curl http://localhost:8080/api/health

# Should return:
# {"status":"ok","service":"Course Corner M-Pesa Backend"}
```

### Browser Testing
1. Open `http://localhost:8080/api/health` in browser
2. Should show JSON response
3. Click payment button and test with phone number

## Common Issues & Fixes

### Issue: "Port 8080 already in use"
```bash
# Change PORT in server/.env or use:
PORT=3000 npm run dev
```

### Issue: "Cannot find module 'express'"
```bash
# Install dependencies
cd server && npm install
```

### Issue: "STK not appearing on phone"
- Check phone number format (must be 254...)
- Verify M-Pesa is active on the number
- Check M-Pesa credentials in .env

### Issue: "Module not found: paymentHandler.js"
- Make sure `paymentHandler.js` is in root directory
- Check HTML script tag path is correct

## Documentation Files

Each file explains different parts:

| Document | Content |
|----------|---------|
| `SERVER_SETUP.md` | Detailed setup instructions |
| `PAYMENT_INTEGRATION.md` | How to integrate with HTML |
| `COMPLETE_SETUP.md` | Overview of everything |
| `INSTALLATION_CHECKLIST.md` | Step-by-step checklist |
| `server/README.md` | Full API documentation |

## Payment Categories Explained

### 🧮 Calculate Cluster Points (KSH 150)
- User enters grades
- System calculates points
- Shows final result
- Access until session ends

### 📚 Courses Only (KSH 150)
- User sees eligible courses
- Can browse course options
- No point calculation
- Full course details

### ⭐ Point & Courses (KSH 160)
- Full experience
- Points + Courses + Universities
- Download report (PDF)
- All features unlocked

## Security Notes

⚠️ Never:
- Commit `.env` file
- Share credentials publicly
- Use HTTP in production
- Skip input validation

✅ Always:
- Keep `.env` private
- Use HTTPS only
- Validate all data
- Monitor transactions

## Next Actions

1. ✅ Setup complete - You now have all files
2. ⏭️ Copy `.env` to server folder
3. ⏭️ Run `npm install` in server
4. ⏭️ Start with `npm run dev`
5. ⏭️ Test locally
6. ⏭️ Deploy to Vercel

## Support

For detailed info, check:
- `server/README.md` - API endpoints
- `PAYMENT_INTEGRATION.md` - HTML setup
- Error messages in console - Debug issues

## You're Ready! 🎉

Your M-Pesa payment system is complete and ready to use!

All files are created. Just:
1. Add credentials to `.env`
2. Run `npm install`
3. Start with `npm run dev`
4. Test and deploy!

---

**Questions?** Check the documentation files!
**Ready to go?** Follow the 3-step quick start above! 🚀
