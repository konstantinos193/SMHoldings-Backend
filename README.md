<p align="center">
  <img src="https://smholdings.gr/logoetc.png" alt="SM Holdings" width="300" />
</p>

<h1 align="center">stefanos-backend</h1>

<p align="center">
  <strong>The backend that refuses to die, much like the technical debt it carries.</strong>
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.4.0-blue.svg" />
  <img alt="Node" src="https://img.shields.io/badge/node-20%2B-green.svg" />
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-11-red.svg" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6.0-blue.svg" />
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-7.8-purple.svg" />
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-7.2-darkgreen.svg" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-black.svg" />
</p>

---

## Overview

A backend API for the SM Holdings hospitality and real estate platform, currently powering the **Incanto Hotel** in Preveza, Greece. It manages rooms, bookings, users, payments, content, media, cleaning schedules, external booking imports, audit logs, and all the other things that keep you awake at 3 AM wondering why the production database just decided to take a vacation.

Built with NestJS because we wanted the verbosity of Java with the runtime errors of JavaScript. The best of both worlds, really. Ships with 21 modules, because modular architecture means modular suffering.

---

## Tech Stack

Because listing dependencies is the closest thing we have to a personality.

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Runtime** | Node.js | 18+ | Executing our regrets |
| **Framework** | NestJS | 11.1.24 | Enterprise-grade decorators |
| **Language** | TypeScript | 6.0.3 | Pretending JavaScript has types |
| **ORM** | Prisma + LibSQL adapter | 7.8.0 | Making SQL feel like a distant memory |
| **Database** | Turso (LibSQL) | via adapter | Where the data goes to live, and occasionally die |
| **Database** | MongoDB | 7.2.0 | The other database, because one was not enough |
| **Auth** | Passport + JWT | 0.7.0 / 11.0.5 | Keeping the barbarians at the gate |
| **Validation** | Zod + class-validator | 4.4.3 / 0.15.1 | Trust issues, formalized |
| **Payments** | Stripe | 22.2.0 | Taking money from people, legally |
| **Email** | Nodemailer | 8.0.10 | Sending emails into the void |
| **File Storage** | Cloudinary | 2.10.0 | Where property photos go to be optimized beyond recognition |
| **File Uploads** | Multer | 2.1.1 | Accepting files from strangers on the internet |
| **API Docs** | Swagger | 11.4.4 | Documentation nobody reads |
| **Security** | Helmet | 8.2.0 | A false sense of security |
| **HTTP Client** | Axios | 1.16.1 | For when you need someone else's problems too |
| **Logging** | Morgan | 1.10.1 | Recording the exact moment things went wrong |
| **Rate Limiting** | Throttler | 6.5.0 | Protecting the server from its own users |

---

## Features

- **Property Management** -- Full CRUD with multilingual support (Greek/English). Create properties, read them, update them, and delete them when the client changes their mind for the fourth time. Supports nine property types from apartments to luxury investments. Status-based filtering (Active, Inactive, Maintenance, Suspended) on all list queries.
- **Booking System** -- Conflict resolution included. Multi-source bookings (direct, Booking.com, Airbnb, VRBO, Expedia, manual). Advanced query filtering by status, date range, and full-text search across guest name, email, and booking ID. Bulk export endpoint for reporting. The only conflict it cannot resolve is between you and the project deadline.
- **External Booking Imports** -- Pull bookings from third-party platforms. Commission tracking, iCal sync, and deduplication. Because managing one booking source was too simple.
- **User Management** -- Multi-role system (Admin, Property Owner, Manager, User). MFA support, Stripe Connect accounts, email/phone verification. A hierarchy of suffering, now with two-factor authentication.
- **Room Management** -- Dynamic rooms per property with individual pricing, availability rules, content, virtual tour URLs, and occupancy tracking. Public availability search with date-range and guest-count filtering. Rooms within rooms. It is rooms all the way down.
- **Property Groups** -- Subholdings for organizing properties under a single owner. Corporate real estate, but make it nested.
- **Content Management** -- Full CMS with pages, sections, SEO metadata, and a media library. Multilingual, because bugs should be accessible to everyone.
- **Media Library** -- Centralized media management with categories, thumbnails, alt text, and content associations. Cloudinary on the backend, chaos on the frontend.
- **Editions & Knowledge** -- Dynamic editions and knowledge articles with categories, tags, and read times. Content marketing, automated.
- **Services** -- Manage service offerings with multilingual descriptions, features, and pricing.
- **Payments** -- Stripe integration with Connect payouts, refunds, and multiple payment methods (credit/debit card, Apple Pay, Google Pay, PayPal, bank transfer, Stripe Link). The money flows in. The bugs flow out. Circle of life.
- **Analytics** -- Revenue, occupancy, ratings, and profit margins per property. Daily, weekly, monthly, quarterly, yearly. Numbers on a dashboard. Whether they mean anything is a philosophical question.
- **Cleaning Schedules** -- Track cleaning frequency, assignments, and history per property. Cleanliness ratings on reviews. Someone has to care about the towels.
- **Reviews** -- Multi-dimensional ratings (cleanliness, accuracy, communication, location, value). Host responses. Public/private visibility. Feedback, formalized.
- **Maintenance Requests** -- Track what is broken with priority levels and status tracking. The list is longer than this README.
- **Notifications** -- Booking confirmations, cancellations, payments, maintenance, reviews, messages, system updates. So users know exactly when something has gone wrong.
- **Messaging** -- Communication between guests and hosts tied to bookings. Text, images, files, system messages. Therapy not included.
- **Audit Logging** -- Every action tracked with before/after changes, IP addresses, and user agents. Big Brother, but for property management.
- **Settings** -- Key-value configuration store with typed values and groups. For when environment variables are not enough.
- **Admin Panel** -- God mode. Dashboard stats, system-wide management.

