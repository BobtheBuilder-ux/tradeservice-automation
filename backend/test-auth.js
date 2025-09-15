import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';
let userToken = null;

async function testAuth() {
  console.log('Testing Authentication System...\n');

  // Test 1: Register a new user
  console.log('1. Testing user registration...');
  try {
    const registerResponse = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test User',
        email: 'testuser@example.com',
        password: 'TestPass123!',
        role: 'user'
      })
    });
    
    const registerData = await registerResponse.json();
    console.log('Registration response:', JSON.stringify(registerData, null, 2));
    
    if (registerResponse.ok) {
      console.log('✅ Registration successful');
    } else {
      console.log('❌ Registration failed or user already exists');
    }
  } catch (error) {
    console.log('❌ Registration error:', error.message);
  }

  // Test 2: Login with the user
  console.log('\n2. Testing user login...');
  try {
    const loginResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'testuser@example.com',
        password: 'TestPass123!'
      })
    });
    
    const loginData = await loginResponse.json();
    console.log('Login response:', JSON.stringify(loginData, null, 2));
    
    if (loginResponse.ok && loginData.token) {
      console.log('✅ Login successful');
      userToken = loginData.token;
    } else {
      console.log('❌ Login failed');
    }
  } catch (error) {
    console.log('❌ Login error:', error.message);
  }

  // Test 3: Verify token with /me endpoint
  if (userToken) {
    console.log('\n3. Testing token verification...');
    try {
      const meResponse = await fetch(`${API_BASE}/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const meData = await meResponse.json();
      console.log('Me endpoint response:', JSON.stringify(meData, null, 2));
      
      if (meResponse.ok && meData.user) {
        console.log('✅ Token verification successful');
        console.log('✅ User role from token:', meData.user.role);
      } else {
        console.log('❌ Token verification failed');
      }
    } catch (error) {
      console.log('❌ Token verification error:', error.message);
    }

    // Test 4: Test admin endpoint access
    console.log('\n4. Testing admin endpoint access...');
    try {
      const adminResponse = await fetch(`${API_BASE}/auth/agents`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const adminData = await adminResponse.json();
      console.log('Admin endpoint response:', JSON.stringify(adminData, null, 2));
      
      if (adminResponse.ok) {
        console.log('✅ Admin endpoint access successful');
      } else {
        console.log('❌ Admin endpoint access failed:', adminData.error || 'Unknown error');
      }
    } catch (error) {
      console.log('❌ Admin endpoint error:', error.message);
    }
  }
}

testAuth();