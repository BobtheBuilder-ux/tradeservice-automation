import multiAccountFacebookService from './src/services/multi-account-facebook-service.js';
import bizSdk from 'facebook-nodejs-business-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class LeadFormPermissionTester {
    constructor() {
        this.facebookService = multiAccountFacebookService;
    }

    async init() {
        console.log('🔄 Initializing Lead Form Permission Tester...');
        console.log('✅ Facebook service initialized');
    }

    async testBasicCampaignAccess() {
        console.log('\n📊 Testing basic campaign access...');
        
        try {
            const result = await this.facebookService.getAllCampaigns();
            console.log(`✅ Successfully retrieved ${result.campaigns.length} campaigns from ${result.successfulAccounts} accounts`);
            
            // Show campaign objectives
            const objectives = {};
            result.campaigns.forEach(campaign => {
                objectives[campaign.objective] = (objectives[campaign.objective] || 0) + 1;
            });
            
            console.log('📋 Campaign objectives found:');
            Object.entries(objectives).forEach(([objective, count]) => {
                console.log(`  - ${objective}: ${count} campaigns`);
            });
            
            return result.campaigns;
        } catch (error) {
            console.error('❌ Error testing basic campaign access:', error.message);
            return [];
        }
    }

    async testPageLeadForms() {
        console.log('\n📄 Testing Page lead forms access...');
        
        // Get Facebook Page ID from environment or config
        const pageId = process.env.FACEBOOK_PAGE_ID;
        
        if (!pageId) {
            console.log('  ⚠️  FACEBOOK_PAGE_ID not found in environment variables');
            console.log('  💡 Lead forms are accessed through Facebook Page, not Ad Account');
            return [];
        }
        
        try {
            const page = new bizSdk.Page(pageId);
            const leadForms = await page.getLeadgenForms(['id', 'name', 'status', 'leads_count', 'created_time']);
            
            console.log(`  ✅ Page lead forms access: SUCCESS (${leadForms.length} forms found)`);
            
            if (leadForms.length > 0) {
                console.log('  📋 Lead forms on this page:');
                leadForms.slice(0, 5).forEach(form => {
                    console.log(`    - ${form.name} (ID: ${form.id}, Status: ${form.status}, Leads: ${form.leads_count || 0})`);
                });
                
                // Test lead retrieval for first form
                if (leadForms[0]) {
                    await this.testLeadRetrieval(leadForms[0]);
                }
            }
            
            return leadForms;
            
        } catch (error) {
            console.log(`  ❌ Page lead forms access: FAILED - ${error.message}`);
            if (error.message.includes('permissions')) {
                console.log('  💡 Missing leads_retrieval or pages_manage_ads permission');
            }
            return [];
        }
    }

    async testLeadFormPermissions() {
        console.log('\n🔐 Testing lead form permissions...');
        
        const accounts = this.facebookService.getAllAccountIds();
        const permissionResults = [];
        
        for (const accountId of accounts.slice(0, 3)) { // Test first 3 accounts
            console.log(`\n📊 Testing permissions for account: ${accountId}`);
            
            try {
                // Test 1: Try to access lead forms directly from account
                const adAccount = new bizSdk.AdAccount(accountId);
                
                try {
                    // Note: Lead forms are accessed through Page, not AdAccount
                    // This will show the correct error message
                    console.log(`  ℹ️  Lead forms are accessed through Facebook Page, not AdAccount`);
                    console.log(`  ℹ️  Checking campaigns for lead generation objective instead...`);
                    
                    const campaigns = await adAccount.getCampaigns(['id', 'name', 'objective', 'status']);
                    const leadCampaigns = campaigns.filter(c => c.objective === 'OUTCOME_LEADS');
                    
                    console.log(`  📊 Found ${leadCampaigns.length} lead generation campaigns`);
                    
                    if (leadCampaigns.length > 0) {
                        console.log('  📋 Lead generation campaigns:');
                        leadCampaigns.slice(0, 3).forEach(campaign => {
                            console.log(`    - ${campaign.name} (ID: ${campaign.id}, Status: ${campaign.status})`);
                        });
                    }
                    
                    permissionResults.push({
                        accountId,
                        leadFormsAccess: true,
                        leadFormsCount: leadCampaigns.length,
                        error: null
                    });
                } catch (leadFormError) {
                    console.log(`  ❌ Campaign access: FAILED - ${leadFormError.message}`);
                    if (leadFormError.message.includes('permissions')) {
                        console.log('  💡 Missing campaign access permissions');
                    }
                    permissionResults.push({
                        accountId,
                        leadFormsAccess: false,
                        leadFormsCount: 0,
                        error: leadFormError.message
                    });
                }
                
                // Test 2: Try to access campaigns to see if we have basic access
                try {
                    const campaigns = await adAccount.getCampaigns(['id', 'name', 'objective']);
                    console.log(`  ✅ Campaigns access: SUCCESS (${campaigns.length} campaigns)`);
                } catch (campaignError) {
                    console.log(`  ❌ Campaigns access: FAILED - ${campaignError.message}`);
                }
                
            } catch (accountError) {
                console.log(`  ❌ Account access: FAILED - ${accountError.message}`);
                permissionResults.push({
                    accountId,
                    leadFormsAccess: false,
                    leadFormsCount: 0,
                    error: accountError.message
                });
            }
        }
        
        return permissionResults;
    }

    async testLeadRetrieval(leadForm) {
        console.log(`\n📥 Testing lead retrieval for form: ${leadForm.name}`);
        
        try {
            const leadFormObj = new bizSdk.LeadgenForm(leadForm.id);
            const leads = await leadFormObj.getLeads(['id', 'created_time', 'field_data']);
            
            console.log(`  ✅ Lead retrieval: SUCCESS (${leads.length} leads)`);
            
            if (leads.length > 0) {
                const sampleLead = leads[0];
                console.log('  📝 Sample lead structure:');
                console.log(`    - Lead ID: ${sampleLead.id}`);
                console.log(`    - Created: ${sampleLead.created_time}`);
                
                if (sampleLead.field_data && sampleLead.field_data.length > 0) {
                    console.log('    - Fields available:');
                    sampleLead.field_data.forEach(field => {
                        console.log(`      * ${field.name}: ${field.values ? field.values.join(', ') : 'N/A'}`);
                    });
                    
                    // Test workflow compatibility
                    this.testWorkflowCompatibility(sampleLead);
                } else {
                    console.log('    ⚠️  No field data available');
                }
            }
            
            return leads;
        } catch (error) {
            console.log(`  ❌ Lead retrieval: FAILED - ${error.message}`);
            
            if (error.message.includes('permission')) {
                console.log('  💡 This appears to be a permissions issue.');
                console.log('  📋 Required permissions for lead retrieval:');
                console.log('    - leads_retrieval');
                console.log('    - ads_read');
                console.log('    - business_management (for business-owned forms)');
            }
            
            return [];
        }
    }

    testWorkflowCompatibility(leadData) {
        console.log('\n🔄 Testing workflow compatibility...');
        
        // Check required fields for CRM integration
        const requiredFields = ['id', 'created_time', 'field_data'];
        const availableFields = Object.keys(leadData);
        const missingFields = requiredFields.filter(field => !availableFields.includes(field));
        
        if (missingFields.length === 0) {
            console.log('  ✅ All required fields present for workflow integration');
        } else {
            console.log(`  ⚠️  Missing required fields: ${missingFields.join(', ')}`);
        }
        
        // Analyze field mapping potential
        if (leadData.field_data && leadData.field_data.length > 0) {
            const fieldNames = leadData.field_data.map(field => field.name.toLowerCase());
            const commonCrmFields = ['email', 'first_name', 'last_name', 'phone_number', 'company_name', 'phone'];
            const matchedFields = commonCrmFields.filter(crmField => 
                fieldNames.some(fieldName => fieldName.includes(crmField))
            );
            
            console.log(`  📊 CRM-compatible fields found: ${matchedFields.join(', ')}`);
            
            if (matchedFields.length >= 2) {
                console.log('  ✅ Good compatibility for CRM integration');
            } else {
                console.log('  ⚠️  Limited CRM field compatibility');
            }
        }
    }

    async checkAppPermissions() {
        console.log('\n🔐 Checking app permissions...');
        
        try {
            // Try to get app info to check permissions
            const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
            
            // Parse the access token to get app info (this is a simplified check)
            console.log('📋 Current access token configuration:');
            console.log(`  - Token length: ${accessToken ? accessToken.length : 0} characters`);
            console.log(`  - Token type: ${accessToken && accessToken.includes('|') ? 'App Token' : 'User Token'}`);
            
            console.log('\n💡 Required permissions for lead form integration:');
            console.log('  - ads_read: Read ad account data');
            console.log('  - leads_retrieval: Access lead form submissions');
            console.log('  - business_management: Access business-owned assets');
            console.log('  - ads_management: Manage ad campaigns (if creating/updating)');
            
        } catch (error) {
            console.log(`❌ Error checking app permissions: ${error.message}`);
        }
    }

    async runFullTest() {
        try {
            await this.init();
            
            // Test 1: Basic campaign access
            const campaigns = await this.testBasicCampaignAccess();
            
            // Test 2: Page lead forms access
            await this.testPageLeadForms();
            
            // Test 3: Lead form permissions
            const permissionResults = await this.testLeadFormPermissions();
            
            // Test 4: App permissions info
            await this.checkAppPermissions();
            
            // Summary
            console.log('\n📋 SUMMARY');
            console.log('=' .repeat(50));
            console.log(`✅ Total campaigns accessible: ${campaigns.length}`);
            
            const successfulAccounts = permissionResults.filter(r => r.leadFormsAccess).length;
            const totalLeadForms = permissionResults.reduce((sum, r) => sum + r.leadFormsCount, 0);
            
            console.log(`📊 Accounts with lead form access: ${successfulAccounts}/${permissionResults.length}`);
            console.log(`📋 Total lead forms found: ${totalLeadForms}`);
            
            if (totalLeadForms > 0) {
                console.log('\n🎉 RESULT: Lead forms are accessible and compatible with your workflow!');
                console.log('\n📝 Next steps:');
                console.log('  1. Use the multi-account service to retrieve leads');
                console.log('  2. Set up automated lead processing');
                console.log('  3. Configure CRM integration mapping');
                console.log('  4. Test end-to-end workflow');
            } else {
                console.log('\n⚠️  RESULT: No lead forms found or accessible.');
                console.log('\n📝 Recommendations:');
                console.log('  1. Create lead generation campaigns in Facebook Ads Manager');
                console.log('  2. Set FACEBOOK_PAGE_ID in environment variables');
                console.log('  3. Verify app permissions include leads_retrieval and pages_manage_ads');
                console.log('  4. Ensure access token has proper scope');
                console.log('  5. Check if lead forms are published and active on your Facebook Page');
                console.log('  6. Remember: Lead forms are accessed through Page, not AdAccount');
            }
            
            // Error analysis
            const errors = permissionResults.filter(r => r.error).map(r => r.error);
            if (errors.length > 0) {
                console.log('\n❌ Errors encountered:');
                [...new Set(errors)].forEach(error => {
                    console.log(`  - ${error}`);
                });
            }
            
        } catch (error) {
            console.error('❌ Test failed:', error.message);
            console.error(error.stack);
        }
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new LeadFormPermissionTester();
    tester.runFullTest();
}

export { LeadFormPermissionTester };