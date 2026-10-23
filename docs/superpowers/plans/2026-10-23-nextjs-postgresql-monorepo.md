# Next.js PostgreSQL Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pnpm workspace containing a production-ready Next.js/PostgreSQL starter with validated configuration, Drizzle, and a small DDD/hexagonal users slice.

**Architecture:** `apps/web` is the Next.js delivery mechanism and composition root. Its `users` module separates framework-free domain/application code from Drizzle infrastructure and HTTP presentation. `packages/env` is the single source of typed environment configuration.

**Tech Stack:** Node.js 24.22.1, pnpm 12.14.0, Next.js App Router, TypeScript, PostgreSQL, Drizzle ORM with `postgres`, T3 Env, Zod, Vitest, Biome, Husky, lint-staged, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-23-nextjs-monorepo-design.md`

## Global Constraints

- Use Node.js `24.22.1` and pnpm `12.14.0`, pinned in root metadata and CI.
- PostgreSQL is the only database target; use Drizzle's `postgres` driver in the Node.js runtime.
- Read environment values only through `@repo/env/server`; never directly from `process.env` in application code.
- Keep `domain` and `application` free of imports from Next.js, Drizzle, `postgres`, and environment modules.
- Keep the initial domain code in `apps/web`; do not extract a premature shared-domain package.
- Expose only `POST /api/users`, accepting `{ "email": string }` and returning the created user with HTTP `201`.

## Review Focus

- Whitespace-padded, mixed-case email: normalize it before persistence so the unique constraint represents a real user identity. Test in Task 2.
- Invalid or missing request body: return `400` without invoking the use case. Test in Task 4.
- Duplicate email: map the domain `DuplicateUserEmailError` to `409` without a database error leak. Test in Task 4.
- Unexpected persistence failure: return a safe `500` response and log the original server-side error. Test in Task 4.
- Missing or malformed `DATABASE_URL`: fail application/database startup through the T3 Env schema rather than attempting a connection. Test in Task 3.

---

## File Structure

```
.
├── .github/workflows/ci.yml                    # Reproducible CI quality gate
├── .husky/pre-commit                           # Runs lint-staged before commits
├── apps/web/
│   ├── drizzle/                                # Generated SQL migrations
│   ├── drizzle.config.ts                       # Drizzle Kit configuration
│   ├── src/app/api/users/route.ts              # Next.js POST delivery adapter
│   ├── src/lib/composition-root.ts              # Wires infrastructure to application
│   └── src/modules/users/
│       ├── domain/                             # Entity, error, and repository port
│       ├── application/                        # Create user use case
│       ├── infrastructure/                     # Drizzle schema/client/repository
│       └── presentation/                       # Framework-independent request adapter
├── packages/env/src/server.ts                  # T3 Env server schema and export
├── biome.json                                  # Lint/format configuration
├── package.json                                # Root workspace scripts and version pins
├── pnpm-workspace.yaml                         # Workspace package discovery
└── README.md                                   # Bootstrap, migration, and verification guide
```

### Task 1: Bootstrap the Reproducible Workspace

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`, `.gitignore`, `biome.json`, `lint-staged.config.mjs`, `.husky/pre-commit`, `.github/workflows/ci.yml`, `README.md`
- Create: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/vitest.config.ts`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`
- Create: `packages/env/package.json`, `packages/env/tsconfig.json`

**Interfaces:**
- Produces root scripts: `dev`, `build`, `lint`, `format`, `typecheck`, `test`, `db:generate`, `db:migrate`, and `db:studio`.
- Produces the `@repo/env` workspace package for Task 3 and a Vitest command for Tasks 2 and 4.

- [ ] **Step 1: Initialize the Git repository required by Husky**

Run: `git init --initial-branch=main`

Expected: `.git` exists before dependencies run Husky's prepare script; do not create a feature branch in this task.

- [ ] **Step 2: Create the root workspace metadata**

