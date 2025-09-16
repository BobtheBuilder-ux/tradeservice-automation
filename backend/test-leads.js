import { db } from './src/config/index.js';
import { leads } from './src/db/schema.js';
import { desc } from 'drizzle-orm';

async function checkLeads() {
  try {
    console.log('🔍 Checking current leads in database...');
    
    const data = await db
      .select({
        id: leads.id,
        email: leads.email,
        first_name: leads.firstName,
        last_name: leads.lastName,
        hubspot_contact_id: leads.hubspotContactId,
        created_at: leads.createdAt,
        source: leads.source,
        status: leads.status
      })
      .from(leads)
      .orderBy(desc(leads.createdAt))
      .limit(10);
    
    console.log(`📊 Found ${data.length} leads in database:`);
    console.log('\n' + '='.repeat(80));
    
    data.forEach((lead, index) => {
      console.log(`${index + 1}. ${lead.email}`);
      console.log(`   Name: ${lead.first_name || 'N/A'} ${lead.last_name || 'N/A'}`);
      console.log(`   HubSpot ID: ${lead.hubspot_contact_id || 'N/A'}`);
      console.log(`   Source: ${lead.source || 'N/A'}`);
      console.log(`   Status: ${lead.status || 'N/A'}`);
      console.log(`   Created: ${new Date(lead.created_at).toLocaleString()}`);
      console.log('   ' + '-'.repeat(60));
    });
    
    // Check for HubSpot leads specifically
    const { data: hubspotLeads, error: hubspotError } = await supabase
      .from('leads')
      .select('*')
      .eq('source', 'hubspot_crm');
    
    if (!hubspotError) {
      console.log(`\n🎯 HubSpot leads: ${hubspotLeads.length} total`);
    }
    
  } catch (err) {
    console.error('❌ Script error:', err);
  }
}

checkLeads();