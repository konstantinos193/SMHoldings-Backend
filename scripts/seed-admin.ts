import { PrismaClient } from '../prisma/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the seed script');
}

// Configure Prisma client for Turso/libsql
const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: databaseUrl }),
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function seedAdminUser() {
  console.log('🌱 Seeding admin user...');

  const email = 'konstantinosblavakis@gmail.com';
  const password = 'Kk.25102002?';

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      console.log(`✅ User ${email} already exists. Updating to admin role...`);

      const hashedPassword = await hashPassword(password);
      const updatedUser = await prisma.user.update({
        where: { email },
        data: {
          role: 'ADMIN',
          isActive: true,
          password: hashedPassword,
          name: existingUser.name || 'Konstantinos Blavakis',
          avatar: existingUser.avatar || 'https://ui-avatars.com/api/?name=Konstantinos+Blavakis&background=3b82f6&color=fff'
        }
      });

      console.log(`✅ Updated ${email} to admin role`);
      console.log(`   Name: ${updatedUser.name}`);
      console.log(`   Role: ${updatedUser.role}`);
      console.log(`   Status: ${updatedUser.isActive ? 'Active' : 'Inactive'}`);
    } else {
      console.log(`📝 Creating new admin user: ${email}`);
      
      // Create new admin user
      const hashedPassword = await hashPassword(password);
      const newUser = await prisma.user.create({
        data: {
          email,
          name: 'Konstantinos Blavakis',
          password: hashedPassword,
          role: 'ADMIN',
          isActive: true,
          avatar: 'https://ui-avatars.com/api/?name=Konstantinos+Blavakis&background=3b82f6&color=fff',
          phone: '+30 210 000 0000',
          emailVerified: true,
          preferredCurrency: 'EUR',
          preferredLanguage: 'en'
        }
      });

      console.log(`✅ Created admin user:`);
      console.log(`   Email: ${newUser.email}`);
      console.log(`   Name: ${newUser.name}`);
      console.log(`   Role: ${newUser.role}`);
      console.log(`   Status: ${newUser.isActive ? 'Active' : 'Inactive'}`);
      console.log(`   Password: ${password}`);
    }

    // Always upsert lincantobook@gmail.com with correct password
    const lincantoEmail = 'lincantobook@gmail.com';
    const lincantoPassword = await hashPassword('admin1');
    await prisma.user.upsert({
      where: { email: lincantoEmail },
      create: {
        email: lincantoEmail,
        name: 'Lincanto Admin',
        password: lincantoPassword,
        role: 'ADMIN',
        isActive: true,
        emailVerified: true,
        preferredCurrency: 'EUR',
        preferredLanguage: 'en',
      },
      update: {
        password: lincantoPassword,
        role: 'ADMIN',
        isActive: true,
      },
    });
    console.log(`✅ Upserted ${lincantoEmail} with password admin1`);

    console.log('\n🎉 Admin user seeding completed successfully!');

  } catch (error: any) {
    console.error('❌ Error seeding admin user:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedAdminUser()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
