# Pixel Garden Planner

A retro pixel-art garden planner with companion planting intelligence, USDA zone filtering, and cloud sync.

## Features

- **Companion Planting** -- 100+ plants with companion/enemy relationships, auto-fill algorithm places crops intelligently
- **Zone Filtering** -- USDA Hardiness Zones 1a-13b, plants filtered to your region
- **Garden Beds** -- Raised, in-ground, or pot beds with configurable dimensions, soil type, and sun exposure
- **Layout Editor** -- Draw garden boundaries, place fences, trellises, paths, sprinklers, and structures
- **Cloud Sync** -- Register an account to save gardens to the cloud, auto-syncs as you work
- **Local Storage** -- Works offline with browser storage fallback
- **File Export** -- Save/load garden plans as JSON files

## Tech Stack

- Next.js 15 / React 19 / TypeScript
- Tailwind CSS with custom pixel-art theme
- Neon (PostgreSQL serverless) for cloud storage
- Session-based auth with HMAC-SHA256 signing and bcrypt password hashing

## Getting Started

```bash
npm install
```

Create a `.env.local` file:

```
DATABASE_URL=your_neon_connection_string
SESSION_SECRET=your_64_char_random_string
```

Run the database migration:

```bash
npx tsx src/lib/migrate.ts
```

Start the dev server:

```bash
npm run dev
```

## Deploy to Vercel

Set `DATABASE_URL` and `SESSION_SECRET` as environment variables in your Vercel project settings, then deploy.
