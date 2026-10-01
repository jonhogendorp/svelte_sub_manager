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

The database location comes from `DATABASE_URL` (see `prisma.config.ts`).

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

## Database

Schema changes go in `prisma/schema.prisma`, followed by `npx prisma migrate dev --name <description>`.