---

## Getting Started

### Prerequisites

- **Node.js 20+** -- If you are still on Node 18, it reached EOL in April 2025. If you are still on Node 14, this README cannot help you. Nobody can.
- **pnpm** -- The package manager this project actually uses. `npm install` will work but you will live with the shame.
- A **Turso** database (or compatible LibSQL) for the relational schema.
- A **MongoDB** instance for document-based operations.
- The will to live (optional but recommended).

### Installation

```bash
# Clone the repository. You know the drill.
git clone <repository-url>
cd stefanos-backend

# Install dependencies. This will take a while.
# Enough time to question your career choices.
pnpm install

# Copy the environment template.
cp env.example .env

# Fill in the .env file with real values.
# If you commit your secrets to git, that is on you.
```

### Database Setup

The application uses a dual-database architecture. Prisma with the LibSQL adapter handles the relational schema (Turso), while MongoDB handles document-based operations (stats, aggregations). Yes, two databases. No, we will not be taking questions.

```bash
# Generate the Prisma client
npx prisma generate

# Initialize the database schema
pnpm db:init

# Run migrations (if upgrading from a previous schema)
pnpm db:migrate

# Seed with sample data (optional, but recommended
# unless you enjoy staring at empty tables)
pnpm db:seed
```

### Running the Server

```bash
# Development (with hot reload, because life is short)
pnpm dev

# Production (for the brave)
pnpm start:prod

# Debug mode (for when printf debugging has failed you)
pnpm start:debug
```

The API will be available at `http://localhost:3001` with the global prefix `/api`. Swagger docs live at `http://localhost:3001/docs`. If neither is responding, check if something else is already squatting on that port. It usually is.

---

## Scripts

All the commands you will forget exist and then rediscover six months later.

| Command | What It Does |
|---|---|
| `pnpm build` | Generates Prisma client, then compiles TypeScript. Prays nothing breaks. |
| `pnpm build:render` | Same as build, but named specifically for Render deployments. |
| `pnpm dev` | Development server with hot reload. Your most-used command. |
| `pnpm start` | Starts the server like a normal person. |
| `pnpm start:prod` | Starts from compiled output. Production mode. No safety net. |
| `pnpm start:debug` | Attaches a debugger. For when `console.log` is not enough. |
| `pnpm format` | Prettier. Because tabs vs spaces wars are beneath us. |
| `pnpm lint` | ESLint. It will find problems you did not know you had. |
| `pnpm test` | Runs Jest. Results may vary. |
| `pnpm test:watch` | Runs tests on every save. Masochism, automated. |
| `pnpm test:cov` | Coverage report. A number to make management happy. |
| `pnpm test:debug` | Inspector-based debugging for tests. For the truly desperate. |
| `pnpm test:e2e` | End-to-end tests. The full horror show. |
| `pnpm test:endpoints` | Runs the endpoint smoke tests via Node. Quick sanity check. |
| `pnpm db:init` | Initializes the database schema. |
| `pnpm db:seed` | Seeds the database with sample data via tsx. |
| `pnpm db:seed:admin` | Seeds the admin user specifically. For when you locked yourself out. |
| `pnpm db:migrate` | Runs database migrations for schema changes. |

