# Subscription Manager

Track recurring subscriptions: what they cost per month and per year, when they renew, and which ones need attention soon.

- Monthly and yearly billing cycles, normalised in the spend summary
- Renewal reminders with snooze and dismiss, plus optional browser notifications
- Charts for spend by category and upcoming spend
- Search, filter and sort the list; category suggestions while typing
- Light, dark and system themes

Built with SvelteKit (Svelte 5), TypeScript, Tailwind CSS v4, Prisma and SQLite. See [CLAUDE.md](CLAUDE.md) for the code conventions.

## Setup

```sh
npm install
npm run db:migrate   # create the SQLite database and apply migrations
npm run db:seed      # optional: sample data
```

The database location comes from `DATABASE_URL` (see `.env.example`). A relative `file:./dev.db` is fine for `npm run dev`, but a built app (`npm run build`) resolves relative paths against its own bundle directory, so use an **absolute** path (`file:/path/to/prisma/dev.db`) for any production build.

`npm install` runs `prisma generate` automatically. If the generated client ever looks stale (type errors about missing model fields), run `npm run db:generate`.

## Development

```sh
npm run dev
```

## Checks

```sh
npm run check        # svelte-check
npm run lint         # prettier + eslint
npm run test:unit    # vitest (unit and component tests)
npm run test:e2e     # playwright (builds and previews the app)
```

The e2e suite uses its own database, `prisma/e2e.db`, which is deleted and rebuilt from the migrations at the start of every run, so it never touches your development data.

## Database

Schema changes go in `prisma/schema.prisma`, followed by `npx prisma migrate dev --name <description>`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests: type check (`npm run check`) and lint in one job, unit and Playwright end-to-end tests in another. Failed runs upload `test-results/` as an artifact.

## Self-hosting with Docker

```sh
docker compose up -d --build
```

Then open <http://localhost:3000>. The image runs `prisma migrate deploy` on start, so a fresh volume gets its schema and upgrades apply automatically. The SQLite database lives in the `subdata` volume at `/data/app.db`; back it up by copying that file (stop the container first for a consistent copy).

Without Compose:

```sh
docker build -t subscription-manager .
docker run -d -p 127.0.0.1:3000:3000 -v subdata:/data subscription-manager
```

**There is no authentication.** Anyone who can reach the port can read and change your subscriptions and download `/export.csv` and `/calendar.ics`. Compose binds to `127.0.0.1` for that reason; to reach it from elsewhere, put it behind a VPN or a reverse proxy that requires a login.