Set `packageManager` to `pnpm@12.14.0`, `engines.node` to `24.22.1`, and configure pnpm workspace package discovery for `apps/*` and `packages/*`. Make root quality scripts delegate to each workspace package with pnpm recursive commands.

- [ ] **Step 3: Scaffold `apps/web` and `packages/env` package manifests**

Configure the Next.js App Router app with TypeScript strict mode and the `@repo/env` workspace dependency. Add current compatible dependencies for Next.js/React, Drizzle ORM/Kit, `postgres`, `@t3-oss/env-nextjs`, Zod, Vitest, Husky, lint-staged, and Biome; keep build-only and test-only dependencies in `devDependencies`.

- [ ] **Step 4: Add initial Next.js pages and test runner configuration**

Create the minimal root layout and home page that identifies the starter, global styles, and a Node-environment Vitest configuration that discovers `src/**/*.test.ts`.

- [ ] **Step 5: Add Biome, Git hooks, and developer documentation**

Configure Biome for linting and formatting TypeScript/TSX/JSON, lint-staged to run Biome on staged supported files, and Husky’s pre-commit hook to invoke lint-staged. Document installation, `.env` setup, PostgreSQL migration commands, local run command, and all verification commands in `README.md`.

- [ ] **Step 6: Add the GitHub Actions quality gate**

Create `.github/workflows/ci.yml` to run on pull requests and pushes, set up Node `24.22.1` and pnpm `12.14.0`, provide the non-secret valid build-time value `DATABASE_URL=postgres://postgres:postgres@localhost:5432/webapptemplate`, run `pnpm install --frozen-lockfile`, then run root `lint`, `typecheck`, `test`, and `build` scripts in that order.

- [ ] **Step 7: Install and verify the blank workspace**

Run: `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: installation writes the committed lockfile; all four commands exit `0`.

- [ ] **Step 8: Commit the workspace foundation**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc .gitignore biome.json lint-staged.config.mjs .husky .github apps packages README.md
git commit -m "chore: bootstrap nextjs workspace"
```

### Task 2: Implement the Framework-Free User Domain and Use Case

**Files:**
- Create: `apps/web/src/modules/users/domain/user.ts`, `apps/web/src/modules/users/domain/user-repository.ts`, `apps/web/src/modules/users/domain/errors.ts`
- Create: `apps/web/src/modules/users/application/create-user.ts`, `apps/web/src/modules/users/application/create-user.test.ts`

**Interfaces:**
- Consumes: Vitest setup from Task 1.
- Produces: `User`, `CreateUserInput`, `CreateUserResult`, `UserRepository`, `DuplicateUserEmailError`, and `createUser(input, dependencies)` for Tasks 3 and 4.

- [ ] **Step 1: Write failing tests for `createUser`**

```ts
it("normalizes email and persists a new user", async () => {
  const result = await createUser(
    { email: "  Ada@Example.com " },
    { userRepository: inMemoryRepository },
  );

  expect(result.email).toBe("ada@example.com");
});

it("preserves a duplicate-email domain error", async () => {
  await expect(createUser({ email: "ada@example.com" }, duplicateRepository))
    .rejects.toBeInstanceOf(DuplicateUserEmailError);
});
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `pnpm --filter @repo/web test -- create-user.test.ts`

Expected: FAIL because `createUser` and the domain contracts do not exist.

- [ ] **Step 3: Implement the user contracts and use case**

Define `User` as `{ id: string; email: string; createdAt: Date; updatedAt: Date }`, define `UserRepository.create(input: { email: string }): Promise<User>`, and implement `createUser(input: CreateUserInput, dependencies: { userRepository: UserRepository }): Promise<CreateUserResult>`. Normalize email with `trim().toLowerCase()` before calling the port; let `DuplicateUserEmailError` propagate.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm --filter @repo/web test -- create-user.test.ts`

Expected: PASS with both tests green.