---

## Project Structure

```
src/
  app.module.ts              # The root of all evil (21 module imports)
  app.controller.ts          # Health checks, public stats, and existential dread
  main.ts                    # NestJS entry point. Swagger, CORS (with Vercel preview support), Helmet, the works.
  index.ts                   # Legacy Express entry point. Still here. Still judging. Also has Vercel preview CORS.
  seed.ts                    # Populates the database with beautiful lies

  admin/                     # God mode
  analytics/                 # Graphs that go up and to the right (hopefully)
  auth/                      # Keeping unauthorized users out (authorized ones too, sometimes)
    dto/                     # Data Transfer Objects. Bureaucracy for your data.
    strategies/              # Passport strategies. JWT, local, existential.
    utils/                   # Auth utilities. Where the magic happens.
  bookings/                  # The money-making module (search, filter, export, conflict detection)
  cleaning/                  # Towel logistics
  common/                    # Shared infrastructure
    decorators/              # Custom decorators. Because NestJS did not have enough.
    dto/                     # Shared DTOs
    filters/                 # Global exception filter. Catches everything, fixes nothing.
    guards/                  # JWT auth, roles, rate limiting
    interceptors/            # Request/response transformation
    middleware/              # Express middleware wrappers
    utils/                   # Audit, financial, pagination, password, price utilities
  content/                   # CMS pages, sections, SEO
  database/                  # Database module, MongoDB service, helpers, types
  editions/                  # Dynamic content editions
  external-bookings/         # Third-party booking imports (Booking.com, Airbnb, etc.)
  knowledge/                 # Knowledge articles
  lib/                       # Core libraries: DB connections, retries, validations
  logs/                      # Audit log module
  media/                     # Media library management
  payments/                  # Stripe integration and payment processing
  prisma/                    # Prisma service wrapper
  properties/                # Property CRUD and management
  property-groups/           # Subholding / property group management
  reviews/                   # Review system with multi-dimensional ratings
  rooms/                     # Dynamic room management (public search, occupancy, availability)
  routes/                    # Legacy Express route handlers (auth, bookings, etc.)
  services/                  # Service offerings management
  settings/                  # Key-value configuration store
  upload/                    # File upload handling
  users/                     # User CRUD and profile management

prisma/
  schema.prisma              # The single source of truth. 880 lines. Guard it with your life.
  generated/                 # Prisma client output. Do not touch.

scripts/
  init-db.js                 # Database initialization. Run once. Pray twice.
  migrate-db.js              # Schema migrations. For when the schema evolves faster than your sanity.
  clear-bookings.ts          # Nuclear option for the bookings table.
  seed-incanto-rooms.ts      # Seeds Incanto hotel rooms. The hotel that started it all.
  refresh-availability.ts    # Refreshes room availability data. Because stale dates help nobody.
```

---

## Dependencies

### Production (38 packages of varying trustworthiness)

The full list lives in `package.json`. Here are the highlights, or lowlights, depending on your perspective:

