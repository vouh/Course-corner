# Vercel Deployment Commands

## Prerequisites
```bash
# Install Vercel CLI globally
npm install -g vercel
```

## Deployment Steps

### Step 1: Login to Vercel
```bash
vercel login
```
Follow the prompts to authenticate with your GitHub account.

### Step 2: Deploy Your Project
```bash
# From project root directory
vercel
```

Or deploy the server folder specifically:
```bash
vercel --prod
```

## Manual Deployment (Recommended)

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Update Node.js version to 24.x"
git push origin main
```

### Step 2: Deploy via Vercel Dashboard
1. Go to https://vercel.com
2. Click "New Project"
3. Select your GitHub repository
4. Vercel will auto-detect settings
5. Click "Deploy"

### Step 3: Set Environment Variables

In Vercel Dashboard:
1. Go to Project Settings
2. Click "Environment Variables"
3. Add each variable from your `.env` file:

```
CONSUMER_KEY=your_consumer_key
CONSUMER_SECRET=your_consumer_secret
BusinessShortCode=175359
MPESA_PASSKEY=your_mpesa_passkey
TILL_NUMBER=3648019
CALLBACK_URL=https://your-vercel-domain.vercel.app
PORT=8080
NODE_ENV=production
```

## Verify Deployment

After deployment, test your endpoints:

```bash
# Health check (replace with your Vercel domain)
curl https://your-project-name.vercel.app/api/health

# Expected response:
# {"status":"ok","timestamp":"2025-12-01T...","service":"Course Corner M-Pesa Backend"}
```

## Common Commands

```bash
# Deploy to production
vercel --prod

# Preview deployment
vercel

# Check deployment logs
vercel logs

# List all deployments
vercel list

# Remove a deployment
vercel rm <deployment-id>

# Check project settings
vercel env list

# Pull environment variables
vercel env pull

# Open project dashboard
vercel open

# Open live deployment
vercel open --prod
```

## Troubleshooting

### Build Error: "Node.js Version 18.x is discontinued"
**Solution:** Already fixed! We updated `package.json` to use Node.js 24.x

### Environment Variables Not Loaded
```bash
# Pull latest environment variables from Vercel
vercel env pull

# Re-deploy
vercel --prod
```

### Callback URL Issues
Update `CALLBACK_URL` in Vercel environment variables to your deployed domain:
```
https://your-project-name.vercel.app
```

Then update your frontend `paymentHandler.js`:
```javascript
const paymentHandler = new PaymentHandler('https://your-project-name.vercel.app/api');
```

### Check Logs in Real-time
```bash
vercel logs --follow
```

## Redeployment After Changes

After making code changes:

```bash
# Option 1: Push to GitHub (auto-deploys)
git add .
git commit -m "Your message"
git push origin main

# Option 2: Manual Vercel deployment
vercel --prod
```

## Environment Variables Quick Ref

| Variable | Value | Example |
|----------|-------|---------|
| CONSUMER_KEY | From Safaricom | pcPCW9woTyqlqXynSbPfyohzwppabVlTGviqYiyapwF9k1bb |
| CONSUMER_SECRET | From Safaricom | NF5l8mrop2mUVHZLaJoW7J1k3U8DdXEKKQ8yg2DT2raU71s3H0fU1S0wnEMhn8Lb |
| BusinessShortCode | Provided | 175359 |
| MPESA_PASSKEY | From Safaricom | 6114fcade61b65eb6970324ff0cce80f785aac053fb12f91eb803f3fc0ca1ee9 |
| TILL_NUMBER | Your till | 3648019 |
| CALLBACK_URL | Your Vercel domain | https://your-project-name.vercel.app |
| PORT | Server port | 8080 |
| NODE_ENV | Environment | production |

## Success Indicators

✅ Deployment successful when you see:
- Green checkmark next to deployment
- Health endpoint responds
- Environment variables loaded
- Logs show no errors

## Next Steps After Deployment

1. ✅ Update frontend `paymentHandler.js` with production URL
2. ✅ Test payment flow on production
3. ✅ Monitor M-Pesa callbacks
4. ✅ Check admin stats endpoint
5. ✅ Verify payment success/failure handling

---

**Your Node.js version has been updated to 24.x - Ready to deploy! 🚀**
