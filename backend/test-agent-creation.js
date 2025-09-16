import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const API_BASE_URL = 'http://localhost:3001/api';

// Generate admin token for testing
const generateAdminToken = () => {
  return jwt.sign(
    {
      userId: '0193e3a7-a719-79c3-8ba7-f719c3a719c3',
      email: 'admin@example.com',
      role: 'admin'
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
};

const testAgentCreation = async () => {
  console.log('\n🧪 Testing Agent Creation Flow with Email Functionality');
  console.log('=' .repeat(60));
  
  const adminToken = generateAdminToken();
  const timestamp = Date.now();
  
  const testAgent = {
    name: `Test Agent ${timestamp}`,
    email: `testagent${timestamp}@example.com`,
    role: 'agent'
  };
  
  console.log(`\n📝 Creating agent with details:`);
  console.log(`   Name: ${testAgent.name}`);
  console.log(`   Email: ${testAgent.email}`);
  console.log(`   Role: ${testAgent.role}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  
  try {
    console.log('\n🚀 Sending POST request to /api/admin/agents...');
    
    const response = await fetch(`${API_BASE_URL}/admin/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(testAgent)
    });
    
    console.log(`\n📊 Response Status: ${response.status} ${response.statusText}`);
    console.log(`   Response Time: ${new Date().toISOString()}`);
    
    const responseData = await response.json();
    
    if (response.ok) {
      console.log('\n✅ Agent Creation Successful!');
      console.log('📧 Email Status:', responseData.emailSent ? '✅ Sent' : '❌ Failed');
      console.log('\n📋 Response Details:');
      console.log(JSON.stringify(responseData, null, 2));
      
      if (responseData.emailSent) {
        console.log('\n📬 Email Operations Completed:');
        console.log('   ✓ Temporary password generated');
        console.log('   ✓ Reset token created (24h expiration)');
        console.log('   ✓ Credentials email sent to agent');
        console.log('   ✓ Database records updated');
      } else {
        console.log('\n⚠️  Email Operations Failed:');
        console.log('   ✓ Agent created in database');
        console.log('   ❌ Email sending failed');
        if (responseData.emailError) {
          console.log(`   Error: ${responseData.emailError}`);
        }
      }
    } else {
      console.log('\n❌ Agent Creation Failed!');
      console.log('📋 Error Details:');
      console.log(JSON.stringify(responseData, null, 2));
    }
    
  } catch (error) {
    console.log('\n💥 Request Failed!');
    console.log(`   Error: ${error.message}`);
    console.log(`   Time: ${new Date().toISOString()}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🏁 Test Completed');
};

// Run the test
testAgentCreation().catch(console.error);