- **@nestjs/*** `^11.x` -- The framework. Twelve packages deep across production and dev. We are committed.
- **@prisma/client** + **@prisma/adapter-libsql** `^7.8.0` -- ORM with Turso adapter. Because writing raw SQL builds character, but we are not here for character development.
- **mongodb** `^7.2.0` -- The other database driver. For when one database is not enough to lose sleep over.
- **bcryptjs** `^3.0.3` -- Password hashing. The one thing we actually take seriously.
- **stripe** `^22.2.0` -- Payment processing. Handle with care and a lawyer.
- **zod** `^4.4.3` -- Schema validation. Trust nothing. Validate everything.
- **multer** `^2.1.1` -- File uploads. What could possibly go wrong.
- **cloudinary** `^2.10.0` -- Image management. Optimizing photos until they are unrecognizable.
- **nodemailer** `^8.0.10` -- Email delivery. Into spam folders worldwide.

### Development (30 packages that exist solely to yell at you)

- **typescript** `^6.0.3` -- The language. The myth. The compiler errors.
- **jest** `^30.4.2` -- Testing framework. Your tests pass locally. They will not pass in CI.
- **eslint** `^10.4.1` -- Linter. 847 rules, all of them angry.
- **prettier** `^3.8.3` -- Code formatter. Ending arguments since 2017.
- **prisma** `^7.8.0` -- CLI tools. For when you need to regenerate the client for the ninth time today.
- **supertest** `^7.2.2` -- HTTP testing. Simulating users so you do not have to.
- **tsx** `^4.22.3` -- TypeScript execution. For running seed scripts without a build step.

---

## Environment Variables

See `env.example` for the full template. If that file does not exist, someone has made a grave mistake.

Key variables include:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Your database connection string. Supports both MongoDB (`mongodb+srv://...`) and Turso/LibSQL (`libsql://...`). Treat it like a nuclear launch code. |
| `JWT_SECRET` | If this leaks, everything leaks. |
| `JWT_EXPIRES_IN` | Token expiry. Default `7d`. Adjust based on your paranoia level. |
| `PORT` | Server port. Default `3001`. |
| `NODE_ENV` | `development` or `production`. Determines how much error detail you get. |
| `FRONTEND_URL` | Comma-separated allowed origins for CORS. Vercel preview deployments for licanto/incanto/smholdings are auto-allowed. |
| `ADMIN_URL` | Admin panel URL. Always allowed through CORS because admins are special. |
| `STRIPE_SECRET_KEY` | Real money. Real consequences. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification. |
| `CLOUDINARY_CLOUD_NAME` | Image storage credentials. |
| `CLOUDINARY_API_KEY` | Less catastrophic if leaked, but still embarrassing. |
| `CLOUDINARY_API_SECRET` | The secret part of the not-so-secret image storage. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Email configuration. For sending password resets into spam folders worldwide. |
| `AIRBNB_CLIENT_ID` / `AIRBNB_CLIENT_SECRET` | External booking integration for the external bookings module. |

---

## API Documentation

Swagger UI is available at `/docs` when the server is running. It documents every endpoint across all 21 modules. Nobody reads it, but it is there, silently judging your API calls.

The API uses the global prefix `/api`, so all endpoints are at `http://localhost:3001/api/*`.

Key endpoint groups:
- `/api/health` -- Health check and public stats
- `/api/auth` -- Registration, login, MFA
- `/api/users` -- User management
- `/api/properties` -- Property CRUD
- `/api/bookings` -- Booking management
- `/api/external-bookings` -- Third-party booking imports
- `/api/rooms` -- Dynamic room management (includes public endpoints: list, search by availability, occupancy)
- `/api/property-groups` -- Subholding management
- `/api/payments` -- Stripe payments and payouts
- `/api/reviews` -- Review system
- `/api/cleaning` -- Cleaning schedules
- `/api/content` -- CMS content management
- `/api/media` -- Media library
- `/api/editions` -- Dynamic editions
- `/api/knowledge` -- Knowledge articles
- `/api/services` -- Service offerings
- `/api/analytics` -- Property analytics
- `/api/settings` -- Configuration management
- `/api/logs` -- Audit logs
- `/api/upload` -- File uploads
- `/api/admin` -- Admin operations

---

## Deployment

Deployed via **Docker on a VPS**, with GitHub Actions handling CI/CD. On every push to `main`:

1. A Docker image is built and pushed to GitHub Container Registry (GHCR).
2. The workflow SSHes into the VPS and runs `deploy.sh` to pull and swap the new image.

**Required GitHub repository secrets:**

| Secret | Description |
|---|---|
| `VPS_HOST` | Server IP or hostname |
| `VPS_USER` | SSH user (e.g. `root`) |
| `VPS_SSH_KEY` | Private SSH key for the server |

All application environment variables are managed on the VPS directly (via Docker `--env-file` or equivalent), not in this repository.

**Note:** `prisma migrate deploy` is not compatible with the LibSQL adapter — do not add it to the build or start command, no matter how tempting it looks.

---

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Write code that works.
4. Write tests that prove it works.
5. Open a Pull Request.
6. Wait for review.
7. Address feedback.
8. Wait for re-review.
9. Merge.
10. Discover it broke something else.

---

## License

MIT. Do whatever you want with it. We are not responsible for the consequences.

---

<p align="center"><sub>Built with mass amounts of mass-produced coffee and mass-produced existential dread by the SM Holdings engineering team.</sub></p>

---

<p align="center">
  Created by <a href="https://adinfinity.gr/">adinfinity</a>
</p>
