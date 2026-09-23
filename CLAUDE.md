# CLAUDE.md

Guidance for AI-assisted work in this repository. Follow these conventions so changes stay consistent with the rest of the codebase.

## Stack

- **SvelteKit** + **Svelte 5** (runes-based), **TypeScript** (strict mode).
- **Tailwind CSS v4**, configured via `@tailwindcss/vite` (CSS-based config in `src/app.css` — there is no `tailwind.config.js`).
- **Prisma** + **SQLite** for persistence. There is no GraphQL/Apollo layer in this project — it was removed in favor of Prisma with SvelteKit's own data-loading conventions.
- Package manager: **npm** only. Never commit a `yarn.lock` or any other lockfile.

## Data access

- All database access goes through the singleton Prisma client exported from `src/lib/server/prisma.ts`. Never instantiate a second `PrismaClient`.
- Only import Prisma (or the singleton client) from server-only files: `+page.server.ts`, `+layout.server.ts`, `+server.ts`, or other modules under `src/lib/server/`. Never import it into a `.svelte` component.
- Reads happen in `load()` functions; writes happen in form `actions`, invoked from the page via `use:enhance` (`$app/forms`). Don't fetch/mutate data with `onMount` + manual client calls.
- Domain types (e.g. `Subscription`) come from the generated Prisma Client (`import type { Subscription } from '.../generated/prisma/client'`) — don't hand-write duplicate type definitions for models already defined in `prisma/schema.prisma`.
- Schema changes go through `prisma/schema.prisma`, followed by `npx prisma migrate dev --name <description>`. Never hand-edit the SQLite file or bypass migrations.

## Svelte 5 conventions

- Use runes everywhere: `$props()`, `$state()`, `$derived()`, `$bindable()`. Do not use Svelte 4 patterns (`export let`, reactive `$:` statements).
- Use Svelte 5 event attributes (`onclick`, `onsubmit`, etc.), never legacy `on:click`/`on:submit` directives.

## TypeScript

- No `any`. Use precise types — Prisma-generated types for domain models, explicit types/interfaces for everything else.
- Strict mode is on (`tsconfig.json`); keep it that way.

## Routing

- No scratch or experimental routes committed to `src/routes` (no `-test`-suffixed route folders, no leftover framework demo pages). Build real pages directly, or prototype outside `src/routes` before merging.

## Styling / components

- Use Tailwind utility classes directly in markup.
- For reusable UI primitives, follow the existing shadcn-svelte pattern under `src/lib/components/ui/` (see `button/`): use `cn()` from `src/lib/utils.ts` to merge classes, and `tailwind-variants` for variant props.

## Testing

- When you change a route's rendered output or server logic, update its corresponding test:
  - Component/unit tests: `*.svelte.test.ts` (Vitest + `vitest-browser-svelte`).
  - End-to-end tests: `e2e/*.test.ts` (Playwright).
- Run `npm run check` (svelte-check) and `npm run lint` before considering a change done.
