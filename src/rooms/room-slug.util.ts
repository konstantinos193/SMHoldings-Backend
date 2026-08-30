/**
 * Canonical URL slugs for rooms.
 *
 * Public apartment pages used to be addressed by UUID
 * (`/apartments/34cd905a-fda0-41ff-991b-2d2364041fe7`), which is crawlable but
 * unreadable and carries no relevance signal. Rooms now own a stable, readable
 * `slug` and the UUID stays the primary key.
 *
 * The slug is derived deterministically from the room name so the frontend can
 * compute the same value locally and keep working while a deploy is in flight.
 * Keep this rule in sync with `src/lib/apartment-slug.ts` in stefanos-licanto.
 */

/** Floor wording that guests actually type, keyed by what the names contain. */
const FLOOR_ALIASES: Array<[RegExp, string]> = [
  // "Ground Level" is the inventory's wording; "ground floor" is the search term.
  [/ground\s*(?:floor|level)/i, 'ground-floor'],
  [/first\s*floor/i, 'first-floor'],
  [/second\s*floor/i, 'second-floor'],
  [/third\s*floor/i, 'third-floor'],
  [/fourth\s*floor/i, 'fourth-floor'],
  [/penthouse/i, 'penthouse'],
];

/** Combining diacritical marks left behind by NFD normalisation. */
const COMBINING_MARKS = /[̀-ͯ]/g;
/** Straight and curly apostrophes, dropped rather than turned into hyphens. */
const APOSTROPHES = /['‘’]/g;

/** Lowercase, ASCII, hyphen-separated. Greek/accented text is transliterated away. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The preferred slug for a room, e.g. "apartment-01-ground-floor".
 *
 * Falls back to a plain slugification of the name when the name does not follow
 * the "<Type> <number> - <floor>" pattern, and to the UUID prefix when there is
 * no usable name at all.
 */
export function buildRoomSlug(room: {
  id?: string;
  name?: string | null;
  nameEn?: string | null;
}): string {
  const name = (room.nameEn || room.name || '').trim();

  if (name) {
    const numberMatch = name.match(/(\d+)/);
    const floor = FLOOR_ALIASES.find(([pattern]) => pattern.test(name))?.[1];

    if (numberMatch && floor) {
      const padded = numberMatch[1].padStart(2, '0');
      return `apartment-${padded}-${floor}`;
    }

    const plain = slugify(name);
    if (plain) return plain;
  }

  return room.id ? `apartment-${room.id.slice(0, 8)}` : '';
}

/** True when the value looks like a v4-style UUID rather than a slug. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Appends `-2`, `-3`, … until the slug is not already taken.
 * `taken` is consulted rather than the database so callers can batch.
 */
export function ensureUniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;

  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
