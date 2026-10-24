---

name: NextGen Ventures replica
description: Faithful reproduction of the NextGen Ventures reference identity.
colors:
navy: "#000033"
header-action: "#2454ff"
header-action-hover: "#3866ff"
source-action: "#0059ff"
source-accent: "#385fff"
card-top: "#040042"
panel: "#151154"
header-text: "#eff8ff"
source-text: "#ededed"
action-text: "#ffffff"
investor-action: "#141414"
portal-secondary-text: "#c5c5de"
portal-footer-text: "#aaaac9"
portal-divider: "#33335d"
portal-link: "#9ab6ff"
signup-border: "#77779a"
typography:
portal-display:
fontFamily: "Space Grotesk, sans-serif"
fontSize: "clamp(36px, 4vw, 54px)"
fontWeight: 500
lineHeight: "1.12"
letterSpacing: "-0.03em"
portal-body:
fontFamily: "Urbanist, Arial, sans-serif"
fontSize: "16px"
fontWeight: 400
lineHeight: "1.6"
display:
fontFamily: "Space Grotesk, sans-serif"
fontSize: "40px"
fontWeight: 700
lineHeight: "120%"
letterSpacing: "0em"
title:
fontFamily: "Urbanist, sans-serif"
fontSize: "30px"
fontWeight: 700
lineHeight: "120%"
body:
fontFamily: "Inter, sans-serif"
fontSize: "16px"
fontWeight: 400
lineHeight: "140%"
navigation:
fontFamily: "Urbanist, Arial, sans-serif"
fontSize: "16px"
fontWeight: 500
action:
fontFamily: "Space Grotesk, sans-serif"
fontSize: "14px"
fontWeight: 500
letterSpacing: "-0.02em"
rounded:
action: "6px"
image: "8px"
feature-card: "12px"
spacing:
gallery-gap: "10px"
card-padding: "20px"
section-gap: "50px"
components:
header-action:
backgroundColor: "{colors.header-action}"
textColor: "{colors.header-text}"
rounded: "{rounded.action}"
padding: "17px 20px"
header-action-hover:
backgroundColor: "{colors.header-action-hover}"
founder-action:
backgroundColor: "{colors.source-action}"
textColor: "{colors.action-text}"
typography: "{typography.action}"
rounded: "{rounded.action}"
padding: "15px 20px"
height: "50px"
investor-action:
backgroundColor: "{colors.investor-action}"
textColor: "{colors.action-text}"
typography: "{typography.action}"
rounded: "{rounded.action}"
padding: "15px 20px"
height: "50px"
---

# Design System: NextGen Ventures replica

## Overview

**Creative North Star: "The NextGen Ventures reference"**

The original site at https://www.nextgenventures.com.au/ is the binding visual authority. This document captures the implemented replica, rather than introducing a new identity. Preserve its dark navy field, bright blue actions, generous section spacing, photographs, original poppy imagery, and moving community gallery.

**Key Characteristics:**
- Deep navy surfaces with pale typography and vivid blue actions.
- Geometric headlines, compact navigation, and generous space between sections.
- Original photography and poppy imagery as the recognizable visual signatures.

## Colors

### Primary

Header action blue belongs to the rebuilt navigation; source action blue belongs to imported page actions and the hero eyebrow. Source accent blue appears in section labels and feature gradients. Preserve these existing distinctions.

### Secondary

Account surfaces use pale navy-tinted secondary text for supporting copy, a softer footer tone, and pale blue destination actions. Muted navy dividers separate dashboard rows; the outlined sign-up control uses its own visible border tone. These roles extend the incumbent navy and blue identity.

### Neutral

Navy is the page canvas. Header text is a cool pale white; source text is a softer neutral white. Pure white labels sit on founder and investor actions. Card-top and panel tones support the original layered sections; investor actions use the dark neutral fill.

## Typography

Space Grotesk supplies hero/display headings, eyebrows, and source action labels. Urbanist supplies section titles and the rebuilt navigation. Imported body paragraphs use Inter. Keep the local font files and source role assignments; the font-face bundle contains unused families that are not identity choices.

