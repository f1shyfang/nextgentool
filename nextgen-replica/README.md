# NextGen Ventures replica

A responsive React / Next.js recreation of [nextgenventures.com.au](https://www.nextgenventures.com.au/), captured on 24 October 2026.

## Run locally

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000.

## Production build

```sh
npm run build
node scripts/verify-export.mjs
```

The static website is emitted into `out/`. Serve that directory with any static host that supports directory index files.

## Structure

- `app/`: Next.js routes, metadata, and local interaction styles.
- `components/Header.jsx`: responsive React navigation with keyboard support.
- `components/ReferencePage.jsx`: shared server-side React renderer and seamless CSS ticker composition.
- `content/`: migrated, sanitized static page content; 22 routes including 17 company profiles and the student investor role.
- `public/styles/`: preserved reference layout rules and responsive breakpoints.
- `public/assets/`: local photographs, artwork, logos and fonts. Original sources are recorded in `provenance.json`.
- `.openai/hosting.json`: static deployment configuration.

The original visual markup and CSS are retained for fidelity, rendered as React elements. The original Framer application, tracking scripts, and editor tooling are not loaded. The mobile menu and marquees use local React/CSS. Reduced motion preferences are respected. Enquiry buttons, social links, and newsletter links retain the original external destinations; no form submissions are simulated or stored locally.

`scripts/import-reference.mjs` documents the mechanical content migration. Its initial captures live outside the checkout and are not required to run or build this replica.
