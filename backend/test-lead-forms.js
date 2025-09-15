import multiAccountFacebookService from './src/services/multi-account-facebook-service.js';
import bizSdk from 'facebook-nodejs-business-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class LeadFormTester {
    constructor() {
        this.facebookService = multiAccountFacebookService;
    }

    async init() {
        console.log('🔄 Initializing Lead Form Tester...');
        // Service is already initialized as a singleton
        console.log('✅ Facebook service initialized');
    }

    async findAdsWithLeadForms() {
        console.log('\n🔍 Searching for ads with lead forms...');
        const adsWithLeadForms = [];
        
        try {
            const accounts = this.facebookService.getAllAccountIds();
            
            for (const accountId of accounts) {
                console.log(`\n📊 Checking account: ${accountId}`);
                
                try {
                    // Get campaigns for this account
                    const adAccount = new bizSdk.AdAccount(accountId);
                    const campaigns = await adAccount.getCampaigns(['id', 'name', 'status', 'objective']);
                    
                    for (const campaign of campaigns) {
                        // Check if campaign objective is LEAD_GENERATION
                        if (campaign.objective === 'LEAD_GENERATION') {
                            console.log(`  📋 Lead generation campaign found: ${campaign.name}`);
                            
                            // Get ad sets for this campaign
                            const campaignObj = new bizSdk.Campaign(campaign.id);
                            const adSets = await campaignObj.getAdSets(['id', 'name', 'status']);
                            
                            for (const adSet of adSets) {
                                if (adSet.status === 'ACTIVE') {
                                    // Get ads for this ad set
                                    const adSetObj = new bizSdk.AdSet(adSet.id);
                                    const ads = await adSetObj.getAds(['id', 'name', 'status', 'creative']);
                                    
                                    for (const ad of ads) {
                                        if (ad.status === 'ACTIVE') {
                                            // Check if ad has lead form
                                            try {
                                                const creativeObj = new bizSdk.AdCreative(ad.creative.id);
                                                const creative = await creativeObj.get(['object_story_spec']);
                                                
                                                if (creative.object_story_spec && creative.object_story_spec.link_data && creative.object_story_spec.link_data.call_to_action) {
                                                    const cta = creative.object_story_spec.link_data.call_to_action;
                                                    if (cta.type === 'SIGN_UP' || cta.type === 'LEARN_MORE') {
                                                        adsWithLeadForms.push({
                                                            accountId,
                                                            campaignId: campaign.id,
                                                            campaignName: campaign.name,
                                                            adSetId: adSet.id,
                                                            adSetName: adSet.name,
                                                            adId: ad.id,
                                                            adName: ad.name,
                                                            creativeId: ad.creative.id
                                                        });
                                                        console.log(`    ✅ Active ad with potential lead form: ${ad.name}`);
                                                    }
                                                }
                                            } catch (creativeError) {
                                                console.log(`    ⚠️  Could not check creative for ad ${ad.name}: ${creativeError.message}`);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (accountError) {
                    console.log(`  ❌ Error checking account ${accountId}: ${accountError.message}`);
                }
            }
        } catch (error) {
            console.error('❌ Error finding ads with lead forms:', error.message);
        }
        
        return adsWithLeadForms;
    }

    async testLeadFormAccess(adData) {
        console.log(`\n🧪 Testing lead form access for ad: ${adData.adName}`);
        
        try {
            // Try to get lead forms associated with the ad
            const adObj = new bizSdk.Ad(adData.adId);
            const leadForms = await adObj.getLeadgenForms(['id', 'name', 'status', 'leads_count', 'created_time']);
            
            if (leadForms && leadForms.length > 0) {
                console.log(`  📋 Found ${leadForms.length} lead form(s):`);
                
                for (const form of leadForms) {
                    console.log(`    - Form: ${form.name} (ID: ${form.id})`);
                    console.log(`      Status: ${form.status}`);
                    console.log(`      Leads Count: ${form.leads_count || 0}`);
                    console.log(`      Created: ${form.created_time}`);
                    
                    // Test lead retrieval
                    await this.testLeadRetrieval(form.id, form.name);
                }
                
                return leadForms;
            } else {
                console.log('  ℹ️  No lead forms found for this ad');
                return [];
            }
        } catch (error) {
            console.log(`  ❌ Error accessing lead forms: ${error.message}`);
            return [];
        }
    }

    async testLeadRetrieval(formId, formName) {
        console.log(`\n📥 Testing lead retrieval for form: ${formName}`);
        
        try {
            const leadFormObj = new bizSdk.LeadgenForm(formId);
            const leads = await leadFormObj.getLeads(['id', 'created_time', 'field_data']);
            
            console.log(`  📊 Retrieved ${leads.length} leads`);
            
            if (leads.length > 0) {
                console.log('  📝 Sample lead data structure:');
                const sampleLead = leads[0];
                console.log(`    Lead ID: ${sampleLead.id}`);
                console.log(`    Created: ${sampleLead.created_time}`);
                
                if (sampleLead.field_data && sampleLead.field_data.length > 0) {
                    console.log('    Fields:');
                    sampleLead.field_data.forEach(field => {
                        console.log(`      - ${field.name}: ${field.values ? field.values.join(', ') : 'N/A'}`);
                    });
                } else {
                    console.log('    ⚠️  No field data available');
                }
            }
            
            return leads;
        } catch (error) {
            console.log(`  ❌ Error retrieving leads: ${error.message}`);
            if (error.message.includes('permissions')) {
                console.log('  💡 This might be a permissions issue. Check if your app has leads_retrieval permission.');
            }
            return [];
        }
    }

    async testWorkflowIntegration(leadData) {
        console.log('\n🔄 Testing workflow integration...');
        
        // Test data structure compatibility
        console.log('📋 Checking data structure compatibility:');
        
        const requiredFields = ['id', 'created_time', 'field_data'];
        const missingFields = requiredFields.filter(field => !leadData.hasOwnProperty(field));
        
        if (missingFields.length === 0) {
            console.log('  ✅ All required fields present');
        } else {
            console.log(`  ⚠️  Missing fields: ${missingFields.join(', ')}`);
        }
        
        // Test field mapping
        if (leadData.field_data && leadData.field_data.length > 0) {
            console.log('\n📊 Field mapping analysis:');
            const fieldTypes = {};
            
            leadData.field_data.forEach(field => {
                fieldTypes[field.name] = field.values ? field.values.length : 0;
            });
            
            console.log('  Available fields:', Object.keys(fieldTypes));
            
            // Check for common CRM fields
            const commonFields = ['email', 'first_name', 'last_name', 'phone_number', 'company_name'];
            const availableCommonFields = commonFields.filter(field => fieldTypes.hasOwnProperty(field));
            
            console.log(`  ✅ Common CRM fields found: ${availableCommonFields.join(', ')}`);
            
            if (availableCommonFields.length < 2) {
                console.log('  ⚠️  Limited common fields available for CRM integration');
            }
        }
    }

    async runFullTest() {
        try {
            await this.init();
            
            // Find ads with lead forms
            const adsWithLeadForms = await this.findAdsWithLeadForms();
            
            if (adsWithLeadForms.length === 0) {
                console.log('\n❌ No active ads with lead forms found');
                console.log('💡 Recommendations:');
                console.log('   - Create a lead generation campaign');
                console.log('   - Ensure ads are active and have lead forms attached');
                console.log('   - Check if your app has proper permissions');
                return;
            }
            
            console.log(`\n✅ Found ${adsWithLeadForms.length} active ad(s) with potential lead forms`);
            
            // Test each ad's lead forms
            for (const adData of adsWithLeadForms.slice(0, 3)) { // Test first 3 ads
                const leadForms = await this.testLeadFormAccess(adData);
                
                if (leadForms.length > 0) {
                    // Test lead retrieval for first form
                    const leads = await this.testLeadRetrieval(leadForms[0].id, leadForms[0].name);
                    
                    if (leads.length > 0) {
                        // Test workflow integration with first lead
                        await this.testWorkflowIntegration(leads[0]);
                    }
                }
            }
            
            console.log('\n🎉 Lead form testing completed!');
            console.log('\n📋 Summary:');
            console.log(`   - Active ads with lead forms: ${adsWithLeadForms.length}`);
            console.log('   - Lead retrieval: Tested');
            console.log('   - Workflow compatibility: Analyzed');
            
        } catch (error) {
            console.error('❌ Test failed:', error.message);
            console.error(error.stack);
        }
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new LeadFormTester();
    tester.runFullTest();
}

export { LeadFormTester };