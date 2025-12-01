# Vercel Deployment Commands

## Prerequisites

Make sure you have:
- Git installed
- GitHub account
- Vercel account (free at vercel.com)
- Node.js 18.x installed

## Installation & Setup

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Verify Installation
```bash
vercel --version
```

## Deployment Commands

### Option A: Deploy from Command Line (Easiest)

```bash
# Login to Vercel
vercel login

# Navigate to project root
cd c:\Users\ADMIN\Desktop\course corner project

# Deploy
vercel
```

**What happens:**
- Follow the prompts
- Select your team/account
- Link to GitHub repo (optional)
- Choose settings
- Deployment starts
- Get live URL

### Option B: Deploy from GitHub (Recommended)

```bash
# 1. Push code to GitHub
git add .
git commit -m "Add M-Pesa backend and payment integration"
git push origin main

# 2. Go to https://vercel.com/dashboard
# 3. Click "Add New" → "Project"
# 4. Select your Course-corner repo
# 5. Click "Import"
# 6. Set environment variables (see below)
# 7. Click "Deploy"
```

## Environment Variables Setup

### In Vercel Dashboard:

1. Go to your project → **Settings** → **Environment Variables**
2. Add each variable:

```
CONSUMER_KEY=pcPCW9woTyqlqXynSbPfyohzwppabVlTGviqYiyapwF9k1bb
CONSUMER_SECRET=NF5l8mrop2mUVHZLaJoW7J1k3U8DdXEKKQ8yg2DT2raU71s3H0fU1S0wnEMhn8Lb
BusinessShortCode=3576709
MPESA_PASSKEY=6114fcade61b65eb6970324ff0cce80f785aac053fb12f91eb803f3fc0ca1ee9
TILL_NUMBER=3648019
PORT=8080
NODE_ENV=production
CALLBACK_URL=[YOUR_VERCEL_URL]
```

3. Click "Save"

## Most Common Vercel Commands

```bash
# Login
vercel login

# Deploy current directory
vercel

# Deploy to production
vercel --prod

# Deploy specific directory
vercel --cwd ./server

# Check deployment status
vercel status

# View logs
vercel logs [deployment-url]

# Remove a deployment
vercel remove [deployment-url]

# List all deployments
vercel list

# Logout
vercel logout

# View current project info
vercel projects

# Set environment variables
vercel env add VARIABLE_NAME
vercel env pull  # Download .env locally
vercel env ls    # List all variables
```

## Quick Deploy Script

Save this as `deploy.sh` (Linux/Mac) or `deploy.bat` (Windows):

### For Linux/Mac (`deploy.sh`):
```bash
#!/bin/bash

echo "🚀 Starting Vercel Deployment..."
echo ""

# Check if logged in
vercel whoami > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "📝 Logging in to Vercel..."
    vercel login
fi

echo ""
echo "📦 Deploying to Vercel..."
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo "🌐 Check your Vercel dashboard for the live URL"
```

### For Windows (`deploy.bat`):
```batch
@echo off
echo 🚀 Starting Vercel Deployment...
echo.

echo 📦 Deploying to Vercel...
call vercel --prod

echo.
echo ✅ Deployment complete!
echo 🌐 Check your Vercel dashboard for the live URL
pause
```

## Step-by-Step Deployment

### Step 1: Prepare Code
```bash
cd c:\Users\ADMIN\Desktop\course corner project

# Make sure everything is committed
git status
git add .
git commit -m "Add M-Pesa integration with server"
git push origin main
```

### Step 2: Login to Vercel
```bash
vercel login
```

### Step 3: Initial Deploy
```bash
vercel
```

During this, it will ask:
- **Set up and deploy?** → `y` (yes)
- **Which scope?** → Your account
- **Link to existing project?** → `n` (no) for first time
- **What's your project's name?** → `course-corner`
- **In which directory?** → `./` (current)
- **Want to modify vercel.json?** → `n` (no, we already have it)

### Step 4: Add Environment Variables
```bash
# Option 1: CLI (one at a time)
vercel env add CONSUMER_KEY
vercel env add CONSUMER_SECRET
vercel env add BusinessShortCode
vercel env add MPESA_PASSKEY
vercel env add TILL_NUMBER
vercel env add CALLBACK_URL

# Option 2: Dashboard (easier)
# Go to https://vercel.com/dashboard
# Find your project
# Settings → Environment Variables
# Add all at once
```

### Step 5: Deploy to Production
```bash
vercel --prod
```

### Step 6: Get Your URL
```bash
# After deployment completes, you'll see:
# ✓ Production: [your-url].vercel.app

# Copy this URL and use it in your frontend
```

## After Deployment

### Update Frontend URL
In `index.html` or `paymentHandler.js`, update:
```javascript
// Change from:
const paymentHandler = new PaymentHandler('http://localhost:8080/api');

// To:
const paymentHandler = new PaymentHandler('https://your-deployment-url.vercel.app/api');
```

### Test Your Deployment
```bash
# Test the health endpoint
curl https://your-deployment-url.vercel.app/api/health

# Should return:
# {"status":"ok","timestamp":"...","service":"Course Corner M-Pesa Backend"}
```

## Redeploy After Changes

```bash
# Make changes locally
git add .
git commit -m "Your changes"
git push origin main

# Vercel auto-deploys OR manually:
vercel --prod
```

## Troubleshooting

### Deployment Failed?
```bash
# Check logs
vercel logs https://your-url.vercel.app

# Check deployment history
vercel list

# Redeploy specific commit
vercel deploy --token $VERCEL_TOKEN
```

### Environment Variables Not Working?
```bash
# Pull env variables to verify
vercel env pull

# Check .env file in root
cat .env
```

### Server Not Responding?
```bash
# Test health endpoint
curl https://your-url.vercel.app/api/health

# Test STK push endpoint
curl -X POST https://your-url.vercel.app/api/mpesa/stkpush \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"254712345678","category":"calculate-cluster-points"}'
```

## Getting Your Vercel URL

After deployment, your URL will be in format:
```
https://[project-name].vercel.app
```

Or custom domain if you set one up.

## Production Checklist

- [ ] Environment variables set in Vercel
- [ ] `CALLBACK_URL` updated to production URL
- [ ] `vercel.json` configured correctly
- [ ] `package.json` has correct start script
- [ ] `.env` file NOT committed to git
- [ ] HTTPS enabled (automatic)
- [ ] Health check passes
- [ ] Test payment flow end-to-end

## Common Issues

| Issue | Solution |
|-------|----------|
| Build fails | Check `vercel logs` |
| Env vars not found | Verify in Settings → Environment |
| CORS error | Check frontend URL in CORS config |
| Port conflicts | Remove PORT from env vars |
| Module not found | Check import paths |

## Success!

Once deployed, you'll see:
```
✓ Production: https://your-project.vercel.app
✓ API ready at: https://your-project.vercel.app/api
✓ Health check: https://your-project.vercel.app/api/health
```

---

**That's it! Your M-Pesa payment system is now live! 🎉**
