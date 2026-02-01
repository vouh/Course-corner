#!/bin/bash
# Payment Status System - Quick Debugging Script
# Use this to quickly check and fix payment issues

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_URL="${API_URL:-https://course-corner-server.vercel.app/api}"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Course Corner - Payment Status Debug Utility${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠️  jq not found. Install it for better JSON formatting.${NC}"
    echo -e "${YELLOW}   Linux: sudo apt-get install jq${NC}"
    echo -e "${YELLOW}   macOS: brew install jq${NC}\n"
fi

# Function to check transaction by ID
check_transaction() {
    local checkout_id=$1
    echo -e "${BLUE}🔍 Checking transaction: ${checkout_id}${NC}\n"
    
    curl -s "${API_URL}/payment/sync-status?checkoutRequestId=${checkout_id}" | \
        jq '.' 2>/dev/null || \
        curl -s "${API_URL}/payment/sync-status?checkoutRequestId=${checkout_id}"
    
    echo ""
}

# Function to check phone transactions
check_phone() {
    local phone=$1
    echo -e "${BLUE}📞 Checking transactions for phone: ${phone}${NC}\n"
    
    curl -s "${API_URL}/payment/sync-status?phoneNumber=${phone}&limit=20" | \
        jq '.' 2>/dev/null || \
        curl -s "${API_URL}/payment/sync-status?phoneNumber=${phone}&limit=20"
    
    echo ""
}

# Function to verify M-Pesa code
verify_code() {
    local code=$1
    local phone=$2
    
    echo -e "${BLUE}✅ Verifying M-Pesa code: ${code}${NC}\n"
    
    local payload=$(cat <<EOF
{
  "action": "verify",
  "mpesaCode": "${code}"
  $([ -n "$phone" ] && echo ", \"phoneNumber\": \"${phone}\"")
}
EOF
)
    
    curl -s -X POST "${API_URL}/payment/status-handler" \
        -H "Content-Type: application/json" \
        -d "$payload" | jq '.' 2>/dev/null || \
    curl -s -X POST "${API_URL}/payment/status-handler" \
        -H "Content-Type: application/json" \
        -d "$payload"
    
    echo ""
}

# Function to update transaction status
update_status() {
    local checkout_id=$1
    
    echo -e "${YELLOW}⚠️  Updating transaction status: ${checkout_id}${NC}\n"
    
    local payload=$(cat <<EOF
{
  "action": "update",
  "checkoutRequestId": "${checkout_id}"
}
EOF
)
    
    curl -s -X POST "${API_URL}/payment/status-handler" \
        -H "Content-Type: application/json" \
        -d "$payload" | jq '.' 2>/dev/null || \
    curl -s -X POST "${API_URL}/payment/status-handler" \
        -H "Content-Type: application/json" \
        -d "$payload"
    
    echo ""
}

# Function to bulk sync
bulk_sync() {
    echo -e "${YELLOW}⚙️  Starting bulk sync of all pending transactions...${NC}\n"
    
    curl -s "${API_URL}/payment/sync-status?syncAll=true&limit=100" | \
        jq '.' 2>/dev/null || \
        curl -s "${API_URL}/payment/sync-status?syncAll=true&limit=100"
    
    echo ""
}

# Function to show menu
show_menu() {
    echo -e "${GREEN}What would you like to do?${NC}\n"
    echo "1. Check specific transaction (by checkout ID)"
    echo "2. Check phone number transactions"
    echo "3. Verify M-Pesa code"
    echo "4. Update transaction status"
    echo "5. Bulk sync all pending transactions"
    echo "6. Check API health"
    echo "7. Exit"
    echo ""
}

# Function to check API health
check_api() {
    echo -e "${BLUE}🏥 Checking API health...${NC}\n"
    
    curl -s "${API_URL}/health" | jq '.' 2>/dev/null || \
        curl -s "${API_URL}/debug" | jq '.' 2>/dev/null || \
        echo -e "${RED}❌ API unreachable or not responding${NC}"
    
    echo ""
}

# Main menu
if [ $# -eq 0 ]; then
    # Interactive mode
    while true; do
        show_menu
        read -p "Select option (1-7): " choice
        
        case $choice in
            1)
                read -p "Enter checkout request ID: " checkout_id
                check_transaction "$checkout_id"
                ;;
            2)
                read -p "Enter phone number: " phone
                check_phone "$phone"
                ;;
            3)
                read -p "Enter M-Pesa code: " code
                read -p "Enter phone number (optional): " phone
                verify_code "$code" "$phone"
                ;;
            4)
                read -p "Enter checkout request ID: " checkout_id
                update_status "$checkout_id"
                ;;
            5)
                bulk_sync
                ;;
            6)
                check_api
                ;;
            7)
                echo -e "${GREEN}Goodbye!${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option${NC}"
                ;;
        esac
    done
else
    # Command line mode
    case $1 in
        check)
            check_transaction "$2"
            ;;
        phone)
            check_phone "$2"
            ;;
        verify)
            verify_code "$2" "$3"
            ;;
        update)
            update_status "$2"
            ;;
        sync)
            bulk_sync
            ;;
        health)
            check_api
            ;;
        *)
            echo -e "${RED}Unknown command: $1${NC}"
            echo "Usage: $0 {check|phone|verify|update|sync|health} [args...]"
            exit 1
            ;;
    esac
fi