- [ ] **Step 5: Run package checks and commit**

Run: `pnpm --filter @repo/web lint && pnpm --filter @repo/web typecheck && pnpm --filter @repo/web test`

Expected: all commands exit `0`.

```bash
git add apps/web/src/modules/users
git commit -m "feat: add user creation use case"
```

### Task 3: Add Typed Environment and Drizzle/PostgreSQL Infrastructure

**Files:**
- Create: `packages/env/src/server.ts`, `packages/env/src/server.test.ts`, `packages/env/src/index.ts`
- Create: `apps/web/drizzle.config.ts`, `apps/web/src/modules/users/infrastructure/schema.ts`, `apps/web/src/modules/users/infrastructure/database.ts`, `apps/web/src/modules/users/infrastructure/drizzle-user-repository.ts`, `apps/web/src/lib/composition-root.ts`, `apps/web/.env.example`
- Create: `apps/web/drizzle/0000_create_users.sql` and Drizzle metadata generated by Drizzle Kit

**Interfaces:**
- Consumes: `UserRepository` and `DuplicateUserEmailError` from Task 2; `DATABASE_URL` from `@repo/env/server`.
- Produces: `createDrizzleUserRepository(): UserRepository` and `createUsersCompositionRoot(): { createUser: (input: CreateUserInput) => Promise<CreateUserResult> }` for Task 4.

- [ ] **Step 1: Write a failing T3 Env validation test**

```ts
it("rejects a missing DATABASE_URL", () => {
  expect(() => loadServerEnv({})).toThrow();
});

it("rejects a malformed DATABASE_URL", () => {
  expect(() => loadServerEnv({ DATABASE_URL: "not-a-url" })).toThrow();
});

it("accepts a PostgreSQL DATABASE_URL", () => {
  expect(loadServerEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/app" }))
    .toMatchObject({ DATABASE_URL: "postgres://user:pass@localhost:5432/app" });
});
```

- [ ] **Step 2: Run the environment test to verify it fails**

Run: `pnpm --filter @repo/env test -- server.test.ts`

Expected: FAIL because `loadServerEnv` has not been implemented.

- [ ] **Step 3: Implement the T3 Env server export**

Implement `loadServerEnv(runtimeEnv: { DATABASE_URL?: string })` using `createEnv` and `z.url()` for `DATABASE_URL`. Export a production `env` instance constructed from `process.env` only in this package. Configure the package export map for `@repo/env/server`.

- [ ] **Step 4: Run the environment test to verify it passes**

Run: `pnpm --filter @repo/env test -- server.test.ts`

Expected: PASS with missing, malformed, and valid validation cases green.

- [ ] **Step 5: Implement database schema, adapter, and composition root**

Define a `users` Drizzle table with UUID `id`, unique `email`, `createdAt`, and `updatedAt`. In `database.ts`, create the `postgres` client and Drizzle database using `env.DATABASE_URL`. Implement `createDrizzleUserRepository(): UserRepository`; translate PostgreSQL error code `23505` to `DuplicateUserEmailError`, and keep other failures unmodified. Wire it to `createUser` in `createUsersCompositionRoot()`.

- [ ] **Step 6: Configure migrations and create the initial migration**

Set `drizzle.config.ts` to use the schema, `apps/web/drizzle` output directory, PostgreSQL dialect, and `env.DATABASE_URL`. Generate and commit the initial migration; add `.env.example` containing a non-secret local `DATABASE_URL` placeholder.

- [ ] **Step 7: Run infrastructure checks and commit**

Run: `pnpm --filter @repo/env test && pnpm --filter @repo/web typecheck && pnpm --filter @repo/web db:generate`

Expected: the env tests and type check exit `0`; repeated migration generation makes no schema changes.

```bash
git add packages/env apps/web/drizzle.config.ts apps/web/drizzle apps/web/src/modules/users/infrastructure apps/web/src/lib/composition-root.ts apps/web/.env.example
git commit -m "feat: add postgres user repository"
```

