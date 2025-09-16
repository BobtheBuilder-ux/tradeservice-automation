import { supabase } from './src/config/index.js';

// Test script to check the actual database schema
async function testSchema() {
  try {
    console.log('Testing database connection and schema...');
    
    // Try to describe the leads table structure
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .limit(0);
    
    if (error) {
      console.error('Error querying leads table:', error);
      return;
    }
    
    console.log('✅ Successfully connected to leads table');
    
    // Try to insert a minimal test record to see what columns are available
    const testRecord = {
      email: 'test@example.com',
      company: 'Test Company',
      source: 'test'
    };
    
    console.log('Testing insert with company field...');
    const { data: insertData, error: insertError } = await supabase
      .from('leads')
      .insert([testRecord])
      .select()
      .single();
    
    if (insertError) {
      console.error('Insert error:', insertError);
    } else {
      console.log('✅ Insert successful:', insertData);
      
      // Clean up test record
      await supabase
        .from('leads')
        .delete()
        .eq('id', insertData.id);
      console.log('✅ Test record cleaned up');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testSchema();