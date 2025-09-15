import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdminUser() {
  try {
    console.log('Creating verified admin user...');
    
    // Hash the password
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    // Create the admin user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: 'admin@test.com',
        password_hash: hashedPassword,
        name: 'Admin User',
        role: 'admin',
        email_verified: true
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        console.log('Admin user already exists, updating verification status...');
        
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({ 
            email_verified: true,
            role: 'admin'
          })
          .eq('email', 'admin@test.com')
          .select()
          .single();
        
        if (updateError) {
          console.error('Error updating user:', updateError);
        } else {
          console.log('✅ Admin user updated successfully');
          console.log('User ID:', updatedUser.id);
        }
      } else {
        console.error('Error creating user:', error);
      }
    } else {
      console.log('✅ Admin user created successfully');
      console.log('User ID:', user.id);
      console.log('Email:', user.email);
      console.log('Role:', user.role);
      console.log('Email Verified:', user.email_verified);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createAdminUser();