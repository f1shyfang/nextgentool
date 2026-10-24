# Next.js + PostgreSQL workspace

A pnpm monorepo starter with a Next.js App Router application and shared environment package.

## NextGen Ventures replica

The replicated NextGen Ventures website is in [`nextgen-replica/`](./nextgen-replica/README.md), with 22 responsive pages and local image/font assets.

```sh
cd nextgen-replica
npm ci
npm run dev
```

Its production static build is generated with `npm run build` in that directory.

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
