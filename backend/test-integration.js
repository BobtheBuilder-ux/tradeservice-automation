import { findHubSpotContactByEmail } from './src/services/hubspot-service.js';
import { transformHubSpotLead } from './src/services/lead-transformation-service.js';
import logger from './src/utils/logger.js';
import pkg from 'uuid';
const { v4: uuidv4 } = pkg;

/**
 * Test integration of created test leads with existing workflow
 */
async function testIntegration() {
  console.log('🔄 Testing HubSpot integration with created test leads...');
  
  const testEmails = [
    'miraclechukwudi@gmail.com',
    'bobbieberryccv@gmail.com', 
    'bestscrapers@gmail.com',
    'luckisstarspiff@gmail.com'
  ];
  
  const results = {
    successful: [],
    failed: [],
    summary: {
      total: testEmails.length,
      success: 0,
      failed: 0
    }
  };
  
  for (const email of testEmails) {
    const trackingId = uuidv4();
    
    try {
      console.log(`\n📧 Testing integration for: ${email}`);
      
      // Test 1: Find contact using existing service
      console.log('  🔍 Step 1: Finding contact in HubSpot...');
      const contact = await findHubSpotContactByEmail(email, trackingId);
      
      if (!contact) {
        throw new Error('Contact not found in HubSpot');
      }
      
      console.log(`  ✅ Contact found: ID ${contact.id}`);
      
      // Test 2: Transform contact data
      console.log('  🔄 Step 2: Transforming contact data...');
      const transformedData = transformHubSpotLead(contact, trackingId);
      
      console.log(`  ✅ Data transformed successfully`);
      console.log(`     - Name: ${transformedData.first_name} ${transformedData.last_name}`);
      console.log(`     - Email: ${transformedData.email}`);
      console.log(`     - Company: ${transformedData.company || 'N/A'}`);
      console.log(`     - Source: ${transformedData.source}`);
      
      // Test 3: Verify required fields
      console.log('  ✅ Step 3: Verifying required fields...');
      const requiredFields = ['email', 'first_name', 'last_name'];
      const missingFields = requiredFields.filter(field => !transformedData[field]);
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }
      
      console.log('  ✅ All required fields present');
      
      results.successful.push({
        email,
        contactId: contact.id,
        transformedData,
        trackingId
      });
      
      results.summary.success++;
      console.log(`  🎉 Integration test PASSED for ${email}`);
      
    } catch (error) {
      console.log(`  ❌ Integration test FAILED for ${email}:`);
      console.log(`     Error: ${error.message}`);
      
      results.failed.push({
        email,
        error: error.message,
        trackingId
      });
      
      results.summary.failed++;
    }
  }
  
  // Print summary
  console.log('\n📊 INTEGRATION TEST SUMMARY');
  console.log('=' .repeat(50));
  console.log(`Total tests: ${results.summary.total}`);
  console.log(`✅ Successful: ${results.summary.success}`);
  console.log(`❌ Failed: ${results.summary.failed}`);
  console.log(`📈 Success rate: ${((results.summary.success / results.summary.total) * 100).toFixed(1)}%`);
  
  if (results.failed.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.failed.forEach(failure => {
      console.log(`  - ${failure.email}: ${failure.error}`);
    });
  }
  
  if (results.successful.length > 0) {
    console.log('\n✅ SUCCESSFUL TESTS:');
    results.successful.forEach(success => {
      console.log(`  - ${success.email} (ID: ${success.contactId})`);
    });
  }
  
  // Save results
  const fs = await import('fs');
  fs.writeFileSync('integration-test-results.json', JSON.stringify(results, null, 2));
  console.log('\n💾 Results saved to integration-test-results.json');
  
  console.log('\n🎯 NEXT STEPS:');
  console.log('1. ✅ Test leads are ready for workflow testing');
  console.log('2. 🔄 Run lead polling service to sync with Supabase');
  console.log('3. 🗄️  Verify data appears in database');
  console.log('4. ⚡ Test any automated workflows or triggers');
  
  return results;
}

// Run the test
testIntegration()
  .then(() => {
    console.log('\n🎊 Integration testing completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Integration testing failed:', error);
    process.exit(1);
  });