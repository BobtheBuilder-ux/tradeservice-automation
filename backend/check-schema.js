import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  try {
    console.log('🔍 Checking current database schema...');
    
    // Check leads table structure using raw SQL
    const { data: columns, error: columnsError } = await supabase
      .rpc('exec_sql', {
        sql: `SELECT column_name, data_type, is_nullable 
              FROM information_schema.columns 
              WHERE table_name = 'leads' AND table_schema = 'public' 
              ORDER BY ordinal_position`
      });
    
    if (columnsError) {
      console.log('❌ Error checking columns with RPC, trying direct query...');
      // Try a simpler approach - just check if table exists and get sample data
      const { data: sampleData, error: sampleError } = await supabase
        .from('leads')
        .select('*')
        .limit(1);
      
      if (sampleError) {
        console.error('❌ Error accessing leads table:', sampleError);
      } else {
        console.log('✅ Leads table is accessible');
        if (sampleData.length > 0) {
          console.log('📋 Sample lead columns:', Object.keys(sampleData[0]));
        } else {
          console.log('📋 Leads table exists but is empty');
        }
      }
    } else {
      console.log('📋 Leads table columns:');
      columns.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
      });
    }
    
    // Check if process_orphaned_new_leads function exists
    console.log('\n🔧 Functions check:');
    try {
      const { data: functionResult, error: functionError } = await supabase
        .rpc('process_orphaned_new_leads');
      
      if (functionError) {
        console.log('❌ process_orphaned_new_leads function NOT found or failed:', functionError.message);
      } else {
        console.log('✅ process_orphaned_new_leads function exists and works');
        console.log('📊 Function result:', functionResult);
        if (functionResult && functionResult.length > 0) {
          console.log('📋 Sample result columns:', Object.keys(functionResult[0]));
        }
      }
    } catch (error) {
      console.log('❌ Error testing function:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkSchema();