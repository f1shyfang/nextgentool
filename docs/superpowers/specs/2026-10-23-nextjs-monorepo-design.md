# Next.js PostgreSQL Monorepo Design

## Purpose

Provide a pragmatic production-ready starter for a Next.js application. It should make validated configuration, PostgreSQL persistence, and domain-focused development the default without prematurely splitting the application into many deployable services.

## Scope and Success Criteria

The repository will contain a pnpm workspace, a Next.js App Router application, a shared T3 Env package, Drizzle ORM configured for PostgreSQL, Biome tooling, Git hooks, GitHub Actions CI, and a small `users` vertical slice that demonstrates DDD with hexagonal boundaries.

Success means a developer can install the workspace, configure PostgreSQL through an example environment file, apply migrations, run the web app, create a user through an API endpoint, and run all quality checks locally and in CI.

## Workspace Layout

```
apps/
  web/                         # Next.js delivery mechanism and composition root
packages/
  env/                         # T3 Env schemas and typed environment exports
```

The initial design deliberately keeps the application layers in `apps/web`. A later worker, CLI, or second web application can depend on extracted packages once shared use is real. This avoids package boundaries that contain no reusable code.

## Hexagonal User Slice

```
apps/web/src/modules/users/
  domain/                      # User entity and UserRepository port
  application/                 # CreateUser use case and input/output DTOs
  infrastructure/              # Drizzle table schema and repository adapter
  presentation/                # HTTP request/response mapping
```

`domain` and `application` must not import Next.js, Drizzle, database clients, or environment values. The use case depends on the `UserRepository` port. `infrastructure` implements that port with Drizzle/PostgreSQL. The route handler is a thin delivery adapter that calls a composition-root factory, validates its request, and maps known errors to HTTP responses.

## Data and Configuration

PostgreSQL is the sole database target. The `users` table has a generated UUID primary key, a unique email address, and timestamps. Drizzle uses the `postgres` driver and runs in the Node.js runtime. Drizzle configuration reads `DATABASE_URL` using the shared server-side T3 Env schema. Migrations are generated into `apps/web/drizzle`.

Configuration is never read directly from `process.env` outside the env package. Public browser variables, if introduced later, will use a separate client schema.

## HTTP Behavior

`POST /api/users` accepts `{ "email": string }`. The presentation adapter rejects malformed requests with a 400 response. A successful creation returns the created user with a 201 response. Duplicate email and unexpected persistence failures are mapped to safe HTTP responses; unexpected failures are logged only on the server.

## Tooling and Automation

- pnpm `12.14.0` supplies workspace installation and recursive scripts; Node.js `24.22.1` is the supported runtime.
- Biome supplies linting and formatting.
- Husky invokes lint-staged before commits; staged supported source files are formatted and checked by Biome.
- GitHub Actions uses the locked pnpm version, installs frozen dependencies, then runs lint, typecheck, tests, and a production build.
- Drizzle commands generate migrations, migrate PostgreSQL, and start Drizzle Studio.

## Testing

Unit tests cover the `CreateUser` use case with an in-memory implementation of the repository port. Route tests cover valid creation plus invalid payload mapping. These tests require no PostgreSQL service. Type checking, tests, Biome, and production build are all required CI checks.

## Deliberate Non-Goals

Authentication, UI for user creation, database hosting, container orchestration, and cross-package extraction of domain code are not included in the initial scaffold.