Display headings step from desktop (40px) to tablet (32px) and mobile (26px). Urbanist section titles step from (30px) to (24px) and (19px), including an intermediate source title rule below (1200px). Body paragraphs reduce from (16px) to (14px) below desktop. Preserve original alignment and intentional line wrapping per component.

Account surfaces pair the portal display role with Urbanist body copy. Auth introductions use (19px) supporting text, reducing to (17px) on mobile; dashboard supporting copy uses (16px). Auth headings settle at (36px) on mobile. These roles supplement the imported page typography.

## Layout

Content follows the imported responsive geometry: mobile through (809.98px), tablet from (810px) through (1099.98px), and desktop from (1100px). The header collapses through (1099.98px), with an expanded vertical link menu beneath it. Its centered inner container caps at (1100px), with desktop horizontal padding (30px) and collapsed padding (20px).

Major source sections use centered containers capped at (1100px), generous spacing, and responsive stacked layouts. The gallery uses two clipped horizontal photo strips; preserve its image order, crops, gaps, and opposing movement. Do not replace the page-specific source measurements with an invented global spacing scale.

The account shell shares the centered (1100px) container. Auth uses two balanced columns with an (80px) gap and a centered form capped at (400px). Below (810px), it stacks introduction above form with (20px) side padding and hides the supporting note. The dashboard uses spacious, separated destination rows; below (810px), each row stacks its action beneath its description.

## Elevation & Depth

Depth comes primarily from navy tonal layering, source gradients, original imagery, and clipped photo surfaces. Source hero actions explicitly have no shadow. The sticky header uses a nearly opaque navy surface and a subtle bottom border. Preserve source effects where present instead of adding a new shadow system.

## Shapes

Buttons have softly curved corners; photos are slightly rounder and feature cards rounder again, using the frontmatter roles. Gallery thumbnails are (195px × 130px) in the desktop source. Feature cards use clipped rounded containers with dark-to-blue gradients; preserve original illustration and poppy silhouettes rather than redrawing them.

## Components

- **Actions:** Founder enquiry is blue and LP enquiry is dark. Source actions use centered Space Grotesk labels and the original compact dimensions. The header action uses Urbanist and its separate blue fill; its hover fill is recorded above.
- **Navigation:** Sticky branded header with the original logo (193px × 20px), pale links, and blue hover text. Below desktop, the menu toggle exposes a vertical navigation panel. Escape closes the panel and returns focus to its toggle.
- **Feature cards:** Original rounded gradient cards, (400px) tall in the desktop homepage source, with (20px) padding and vertically distributed illustration and text. Follow the source responsive rules rather than forcing this desktop height everywhere.
- **Gallery:** Preserve the actual local photographs and two opposing continuous strips. Movement pauses on hover and stops under reduced-motion preferences; duplicated images are hidden from assistive technology.
- **Poppy signature:** Preserve the reference poppy artwork, placement, and cropping alongside the original page composition. It is an identity asset, not a generic decorative pattern.
- **Account shell:** Original local logo above a navy page, with a quiet return-to-website link and company footer. The auth form remains a white, light-color-scheme Clerk surface; constrain its dimensions through Clerk’s appearance API rather than overriding its internal field styling.
- **Account navigation:** Signed-out controls expose Log in and an outlined Sign up action; signed-in controls expose Dashboard and the profile icon. The collapsed menu retains these controls, including account management and sign out through the profile menu.
- **Dashboard destinations:** Use full-width linked rows, subtle separators, Urbanist titles and descriptions, and pale blue action labels with arrow icons. Preserve the implemented destinations for startups, team, and writing.
- **Focus:** Interactive controls use the implemented visible outline (2px solid #81b7ff, offset 5px). Keep the skip link accessible on focus.

## Do's and Don'ts

- Do preserve the reference imagery, logo, font roles, and responsive composition.
- Do retain the distinction between header blue and imported source action blue.
- Do preserve keyboard focus and reduced-motion behavior.
- Don't invent additional palettes, token scales, or component variants.
- Don't replace original photographs or poppies with generated substitutes.
- Don't flatten the gallery into a static grid or add decorative shadows to source actions.
