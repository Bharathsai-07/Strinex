/**
 * Test script for backend authentication
 * Tests health endpoint and authenticated endpoints with Bearer token
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const TEST_TOKEN = process.env.TEST_TOKEN || 'your_clerk_token_here';

async function testEndpoint(name, url, options = {}) {
    console.log(`\n🧪 Testing: ${name}`);
    console.log(`   URL: ${url}`);
    
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://strinex.onrender.com',
                ...options.headers,
            },
        });

        console.log(`   Status: ${response.status} ${response.statusText}`);
        console.log(`   CORS Headers:`);
        console.log(`     Access-Control-Allow-Origin: ${response.headers.get('access-control-allow-origin')}`);
        console.log(`     Access-Control-Allow-Credentials: ${response.headers.get('access-control-allow-credentials')}`);

        const data = await response.json().catch(() => null);
        if (data) {
            console.log(`   Response:`, JSON.stringify(data, null, 2));
        }

        return { success: response.ok, status: response.status, data };
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function runTests() {
    console.log('🚀 Backend Authentication Test Suite');
    console.log('=====================================');
    console.log(`Backend URL: ${BACKEND_URL}`);
    console.log(`Test Token: ${TEST_TOKEN.substring(0, 20)}...`);

    // Test 1: Health check (no auth required)
    await testEndpoint(
        'Health Check (No Auth)',
        `${BACKEND_URL}/health`,
        { method: 'GET' }
    );

    // Test 2: Health check with credentials
    await testEndpoint(
        'Health Check (With Credentials)',
        `${BACKEND_URL}/health`,
        { 
            method: 'GET',
            credentials: 'include'
        }
    );

    // Test 3: Authenticated endpoint without token (should fail)
    await testEndpoint(
        'Get Runs (No Token - Should Fail)',
        `${BACKEND_URL}/runs`,
        { 
            method: 'GET',
            credentials: 'include'
        }
    );

    // Test 4: Authenticated endpoint with Bearer token
    await testEndpoint(
        'Get Runs (With Bearer Token)',
        `${BACKEND_URL}/runs`,
        { 
            method: 'GET',
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${TEST_TOKEN}`
            }
        }
    );

    // Test 5: Leaderboard (authenticated)
    await testEndpoint(
        'Get Leaderboard (With Bearer Token)',
        `${BACKEND_URL}/leaderboard?period=total&limit=10`,
        { 
            method: 'GET',
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${TEST_TOKEN}`
            }
        }
    );

    // Test 6: CORS preflight simulation
    console.log('\n🧪 Testing: CORS Preflight (OPTIONS)');
    console.log(`   URL: ${BACKEND_URL}/runs`);
    try {
        const response = await fetch(`${BACKEND_URL}/runs`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'https://strinex.onrender.com',
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'authorization,content-type',
            },
        });
        console.log(`   Status: ${response.status}`);
        console.log(`   CORS Headers:`);
        console.log(`     Access-Control-Allow-Origin: ${response.headers.get('access-control-allow-origin')}`);
        console.log(`     Access-Control-Allow-Methods: ${response.headers.get('access-control-allow-methods')}`);
        console.log(`     Access-Control-Allow-Headers: ${response.headers.get('access-control-allow-headers')}`);
        console.log(`     Access-Control-Allow-Credentials: ${response.headers.get('access-control-allow-credentials')}`);
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
    }

    console.log('\n✅ Test suite completed!');
    console.log('\n📝 Notes:');
    console.log('   - Health endpoint should work without authentication');
    console.log('   - Protected endpoints require valid Bearer token');
    console.log('   - CORS should allow origin: https://strinex.onrender.com');
    console.log('   - credentials: include should be supported');
}

// Run tests
runTests().catch(console.error);
