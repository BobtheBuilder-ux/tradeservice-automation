import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';
let adminToken = null;

async function testAdminEndpoints() {
  console.log('Testing Admin Endpoints...\n');

  // Test 1: Register admin user
  console.log('1. Creating admin user...');
  try {
    const registerResponse = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Admin User',
        email: 'berrybobbiechuks@gmail.com',
        password: 'Password12...$',
        role: 'admin'
      })
    });
    
    const registerData = await registerResponse.json();
    console.log('Admin registration response:', JSON.stringify(registerData, null, 2));
    
    if (registerResponse.ok && registerData.token) {
      console.log('✅ Admin user created successfully');
      adminToken = registerData.token;
    } else {
      console.log('❌ Admin registration failed or user already exists');
      
      // Try to login instead
      console.log('\nTrying to login with existing admin...');
      const loginResponse = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: 'berrybobbiechuks@gmail.com',
          password: 'Password12...$'
        })
      });
      
      const loginData = await loginResponse.json();
      console.log('Login response:', JSON.stringify(loginData, null, 2));
      if (loginResponse.ok && loginData.token) {
        console.log('✅ Admin login successful');
        adminToken = loginData.token;
      } else {
        console.log('❌ Admin login failed:', loginData.error || 'Unknown error');
        return;
      }
    }
  } catch (error) {
    console.log('❌ Admin setup error:', error.message);
    return;
  }

  // Test 2: Get agents list
  console.log('\n2. Testing get agents endpoint...');
  try {
    const agentsResponse = await fetch(`${API_BASE}/admin/agents`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const agentsData = await agentsResponse.json();
    console.log('Agents response:', JSON.stringify(agentsData, null, 2));
    
    if (agentsResponse.ok) {
      console.log('✅ Get agents successful');
    } else {
      console.log('❌ Get agents failed:', agentsData.error);
    }
  } catch (error) {
    console.log('❌ Get agents error:', error.message);
  }

  // Test 3: Create new agent
  console.log('\n3. Testing create agent endpoint...');
  try {
    const createAgentResponse = await fetch(`${API_BASE}/admin/agents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Agent',
        email: 'testagent@example.com',
        role: 'agent'
      })
    });
    
    const createAgentData = await createAgentResponse.json();
    console.log('Create agent response:', JSON.stringify(createAgentData, null, 2));
    
    if (createAgentResponse.ok) {
      console.log('✅ Create agent successful');
    } else {
      console.log('❌ Create agent failed:', createAgentData.error);
    }
  } catch (error) {
    console.log('❌ Create agent error:', error.message);
  }

  // Test 4: Get leads
  console.log('\n4. Testing get leads endpoint...');
  try {
    const leadsResponse = await fetch(`${API_BASE}/admin/leads`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const leadsData = await leadsResponse.json();
    console.log('Leads response:', JSON.stringify(leadsData, null, 2));
    
    if (leadsResponse.ok) {
      console.log('✅ Get leads successful');
    } else {
      console.log('❌ Get leads failed:', leadsData.error);
    }
  } catch (error) {
    console.log('❌ Get leads error:', error.message);
  }
}

testAdminEndpoints();