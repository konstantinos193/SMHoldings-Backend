/**
 * Port of App\Support\Logging\SecretScrubber from the Laravel backend.
 * Third parties decide what ends up in our exception messages — a gateway
 * once put a live vault key into a Guzzle message and it reached the log
 * files. Everything written by this logging module passes through here.
 */

export const REDACTED = '[redacted]';

const SECRET_KEY =
  '(?:api[_\\-]?key|apikey|access[_\\-]?token|refresh[_\\-]?token|session[_\\-]?token|id[_\\-]?token|auth[_\\-]?token|token|secret|client[_\\-]?secret|password|passwd|signature|credential)';

// 1. Query string or form body: ?api_key=abc&token=def
const KEY_EQ_VALUE = new RegExp(
  `\\b(${SECRET_KEY})=([^&\\s"'\`\\]\\)>,;]+)`,
  'gi',
);

// 2. JSON object member: "api_key":"abc"
const JSON_MEMBER = new RegExp(
  `(["']${SECRET_KEY}["']\\s*:\\s*)(["'])(?:\\\\.|(?!\\2).)*\\2`,
  'gi',
);

// 3. Header line: Authorization: Bearer abc (runs before the bare-scheme pass,
//    same ordering reason as the PHP original)
const AUTH_HEADER =
  /\b(authorization|proxy-authorization)(\s*[:=]>?\s*)(["']?)[^"'\r\n,\]}]+\3/gi;

// 4. Bare scheme: Bearer abc — scheme word kept, it is diagnostic not secret
const BARE_SCHEME = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9\-._~+/=|]{8,}/gi;

// Card candidates: PAN starting 3-6, 13-19 digits with optional separators
const CARD_CANDIDATE = /(?<![0-9])[3-6](?:[ -]?[0-9]){12,18}(?![0-9])/g;

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// Last four survive: that is what a human matches a card by, and four digits
// are not a card number under PCI DSS 3.3.
function maskCardNumbers(text: string): string {
  return text.replace(CARD_CANDIDATE, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19 || !passesLuhn(digits)) {
      return m;
    }
    return '*'.repeat(digits.length - 4) + digits.slice(-4);
  });
}

export function scrubString(text: string): string {
  if (text === '') return text;
  let out = text.replace(KEY_EQ_VALUE, `$1=${REDACTED}`);
  out = out.replace(JSON_MEMBER, (_m, p1: string, q: string) => `${p1}${q}${REDACTED}${q}`);
  out = out.replace(AUTH_HEADER, `$1$2${REDACTED}`);
  out = out.replace(BARE_SCHEME, `$1 ${REDACTED}`);
  return maskCardNumbers(out);
}

const SECRET_KEY_PARTS = [
  'apikey', 'accesstoken', 'refreshtoken', 'sessiontoken', 'idtoken',
  'authtoken', 'token', 'secret', 'clientsecret', 'password', 'passwd',
  'signature', 'credential',
];

export function isSecretKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[-_ .]/g, '');
  return SECRET_KEY_PARTS.some((part) => normalised.includes(part));
}

// Payloads can nest deep; twelve is a runaway guard, not a truncation.
export function scrubDeep<T>(data: T, depth = 0): T {
  if (depth > 12 || data === null || typeof data !== 'object') {
    return typeof data === 'string' ? (scrubString(data) as T) : data;
  }
  if (Array.isArray(data)) {
    return data.map((v) => scrubDeep(v, depth + 1)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    out[key] = isSecretKey(key)
      ? REDACTED
      : scrubDeep(value, depth + 1);
  }
  return out as T;
}

export function scrubAny(value: unknown): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value !== null && typeof value === 'object') return scrubDeep(value);
  return value;
}
