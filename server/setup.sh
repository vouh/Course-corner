#!/bin/bash

# Course Corner M-Pesa Server Installation Script
# This script sets up the M-Pesa payment server locally

echo "🚀 Course Corner M-Pesa Server Setup"
echo "===================================="
echo ""

# Check if Node.js is installed
echo "📋 Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18.x or higher"
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

node_version=$(node -v)
echo "✅ Node.js found: $node_version"
echo ""

# Change to server directory
echo "📁 Navigating to server directory..."
cd server || { echo "❌ Failed to navigate to server directory"; exit 1; }
echo "✅ In server directory"
echo ""

# Check if .env exists
echo "🔍 Checking for .env file..."
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found in server directory"
    echo "   Please copy your .env file to the server folder:"
    echo "   cp ../.env .env"
    echo ""
    echo "   Or create a new .env with your M-Pesa credentials:"
    cat .env.example
    exit 1
fi
echo "✅ .env file found"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
if command -v npm &> /dev/null; then
    npm install
    if [ $? -eq 0 ]; then
        echo "✅ Dependencies installed successfully"
    else
        echo "❌ Failed to install dependencies"
        exit 1
    fi
else
    echo "❌ npm not found"
    exit 1
fi
echo ""

# Start server
echo "🎯 Starting M-Pesa Payment Server..."
echo "========================================="
echo ""
echo "Server will run on: http://localhost:8080"
echo "Health check:       http://localhost:8080/api/health"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""
echo "========================================="
echo ""

npm run dev

