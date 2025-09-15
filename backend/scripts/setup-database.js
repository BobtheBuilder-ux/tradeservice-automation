import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const createUsersTableSQL = `
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_verified BOOLEAN DEFAULT false,
    verification_token TEXT,
    reset_token TEXT,
    reset_token_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON public.users(verification_token);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON public.users(reset_token);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own data" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON public.users
    FOR UPDATE USING (auth.uid() = id);
`;

async function setupDatabase() {
  console.log('Setting up database...');
  
  try {
    // Execute the SQL directly using rpc
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: createUsersTableSQL
    });
    
    if (error) {
      console.log('Direct SQL execution failed. Trying alternative approach...');
      console.log('Error:', error.message);
      
      // Try to create table using individual operations
      const { error: tableError } = await supabase
        .from('users')
        .select('id')
        .limit(1);
      
      if (tableError && tableError.message.includes('Could not find the table')) {
        console.log('\n=== MANUAL DATABASE SETUP REQUIRED ===');
        console.log('Please run this SQL in your Supabase SQL editor:');
        console.log(createUsersTableSQL);
        console.log('\nAfter running the SQL, try user registration again.');
        console.log('=== END MANUAL SETUP ===\n');
      } else {
        console.log('Users table appears to exist already.');
      }
    } else {
      console.log('Database setup completed successfully!');
      console.log('Users table created with proper indexes and policies.');
    }
  } catch (error) {
    console.error('Database setup error:', error);
    console.log('\n=== MANUAL DATABASE SETUP REQUIRED ===');
    console.log('Please run this SQL in your Supabase SQL editor:');
    console.log(createUsersTableSQL);
    console.log('\nAfter running the SQL, try user registration again.');
    console.log('=== END MANUAL SETUP ===\n');
  }
}

// Run the setup
setupDatabase();