### Task 4: Deliver and Test the HTTP Adapter

**Files:**
- Create: `apps/web/src/modules/users/presentation/post-users.ts`, `apps/web/src/modules/users/presentation/post-users.test.ts`
- Create: `apps/web/src/app/api/users/route.ts`

**Interfaces:**
- Consumes: `createUsersCompositionRoot()` from Task 3 and `CreateUserResult`/`DuplicateUserEmailError` from Task 2.
- Produces: `createPostUsersHandler(dependencies)` returning a `POST(request: Request): Promise<Response>` adapter; Next.js `POST` delegates to it.

- [ ] **Step 1: Write failing HTTP adapter tests**

```ts
it("creates a user and returns 201", async () => {
  const response = await handler(new Request("http://test/api/users", {
    method: "POST",
    body: JSON.stringify({ email: "ada@example.com" }),
  }));

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toMatchObject({ email: "ada@example.com" });
});

it("returns 400 for a malformed body without calling the use case", async () => {
  const response = await handler(new Request("http://test/api/users", { method: "POST", body: "{}" }));
  expect(response.status).toBe(400);
});

it("returns 409 for a duplicate email", async () => {
  const response = await duplicateHandler(new Request("http://test/api/users", {
    method: "POST", body: JSON.stringify({ email: "ada@example.com" }),
  }));
  expect(response.status).toBe(409);
});

it("returns a generic 500 and logs an unexpected error", async () => {
  const response = await failingHandler(new Request("http://test/api/users", {
    method: "POST", body: JSON.stringify({ email: "ada@example.com" }),
  }));
  expect(response.status).toBe(500);
  await expect(response.json()).resolves.toEqual({ error: "Internal server error" });
  expect(logError).toHaveBeenCalledWith(databaseError);
});
```

- [ ] **Step 2: Run the HTTP adapter test to verify it fails**

Run: `pnpm --filter @repo/web test -- post-users.test.ts`

Expected: FAIL because `createPostUsersHandler` does not exist.

- [ ] **Step 3: Implement the request adapter**

Implement `createPostUsersHandler(dependencies: { createUser: (input: CreateUserInput) => Promise<CreateUserResult>; logError: (error: unknown) => void })`. Parse JSON, validate an email string with Zod, return `400` for invalid requests, `201` with the created result, `409` for `DuplicateUserEmailError`, and a generic `500` body after `logError` for all other failures.

- [ ] **Step 4: Wire the Next.js route to the composition root**

Set `export const runtime = "nodejs"` in `route.ts`. Construct the production handler from `createUsersCompositionRoot()` and a server-side logger, then export it as `POST`.

- [ ] **Step 5: Run focused tests to verify they pass**

Run: `pnpm --filter @repo/web test -- post-users.test.ts`

Expected: PASS with success, invalid-input, duplicate, and unexpected-error cases green.

- [ ] **Step 6: Run the complete quality gate and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: every command exits `0`.

```bash
git add apps/web/src/app/api/users apps/web/src/modules/users/presentation
git commit -m "feat: expose user creation endpoint"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1–4 cover the workspace, Next.js delivery app, T3 Env package, Node/PostgreSQL Drizzle setup, generated migration, hexagonal slice, Biome, hooks, CI, endpoint behavior, and tests. No requirement is unassigned.
- **Step clarity:** Every implementation step names exact files, interfaces, commands, or behavior. The plan deliberately leaves routine library syntax to the implementer.
- **Type consistency:** Task 2 defines the user contracts used by Tasks 3 and 4; Task 3 supplies the composition root consumed by Task 4. Route, repository, and use-case signatures agree.
- **Review focus:** Each listed input or failure mode has an explicit test in its owning task.
- **Proportion:** Four independent, reviewable tasks keep the plan smaller than a code transcript while retaining the needed interface decisions.
