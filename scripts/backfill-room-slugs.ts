/**
 * Assigns a public URL slug to every room that does not have one.
 *
 * Public apartment pages moved off UUID URLs
 * (`/apartments/34cd905a-fda0-41ff-991b-2d2364041fe7`) onto readable ones
 * (`/apartments/apartment-01-ground-floor`). Existing rows predate the `slug`
 * column, so they need filling in once after `prisma db push`.
 *
 * Idempotent: rooms that already have a slug are left untouched. Run with
 * `--dry` to print what would change without writing.
 *
 *   pnpm tsx scripts/backfill-room-slugs.ts [--dry]
 */
import { PrismaClient } from '../prisma/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import * as dotenv from 'dotenv';
import { buildRoomSlug, ensureUniqueSlug } from '../src/rooms/room-slug.util';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL! }),
});

async function main() {
  const dryRun = process.argv.includes('--dry');

  const rooms = await prisma.room.findMany({
    select: { id: true, name: true, nameEn: true, slug: true },
    orderBy: { name: 'asc' },
  });

  const taken = new Set(rooms.map((r) => r.slug).filter((s): s is string => Boolean(s)));
  let updated = 0;

  for (const room of rooms) {
    if (room.slug) {
      console.log(`  keep  ${room.slug.padEnd(34)} ${room.name}`);
      continue;
    }

    const slug = ensureUniqueSlug(buildRoomSlug(room), taken);
    taken.add(slug);

    if (!dryRun) {
      await prisma.room.update({ where: { id: room.id }, data: { slug } });
    }
    updated += 1;
    console.log(`  ${dryRun ? 'would' : 'set  '} ${slug.padEnd(34)} ${room.name}`);
  }

  console.log(`\n${dryRun ? 'Would update' : 'Updated'} ${updated} of ${rooms.length} rooms.`);

  if (!dryRun && updated > 0) {
    console.log(
      '\nNext: redeploy the public site so its sitemap and internal links use the new slugs.',
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
