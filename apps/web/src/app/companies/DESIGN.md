# Design System: Company Intelligence

```yaml
name: Company Intelligence
description: Light, teal investment research workspace within NextGen.
colors:
  ink: "#17313b"
  muted: "#52676c"
  accent: "#116c64"
  line: "#d4ded8"
  paper: "#fafaf6"
  surface: "#fff"
  control-border: "#98aaa1"
  accent-hover: "#0b514b"
  selected: "#e4f0e9"
  error-background: "#fbeeea"
  error-text: "#8c3028"
  warning-background: "#faf1d9"
  warning-text: "#725013"
  status-background: "#eaf3ee"
  status-text: "#245b44"
  revision-background: "#eef3ed"
  nested-source-background: "#f4f7f2"
typography:
  headline:
    fontSize: "clamp(30px, 3vw, 40px)"
    lineHeight: 1.18
    letterSpacing: "-0.03em"
  title:
    fontSize: "22px"
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "15px"
    lineHeight: 1.55
  label:
    fontSize: "14px"
    fontWeight: 600
rounded:
  control: "5px"
  panel: "12px"
spacing:
  pair-gap: "20px"
  panel-padding: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 17px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 17px"
```

## Overview

This document applies only to `/companies/` and its company profiles. Mode: **Operate** at this boundary. Extend the established light, teal investment-tool language: readable research rows, explicit sources, and restrained actions. The public marketing and account navy/blue system remains governed by the app's root design guidance.

## Colors

Teal identifies links, primary actions, active navigation, and focus. Paper and white distinguish workspace from form panels; ink and muted text establish hierarchy. Thin neutral rules organize records. Green status, amber warning, and red error treatments always accompany explanatory text.

## Typography

Use the body stack throughout. Page headings use the headline role; section headings use title. Company names in directory rows are bold (18px). Field headings and controls use label sizing; metadata uses smaller text (13px), line height (1.6), and tabular numerals. Paragraphs have a maximum measure (72ch); source values and long names wrap.

## Layout

The top bar places brand, investment navigation, and Dashboard across a ruled header. Main content is centered with a maximum width (1240px), horizontal padding (`clamp(20px, 4vw, 56px)`), and desktop vertical padding (52px top, 80px bottom). Forms stop at (900px); paired fields use two equal columns.

At widths up to (700px), navigation wraps onto its own full-width row, page headings stack, content padding becomes (32px 20px 56px), panels use (20px) padding, paired fields become one column, and search controls wrap. Directory row action text yields to its arrow. Overview facts change from a (190px) label column plus value column to stacked labels and values; evidence indentation reduces from (24px) to (12px).

## Elevation & Depth

No shadows. Borders, white form panels, paper background, and pale state fills provide separation. There are no animations or transitions in the company stylesheet; retain this static behavior for reduced-motion users.

## Shapes

Controls and state messages use the control radius; panels use the panel radius. Buttons and inputs have a minimum height (44px), visible borders, and inherited typography. Textareas resize vertically and start at a minimum height (96px).

## Components

- **Directory:** full-row links separated by rules, with company name and website on the left and profile action on the right. Search, count, empty states, and explicit load-more controls frame the list.
- **Profile:** company identity and updated timestamp precede Overview/Evidence/Signals toggle buttons with `aria-pressed`. Overview rows show resolved values, selected source, observation date, review state, conflicts, and pin status. Missing values read “Unknown.”
- **Evidence:** native `details` disclosures group claims by field and count. Each claim carries source link, claim/review status, dates, selection/supersession state, and pin history. Review, pin, and release decisions open inline panels with required reasons.
- **Forms:** add-company first checks matches; creating a separate matching company requires a reason. Add-fact collects value, source title/URL, UTC observation time, and claim kind. Pending controls disable and show checking/saving labels. Read-only users receive a notice and no editing actions.
- **Feedback:** errors use alerts; successful saves use status messages. A stale submission preserves the draft, disables mutations, and offers “Load latest profile”; refreshing requires reviewing and submitting the draft again. Mutation retries with identical path/body reuse the request identifier after failure; network copy asks users to retry with the same details.
- **Signals:** the profile Signals tab opens the signal timeline and financing history. Both use readable rows with wrapping evidence and explicit status text: unreviewed, verified, disputed, or retracted. Timeline records retain all current statuses; editing a signal appends a correction revision with a required reason.
- **Timeline filters:** a category selector and from/to event dates apply on form submission. Partial month and year dates match by interval overlap; events with unknown dates are excluded when a date limit is applied. Matching counts, filtered empty states, and invalid-range errors remain visible beside the filters.
- **Financing history:** filters cover round type, original currency, minimum/maximum amount, and from/to event dates. Amount filtering requires a currency and compares values in that currency; date filtering includes overlapping partial dates. Only current unreviewed and verified rounds appear. Amounts and reported valuations display as exact decimal strings with redundant fractional zeros removed, beside their original currency and valuation type. There are no sums or currency conversions.
- **Signal evidence:** source links show publication dates, UTC observation timestamps, and explicit unknown dates. Native revision-history disclosures expose immutable payload and source snapshots, recorded timestamps, statuses, and correction reasons. Revision rows use `revision-background`; nested source fieldsets use `nested-source-background`.
- **Signal forms:** inline forms collect category, status, event-date precision, title, summary, and one to ten sources. Each source has a title, URL, UTC observation time, and optional publication date. Financing adds original amount/currency, round type, comma-separated investors, and an optional valuation with its type. A duplicate-event reason allows a separately justified matching event; read-only users receive no write controls.
- **Cross-view synchronization:** stale submissions preserve the signal draft and offer “Load latest signals.” Explicit recovery updates the current revision and shared company version, then requires review and resubmission. Successful signal writes refresh the profile before editing resumes; shared guards prevent fact and signal writes during synchronization. Network failures preserve drafts for retries with the same details.
- **Interaction:** teal focus-visible outlines (2px, offset 4px), a focus-revealed skip link, underlined links, and explicit active navigation support keyboard use. Hover darkens primary buttons and lightly fills secondary buttons/rows. Disabled buttons use reduced opacity (0.6).

## Do's and Don'ts

- Do keep evidence and dates readable beside the selected fact and preserve explicit unknown, conflict, and suspended-pin states.
- Do use inline forms and field disclosures to keep research context visible.
- Don't introduce marketing hero composition, navy surfaces, decorative imagery, shadows, or animation into this established company workspace.
