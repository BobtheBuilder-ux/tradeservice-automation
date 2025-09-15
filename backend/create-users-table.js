import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const createUsersTable = async () => {
  try {
    console.log('Creating users table...');
    
    // Read the SQL file
    const sqlContent = fs.readFileSync('./create_users_table.sql', 'utf8');
    
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: sqlContent
    });
    
    if (error) {
      console.error('Error creating users table:', error);
      
      // Try alternative approach - execute SQL directly
      console.log('Trying alternative approach...');
      
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'user',
          email_verified BOOLEAN DEFAULT false,
          verification_token VARCHAR(255),
          agent_token VARCHAR(255),
          agent_token_expires TIMESTAMPTZ,
          last_login TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          
          CONSTRAINT valid_user_role CHECK (role IN ('admin', 'user', 'agent', 'manager'))
        );
      `;
      
      // Try using the SQL editor approach
      const { data: tableData, error: tableError } = await supabase
        .from('_sql')
        .select('*')
        .limit(1);
        
      if (tableError) {
        console.log('Direct SQL execution not available. Creating table using individual operations...');
        
        // Since we can't execute raw SQL, let's check if the table exists by trying to query it
        const { data: testData, error: testError } = await supabase
          .from('users')
          .select('id')
          .limit(1);
          
        if (testError && testError.message.includes('relation "users" does not exist')) {
          console.error('Users table does not exist and cannot be created via Supabase client.');
          console.log('Please create the users table manually in the Supabase dashboard using the SQL editor.');
          console.log('SQL to execute:');
          console.log(createTableSQL);
          process.exit(1);
        } else if (testError) {
          console.error('Error checking users table:', testError);
          process.exit(1);
        } else {
          console.log('Users table already exists!');
        }
      }
    } else {
      console.log('Users table created successfully!');
    }
    
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
};

createUsersTable();