import { db } from './src/config/index.js';
import { agents } from './src/db/schema.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Generate JWT token
const generateToken = (userId, email, role = 'agent') => {
  return jwt.sign(
    { userId, email, role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

async function createTestAgent() {
  console.log('Creating test agent...');
  
  try {
    // Check if test agent already exists
    const existingAgent = await db.select()
      .from(agents)
      .where(eq(agents.email, 'agent@test.com'))
      .limit(1);
    
    if (existingAgent.length > 0) {
      console.log('Test agent already exists');
      const token = generateToken(existingAgent[0].id, existingAgent[0].email, existingAgent[0].role);
      console.log('Agent Token:', token);
      return;
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash('agent123', 12);
    
    // Create test agent
    const newAgent = await db.insert(agents).values({
      email: 'agent@test.com',
      passwordHash: hashedPassword,
      firstName: 'Test',
      lastName: 'Agent',
      fullName: 'Test Agent',
      role: 'agent',
      emailVerified: true,
      isActive: true,
      createdAt: new Date()
    }).returning();
    
    if (newAgent && newAgent.length > 0) {
      const token = generateToken(newAgent[0].id, newAgent[0].email, newAgent[0].role);
      console.log('✅ Test agent created successfully:');
      console.log('Email: agent@test.com');
      console.log('Password: agent123');
      console.log('Agent Token:', token);
      console.log('Agent ID:', newAgent[0].id);
    } else {
      console.log('❌ Failed to create test agent');
    }
  } catch (error) {
    console.error('Error creating test agent:', error);
  } finally {
    process.exit(0);
  }
}

// Import eq function
import { eq } from 'drizzle-orm';

// Run the script
createTestAgent();