---
version: alpha
name: Command Line Editorial
description: A high-contrast technical editorial design language inspired by commandline.microsoft.com, tuned for documentation, demos, and article-led product storytelling.
colors:
  primary: "#000000"
  background: "#ffffff"
  shell: "#cccccc"
  muted: "#555555"
  accent: "#0067b8"
  border: "#d9d9d9"
  borderSubtle: "#e0e0e0"
  hoverHighlight: "#d5f5c0"
  darkBackground: "#111111"
  darkSurface: "#1a1a1a"
  darkPrimary: "#ffffff"
  darkMuted: "#999999"
  darkAccent: "#4da6ff"
  codeBlock: "#1d1e22"
typography:
  body:
    fontFamily: "Inter, 'DM Sans', 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif"
    fontSize: 17px
    lineHeight: 1.7
    fontWeight: 400
  brand:
    fontFamily: "'Segoe UI', Inter, Arial, sans-serif"
    fontSize: 17px
    lineHeight: 1.5
    fontWeight: 500
  h1:
    fontFamily: "Inter, 'DM Sans', 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif"
    fontSize: 42px
    lineHeight: 1.2
    fontWeight: 500
    letterSpacing: -1px
  h2:
    fontFamily: "Inter, 'DM Sans', 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif"
    fontSize: 24px
    lineHeight: 1.3
    fontWeight: 500
  h3:
    fontFamily: "Inter, 'DM Sans', 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif"
    fontSize: 20px
    lineHeight: 1.3
    fontWeight: 500
  metadata:
    fontFamily: "Consolas, 'SFMono-Regular', 'Cascadia Mono', Menlo, monospace"
    fontSize: 12px
    lineHeight: 1.4
    fontWeight: 400
  caption:
    fontFamily: "Consolas, 'SFMono-Regular', 'Cascadia Mono', Menlo, monospace"
    fontSize: 12px
    lineHeight: 16px
    fontWeight: 400
  tag:
    fontFamily: "Consolas, 'SFMono-Regular', 'Cascadia Mono', Menlo, monospace"
    fontSize: 10px
    lineHeight: 1.2
    fontWeight: 700
    textTransform: uppercase
rounded:
  none: 0px
  inlineCode: 4px
  block: 8px
spacing:
  mobile: 16px
  tablet: 24px
  desktop: 30px
  paragraph: 1.25em
  section: 48px
  compact: 8px
components:
  page:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    padding: "{spacing.desktop}"
  article:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    padding: "{spacing.desktop}"
    width: 740px
  prose:
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    width: 740px
  heroTitle:
    textColor: "{colors.primary}"
    typography: "{typography.h1}"
  sectionTitle:
    textColor: "{colors.primary}"
    typography: "{typography.h2}"
  metadata:
    textColor: "{colors.muted}"
    typography: "{typography.metadata}"
  tag:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    typography: "{typography.tag}"
    rounded: "{rounded.none}"
    padding: "{spacing.compact}"
  codeBlock:
    backgroundColor: "{colors.codeBlock}"
    textColor: "{colors.darkPrimary}"
    typography: "{typography.metadata}"
    rounded: "{rounded.block}"
    padding: "{spacing.desktop}"
  inlineCode:
    backgroundColor: "{colors.borderSubtle}"
    textColor: "{colors.primary}"
    typography: "{typography.metadata}"
    rounded: "{rounded.inlineCode}"
    padding: "{spacing.compact}"
  media:
    backgroundColor: "{colors.borderSubtle}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.block}"
    width: 100%
  focus:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.darkPrimary}"
    rounded: "{rounded.none}"
    height: 2px
  link:
    backgroundColor: "{colors.background}"
    textColor: "{colors.accent}"
    typography: "{typography.body}"
  linkHover:
    backgroundColor: "{colors.hoverHighlight}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
  darkLink:
    backgroundColor: "{colors.darkBackground}"
    textColor: "{colors.darkAccent}"
    typography: "{typography.body}"
  shellFrame:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.primary}"
    typography: "{typography.metadata}"
    rounded: "{rounded.none}"
    padding: "{spacing.compact}"
  divider:
    backgroundColor: "{colors.border}"
    textColor: "{colors.primary}"
    rounded: "{rounded.none}"
    height: 1px
  darkPage:
    backgroundColor: "{colors.darkBackground}"
    textColor: "{colors.darkPrimary}"
    typography: "{typography.body}"
    padding: "{spacing.desktop}"
  darkArticle:
    backgroundColor: "{colors.darkSurface}"
    textColor: "{colors.darkPrimary}"
    typography: "{typography.body}"
    padding: "{spacing.desktop}"
  darkMetadata:
    backgroundColor: "{colors.darkBackground}"
    textColor: "{colors.darkMuted}"
    typography: "{typography.metadata}"
  contextControls:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    typography: "{typography.metadata}"
    rounded: "{rounded.block}"
    padding: "{spacing.tablet}"
  contextLayer:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    typography: "{typography.metadata}"
    rounded: "{rounded.none}"
    padding: "{spacing.compact}"
  contextLayerApplied:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    typography: "{typography.metadata}"
    rounded: "{rounded.none}"
  contextDiff:
    backgroundColor: "{colors.codeBlock}"
    textColor: "{colors.hoverHighlight}"
    typography: "{typography.metadata}"
    rounded: "{rounded.block}"
    padding: "{spacing.compact}"
  modelSelector:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    typography: "{typography.metadata}"
    rounded: "{rounded.none}"
    padding: "{spacing.compact}"
  accessibleIconControl:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    typography: "{typography.metadata}"
    rounded: "{rounded.none}"
    padding: "{spacing.compact}"
