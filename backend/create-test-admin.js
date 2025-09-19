import { db } from './src/config/index.js';
import { agents } from './src/db/schema.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Generate JWT token
const generateToken = (userId, email, role = 'admin') => {
  return jwt.sign(
    { userId, email, role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

async function createTestAdmin() {
  console.log('Creating test admin...');
  
  try {
    // Check if test admin already exists
    const existingAdmin = await db.select()
      .from(agents)
      .where(eq(agents.email, 'admin@test.com'))
      .limit(1);
    
    if (existingAdmin.length > 0) {
      console.log('Test admin already exists');
      const token = generateToken(existingAdmin[0].id, existingAdmin[0].email, existingAdmin[0].role);
      console.log('Admin Token:', token);
      return;
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    // Create test admin
    const newAdmin = await db.insert(agents).values({
      email: 'admin@test.com',
      passwordHash: hashedPassword,
      firstName: 'Test',
      lastName: 'Admin',
      fullName: 'Test Admin',
      role: 'admin',
      emailVerified: true,
      isActive: true,
      createdAt: new Date()
    }).returning();
    
    if (newAdmin && newAdmin.length > 0) {
      const token = generateToken(newAdmin[0].id, newAdmin[0].email, newAdmin[0].role);
      console.log('✅ Test admin created successfully:');
      console.log('Email: admin@test.com');
      console.log('Password: admin123');
      console.log('Admin Token:', token);
      console.log('Admin ID:', newAdmin[0].id);
    } else {
      console.log('❌ Failed to create test admin');
    }
  } catch (error) {
    console.error('Error creating test admin:', error);
  } finally {
    process.exit(0);
  }
}

// Run the script
createTestAdmin();