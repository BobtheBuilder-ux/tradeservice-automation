#!/bin/bash

# Backend API Testing Agent
# This script tests the authentication and email functionality

set -e  # Exit on any error

# Configuration
BACKEND_URL="http://localhost:3000"
TEST_EMAIL="luckisstarspiff@gmail.com"
TEST_PASSWORD="testpassword123"
TEST_NAME="Test User"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Test functions
test_server_health() {
    print_header "Testing Server Health"
    
    response=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/")
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        print_success "Server is running"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        print_error "Server health check failed (HTTP $http_code)"
        echo "$body"
        return 1
    fi
}

test_health_endpoint() {
    print_header "Testing Health Endpoint"
    
    response=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/health")
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        print_success "Health endpoint working"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        print_error "Health endpoint failed (HTTP $http_code)"
        echo "$body"
    fi
}

test_email_connection() {
    print_header "Testing Email SMTP Connection"
    
    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$TEST_EMAIL\"}" \
        "$BACKEND_URL/api/auth/test-email")
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        print_success "Email test successful"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        print_error "Email test failed (HTTP $http_code)"
        echo "$body"
    fi
}

test_user_registration() {
    print_header "Testing User Registration"
    
    # Generate unique email for testing
    timestamp=$(date +%s)
    unique_email="test+$timestamp@example.com"
    
    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$unique_email\",
            \"password\": \"$TEST_PASSWORD\",
            \"name\": \"$TEST_NAME\"
        }" \
        "$BACKEND_URL/api/auth/register")
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "201" ]; then
        print_success "User registration successful"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        
        # Extract token for further tests
        export AUTH_TOKEN=$(echo "$body" | jq -r '.token' 2>/dev/null || echo "")
        export TEST_USER_EMAIL="$unique_email"
        
        if [ "$AUTH_TOKEN" != "null" ] && [ "$AUTH_TOKEN" != "" ]; then
            print_info "Auth token received: ${AUTH_TOKEN:0:20}..."
        fi
    else
        print_error "User registration failed (HTTP $http_code)"
        echo "$body"
    fi
}

test_user_login() {
    print_header "Testing User Login"
    
    if [ -z "$TEST_USER_EMAIL" ]; then
        print_warning "No test user email available, skipping login test"
        return
    fi
    
    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$TEST_USER_EMAIL\",
            \"password\": \"$TEST_PASSWORD\"
        }" \
        "$BACKEND_URL/api/auth/login")
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        print_success "User login successful"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        print_error "User login failed (HTTP $http_code)"
        echo "$body"
    fi
}

test_password_reset_request() {
    print_header "Testing Password Reset Request"
    
    if [ -z "$TEST_USER_EMAIL" ]; then
        print_warning "No test user email available, using default email"
        test_email="$TEST_EMAIL"
    else
        test_email="$TEST_USER_EMAIL"
    fi
    
    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$test_email\"}" \
        "$BACKEND_URL/api/auth/forgot-password")
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        print_success "Password reset request successful"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        print_error "Password reset request failed (HTTP $http_code)"
        echo "$body"
    fi
}

test_invalid_endpoints() {
    print_header "Testing Invalid Endpoints"
    
    # Test invalid login
    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"invalid@example.com\",
            \"password\": \"wrongpassword\"
        }" \
        "$BACKEND_URL/api/auth/login")
    
    http_code=$(echo "$response" | tail -n 1)
    
    if [ "$http_code" = "401" ]; then
        print_success "Invalid login properly rejected"
    else
        print_error "Invalid login should return 401, got $http_code"
    fi
    
    # Test missing fields
    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{}" \
        "$BACKEND_URL/api/auth/register")
    
    http_code=$(echo "$response" | tail -n 1)
    
    if [ "$http_code" = "400" ]; then
        print_success "Missing fields properly rejected"
    else
        print_error "Missing fields should return 400, got $http_code"
    fi
}

run_all_tests() {
    print_header "Starting Backend API Tests"
    print_info "Backend URL: $BACKEND_URL"
    print_info "Test Email: $TEST_EMAIL"
    
    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        print_warning "jq not found. JSON responses will not be formatted."
        print_info "Install jq for better output: brew install jq (macOS) or apt-get install jq (Ubuntu)"
    fi
    
    # Run tests
    test_server_health
    test_health_endpoint
    test_email_connection
    test_user_registration
    test_user_login
    test_password_reset_request
    test_invalid_endpoints
    
    print_header "Test Summary"
    print_info "All tests completed. Check the output above for any failures."
    print_info "If email tests failed, check your Hostinger SMTP configuration in backend/.env"
    print_info "Make sure the backend server is running on $BACKEND_URL"
}

# Main execution
case "${1:-all}" in
    "health")
        test_server_health
        test_health_endpoint
        ;;
    "email")
        test_email_connection
        ;;
    "auth")
        test_user_registration
        test_user_login
        test_password_reset_request
        ;;
    "invalid")
        test_invalid_endpoints
        ;;
    "all")
        run_all_tests
        ;;
    *)
        echo "Usage: $0 [health|email|auth|invalid|all]"
        echo "  health  - Test server health endpoints"
        echo "  email   - Test email functionality"
        echo "  auth    - Test authentication endpoints"
        echo "  invalid - Test error handling"
        echo "  all     - Run all tests (default)"
        exit 1
        ;;
esac