---

## Overview

Command Line Editorial is a restrained visual system for technical publishing. It treats the page like a precise article shell: centered content, high contrast, visible structure, and just enough blue accent to communicate focus or interaction. The mood is practical, sharp, and readable rather than decorative.

## Colors

Use black text on a white background as the default expression. Muted gray supports dates, authorship, captions, and secondary chrome. Blue is reserved for focus states, links, and selected affordances so it remains meaningful; use the accessible Microsoft link blue for white text and white page backgrounds, and switch to the lighter dark accent on near-black surfaces. Border grays define flat surfaces without introducing heavy depth, while shell gray supports terminal-adjacent frames. Dark mode inverts the reading surface to near-black with white text, softened by dark muted gray and a dark code surface.

## Typography

Editorial prose uses free sans-serif substitutions such as Inter, DM Sans, or Plus Jakarta Sans, with Segoe UI available for Microsoft-adjacent brand moments. Body copy should remain at 17px with a 1.7 line-height to preserve calm paragraph rhythm. Headings are medium weight, not bold-heavy: h1 is large and slightly tight, while h2 and h3 create a clear but quiet hierarchy. Metadata, captions, tags, and terminal-like chrome use Consolas or a system monospace stack.

## Layout

Center articles in a 740px maximum content shell, matching the source site's simple editorial measure. Keep prose, lists, and dense reading blocks within that same shell for a direct single-column read. Use 30px page padding on desktop, 24px on tablet, and 16px on mobile. Let paragraphs breathe; the design should feel like a publication, not an application dashboard.

## Elevation & Depth

Prefer flat planes, borders, and tonal contrast over shadows. Surfaces should feel printed or terminal-adjacent: crisp, bounded, and direct. Code and media blocks may use filled backgrounds, but they should remain embedded in the article flow rather than floating above it.

## Shapes

Use sharp tags and editorial labels with no rounding. Inline code can use a small 4px radius for legibility inside prose. Larger media and code blocks use an 8px radius to soften dense rectangular content without making the system feel playful.

## Components

Page and article containers carry the black-on-white reading experience. Metadata rows use small monospace text and muted color. Links and focus indicators use the blue accent sparingly and visibly. Tags are uppercase monospace labels with sharp corners. Shell frames, dividers, code blocks, and media blocks provide crisp editorial structure. Model selectors should feel like compact input chrome inside the text surface rather than separate configuration panels; one control should expose the full Copilot model list, Auto selection, and usage-based AI credit rate. Context controls should live inside the relevant text surface as compact input chrome, using sharp multi-select icon controls, black applied states, and optional dark diff previews; context additions reuse the hover highlight token rather than introducing a second success green. Dark page, article, and metadata components define the inverted reading mode without changing the article-led hierarchy.

## Accessibility

Meet WCAG AA contrast for text and WCAG 1.4.11 non-text contrast for icon controls in both light and dark themes. SVG icons inside interactive controls must use `currentColor` so selected, hover, focus, and dark-mode states inherit the same accessible foreground color as surrounding text. Every form control must have a programmatic label even when the visible UI is intentionally compact. Run `npm run test:a11y` for UI changes, alongside visual validation, and fix any automated axe violations before shipping.

## Do's and Don'ts

Do prioritize readable long-form rhythm, clear hierarchy, crisp borders, sparse interaction color, and verified accessibility contrast. Do keep typography medium-weight and editorial. Do keep model and context controls visually subordinate to the text input they modify. Do support dark mode with true contrast rather than tinted approximations.

Don't add decorative gradients, heavy shadows, soft pill tags, crowded sidebars, or multiple competing accent colors. Don't show context toggles as tabs; use pressed multi-select controls. Don't use monospace for body prose. Don't reduce paragraph line-height below the specified reading rhythm.
