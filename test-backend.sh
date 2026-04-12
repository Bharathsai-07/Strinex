#!/bin/bash

# Backend Authentication Test Script
# Usage: ./test-backend.sh [backend_url] [clerk_token]

BACKEND_URL="${1:-http://localhost:5000}"
TEST_TOKEN="${2:-your_test_token_here}"

echo "🚀 Backend Authentication Test"
echo "================================"
echo "Backend URL: $BACKEND_URL"
echo ""

# Test 1: Health check
echo "📍 Test 1: Health Check (No Auth)"
curl -i -X GET "$BACKEND_URL/health" \
  -H "Origin: https://strinex.onrender.com" \
  2>/dev/null | head -20
echo ""
echo "---"
echo ""

# Test 2: Protected endpoint without token (should fail with 401)
echo "📍 Test 2: Get Runs Without Token (Should Fail)"
curl -i -X GET "$BACKEND_URL/runs" \
  -H "Origin: https://strinex.onrender.com" \
  -H "Content-Type: application/json" \
  2>/dev/null | head -20
echo ""
echo "---"
echo ""

# Test 3: Protected endpoint with Bearer token
echo "📍 Test 3: Get Runs With Bearer Token"
curl -i -X GET "$BACKEND_URL/runs" \
  -H "Origin: https://strinex.onrender.com" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  2>/dev/null | head -30
echo ""
echo "---"
echo ""

# Test 4: CORS preflight
echo "📍 Test 4: CORS Preflight (OPTIONS)"
curl -i -X OPTIONS "$BACKEND_URL/runs" \
  -H "Origin: https://strinex.onrender.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  2>/dev/null | head -20
echo ""
echo "---"
echo ""

echo "✅ Tests completed!"
echo ""
echo "📝 Expected Results:"
echo "   - Test 1: Should return 200 with CORS headers"
echo "   - Test 2: Should return 401 Unauthorized"
echo "   - Test 3: Should return 200 with runs data (if token is valid)"
echo "   - Test 4: Should return CORS headers allowing the origin"
