#!/bin/bash

# Facebook Ads API Test Script
# Tests the campaign creation and management endpoints

BASE_URL="http://localhost:3001"
API_URL="$BASE_URL/api/facebook-ads"

echo "🚀 Testing Facebook Ads API Integration"
echo "======================================"
echo ""

# Test 1: Create a new campaign
echo "📝 Test 1: Creating a new Facebook campaign..."
CREATE_RESPONSE=$(curl -s -X POST "$API_URL/campaigns" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Lead Generation Campaign",
    "objective": "OUTCOME_LEADS",
    "status": "PAUSED"
  }')

echo "Response: $CREATE_RESPONSE"
echo ""

# Extract campaign ID from response (if successful)
CAMPAIGN_ID=$(echo $CREATE_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ ! -z "$CAMPAIGN_ID" ]; then
  echo "✅ Campaign created successfully with ID: $CAMPAIGN_ID"
else
  echo "❌ Failed to create campaign"
fi
echo ""

# Test 2: List all campaigns
echo "📋 Test 2: Listing all campaigns..."
LIST_RESPONSE=$(curl -s -X GET "$API_URL/campaigns")
echo "Response: $LIST_RESPONSE"
echo ""

# Test 3: Quick create lead generation campaign
echo "⚡ Test 3: Quick create lead generation campaign..."
QUICK_CREATE_RESPONSE=$(curl -s -X POST "$API_URL/campaigns/quick-create" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Auto Lead Gen Test",
    "budget": 50
  }')

echo "Response: $QUICK_CREATE_RESPONSE"
echo ""

# Test 4: Update campaign status (if we have a campaign ID)
if [ ! -z "$CAMPAIGN_ID" ]; then
  echo "🔄 Test 4: Updating campaign status..."
  UPDATE_RESPONSE=$(curl -s -X PUT "$API_URL/campaigns/$CAMPAIGN_ID/status" \
    -H "Content-Type: application/json" \
    -d '{
      "status": "ACTIVE"
    }')
  
  echo "Response: $UPDATE_RESPONSE"
  echo ""
else
  echo "⏭️  Test 4: Skipped (no campaign ID available)"
  echo ""
fi

# Test 5: Get campaign insights (if we have a campaign ID)
if [ ! -z "$CAMPAIGN_ID" ]; then
  echo "📊 Test 5: Getting campaign insights..."
  INSIGHTS_RESPONSE=$(curl -s -X GET "$API_URL/campaigns/$CAMPAIGN_ID/insights")
  
  echo "Response: $INSIGHTS_RESPONSE"
  echo ""
else
  echo "⏭️  Test 5: Skipped (no campaign ID available)"
  echo ""
fi

# Test 6: Test error handling with invalid data
echo "🚫 Test 6: Testing error handling with invalid data..."
ERROR_RESPONSE=$(curl -s -X POST "$API_URL/campaigns" \
  -H "Content-Type: application/json" \
  -d '{
    "objective": "INVALID_OBJECTIVE"
  }')

echo "Response: $ERROR_RESPONSE"
echo ""

echo "✨ Facebook Ads API testing completed!"
echo ""
echo "📋 Summary:"
echo "- Campaign Creation: Tested"
echo "- Campaign Listing: Tested"
echo "- Quick Create: Tested"
echo "- Status Update: $([ ! -z "$CAMPAIGN_ID" ] && echo "Tested" || echo "Skipped")"
echo "- Campaign Insights: $([ ! -z "$CAMPAIGN_ID" ] && echo "Tested" || echo "Skipped")"
echo "- Error Handling: Tested"
echo ""
echo "🔗 Available endpoints:"
echo "- POST $API_URL/campaigns"
echo "- GET $API_URL/campaigns"
echo "- POST $API_URL/campaigns/quick-create"
echo "- PUT $API_URL/campaigns/{id}/status"
echo "- GET $API_URL/campaigns/{id}/insights"