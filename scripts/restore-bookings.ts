import { PrismaClient, BookingStatus } from '../prisma/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import * as dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: databaseUrl }),
});

// Bookings to keep cancelled:
// - anything from adenfinity@gmail.com
// - names that are clearly random/test entries
const EXCLUDED_NAMES = ['Γσηδη', 'Ωδηδη', 'δφγφηγ', 'dsffs', 'σδφγφσδγδ'];
const EXCLUDED_EMAIL_PATTERN = 'adenfinity';

async function main() {
  // Preview what will be restored
  const toRestore = await prisma.booking.findMany({
    where: {
      status: BookingStatus.CANCELLED,
      guestEmail: { not: { contains: EXCLUDED_EMAIL_PATTERN } },
      guestName: { notIn: EXCLUDED_NAMES },
    },
    select: {
      id: true,
      guestName: true,
      guestEmail: true,
      checkIn: true,
      checkOut: true,
      totalPrice: true,
      status: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const toSkip = await prisma.booking.findMany({
    where: {
      status: BookingStatus.CANCELLED,
      OR: [
        { guestEmail: { contains: EXCLUDED_EMAIL_PATTERN } },
        { guestName: { in: EXCLUDED_NAMES } },
      ],
    },
    select: { id: true, guestName: true, guestEmail: true },
  });

  console.log('\n=== WILL RESTORE TO CONFIRMED ===');
  toRestore.forEach((b) => {
    console.log(
      `  #${b.id.slice(0, 6)} | ${b.guestName} | ${b.guestEmail} | ${b.checkIn.toISOString().slice(0, 10)} → ${b.checkOut.toISOString().slice(0, 10)} | €${b.totalPrice}`,
    );
  });
  console.log(`\nTotal to restore: ${toRestore.length}`);

  console.log('\n=== WILL REMAIN CANCELLED (excluded) ===');
  toSkip.forEach((b) => {
    console.log(`  #${b.id.slice(0, 6)} | ${b.guestName} | ${b.guestEmail}`);
  });
  console.log(`Total staying cancelled: ${toSkip.length}`);

  if (toRestore.length === 0) {
    console.log('\nNothing to restore.');
    return;
  }

  console.log('\nApplying updates...');
  const result = await prisma.booking.updateMany({
    where: {
      status: BookingStatus.CANCELLED,
      guestEmail: { not: { contains: EXCLUDED_EMAIL_PATTERN } },
      guestName: { notIn: EXCLUDED_NAMES },
    },
    data: { status: BookingStatus.CONFIRMED },
  });

  console.log(`\nDone. Restored ${result.count} bookings to CONFIRMED.`);
}

main()
  .catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma['$disconnect']();
  });
