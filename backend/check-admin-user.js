import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  console.log('SUPABASE_URL:', !!supabaseUrl);
  console.log('SUPABASE_SERVICE_ROLE_KEY:', !!supabaseKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAdminUser() {
  try {
    console.log('Checking admin user...');
    
    // Get user data
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'admin@test.com');
    
    if (error) {
      console.error('Error fetching user:', error);
      return;
    }
    
    if (users.length === 0) {
      console.log('❌ Admin user not found');
      return;
    }
    
    const user = users[0];
    console.log('User found:');
    console.log('- ID:', user.id);
    console.log('- Email:', user.email);
    console.log('- Role:', user.role);
    console.log('- Email Verified:', user.email_verified);
    console.log('- Created At:', user.created_at);
    
    if (!user.email_verified) {
      console.log('\n🔧 Updating user to be email verified...');
      
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({ email_verified: true })
        .eq('id', user.id)
        .select();
      
      if (updateError) {
        console.error('Error updating user:', updateError);
      } else {
        console.log('✅ User email verification updated successfully');
      }
    } else {
      console.log('✅ User is already email verified');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkAdminUser();