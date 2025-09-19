import { db } from './src/config/index.js';
import { agents } from './src/db/schema.js';
import { eq } from 'drizzle-orm';

console.log('Verifying admin user email...');

try {
  const result = await db.update(agents)
    .set({
      emailVerified: true,
      verificationToken: null,
      agentToken: null,
      agentTokenExpires: null,
      updatedAt: new Date()
    })
    .where(eq(agents.email, 'admin@test.com'))
    .returning({
      id: agents.id,
      email: agents.email,
      emailVerified: agents.emailVerified,
      role: agents.role
    });

  if (result && result.length > 0) {
    console.log('✅ Admin user verified successfully:');
    console.log(result[0]);
  } else {
    console.log('❌ No admin user found with email admin@test.com');
  }
} catch (error) {
  console.error('Error verifying admin user:', error);
} finally {
  process.exit(0);
}