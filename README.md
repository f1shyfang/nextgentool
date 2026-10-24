# NextGen Ventures workspace

A pnpm workspace containing the NextGen website, authenticated investment tools, and shared environment configuration.

## NextGen Ventures application

[`apps/web`](apps/web/README.md) is the single NextGen application. It includes the 22-page public website, Clerk sign-in and sign-up, the protected `/dashboard/`. Investment tools under development will extend this app. The standalone replica has been consolidated into this workspace app.

Run `pnpm dev` from the repository root. Production runs as a Next.js server; static export cannot serve authenticated routes.

### Brand kit

The [visual brand guidelines](output/pdf/NextGen-Ventures-Brand-Guidelines.pdf) and [asset bundle](output/pdf/NextGen-Ventures-Brand-Kit.zip) cover logo usage, colours, typography, photography, UI styling, and accessibility. [Generation instructions](brand-kit-source/README.md) are included.

## Requirements

- Node.js 24.22.1
- pnpm 12.14.0
- PostgreSQL for database migrations and application data

## Install and configure

```sh
pnpm install
cp apps/web/.env.example apps/web/.env
```

Set `DATABASE_URL` in `.env` to a PostgreSQL connection string. The application build uses this variable when validating its environment. A local example is included in `apps/web/.env.example`; remote databases must include `sslmode=verify-full`.

Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in the ignored `apps/web/.env.local` to enable authentication. Use the existing NextGen Clerk application. Keep secrets out of version control.

## Run locally

```sh
pnpm dev
```

## Database commands

Database commands are provided by the `@repo/web` workspace package:

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

## Quality checks

```sh
pnpm lint
pnpm format
pnpm typecheck
pnpm test
pnpm build
```

## Production and route verification

```sh
pnpm build
pnpm --filter @repo/web start
pnpm --filter @repo/web verify:app http://localhost:3000
```

See [application structure and authentication](apps/web/README.md) and the [consolidation record](docs/plans/app-consolidation.md).
