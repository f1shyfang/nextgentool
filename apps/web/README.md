# NextGen Ventures application

This is the only Next.js app in the workspace. It combines the public NextGen website and authenticated account dashboard with the existing PostgreSQL users module. Other investment features are separate work.

## Run from the repository root

```sh
pnpm install
cp apps/web/.env.example apps/web/.env
pnpm dev
```

Use `localhost` consistently for Clerk sessions. Add the existing NextGen application's `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to ignored `apps/web/.env.local`. Local credentials from the replica were preserved during consolidation. No new Clerk application is needed.

Without a publishable key, public pages still work and auth screens show setup guidance. The dashboard redirects to sign-in. Investment-tool authorization and firm memberships belong to the corresponding feature modules; signing in alone must not grant investment-team access.

## Routes and source

- `src/app/(site)/`: homepage, public catch-all routes, sign-in, sign-up and dashboard. The route group does not alter URLs.
- `src/components/site/`: the preserved marketing renderer, header and auth shell.
- `content/`: route records and sanitized public HTML for all 22 pages.
- `public/styles/` and `public/assets/`: captured reference styles, images, fonts and provenance. These static reference artifacts and captured content are excluded from source formatting/linting.
- `src/app/api/users/`: existing users HTTP delivery. Investment-tool routes are developed separately.
- `src/modules/`, `src/lib/` and `drizzle/`: existing domain logic, composition and database infrastructure.
- `src/proxy.ts`: Clerk session handling across app pages and APIs. Resource handlers retain their own authorization checks.
- `DESIGN.md` and `SITE-PRODUCT.md`: public-site visual authority and reference context.

Sign-in and sign-up default to `/dashboard/`; explicit return destinations from protected tools take precedence. Signing out returns to `/`. No production authentication settings were changed.

## Production

```sh
pnpm build
pnpm --filter @repo/web start
pnpm --filter @repo/web verify:app http://localhost:3000
```

Deploy the `apps/web` workspace package to a host supporting Next.js server routes and Proxy, with database and Clerk environment variables configured. Use the root pnpm lockfile. Static export and the replica's legacy `out/` hosting configuration are retired. Dynamic HTML reads are included through `outputFileTracingIncludes`.

The verifier checks every public route, linked assets, internal links, and signed-out dashboard protection. Also verify sign-in, account verification where configured, dashboard arrival, profile controls, logout and protected-route return behavior with an existing test account.

`pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` run workspace checks. Database integration tests require their dedicated test database configuration. Do not point tests at production.

## Reference maintenance

The website reproduces nextgenventures.com.au as captured on 24 October 2026. The original Framer runtime, tracking scripts and editor tooling are absent; navigation and marquees are local React/CSS. External enquiry and newsletter links retain their original destinations.

`scripts/import-reference.mjs` and `scripts/inspect-reference.mjs` preserve the original import tooling. Their initial `/tmp` captures are historical inputs, not required for builds. The brand-kit generator now reads this app's assets.

## Research & Diligence

`/research/` uses the existing Clerk identity and firm-scoped authorization for private PDF/DOCX documents, versioned notes and memo drafts. Configure `RESEARCH_STORAGE_PATH`, `CLAMAV_HOST`, and `CLAMAV_PORT`; files remain inaccessible until validation and malware scanning succeed. [Operations and provisioning](../../docs/plans/research-and-diligence-operations.md) cover memberships, canonical references and private storage reconciliation. [End-to-end verification](../../docs/plans/research-and-diligence-local-verification.md) records signed-in browser, upload, authorization and navigation-cancel results.
