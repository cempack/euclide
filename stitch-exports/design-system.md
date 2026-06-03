---
name: OpenCode Terminal-Aesthetic
colors:
  surface: '#faf9f9'
  surface-dim: '#dadada'
  surface-bright: '#faf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e9e8e8'
  surface-container-highest: '#e3e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#4d4545'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f0f0'
  outline: '#7f7575'
  outline-variant: '#d0c4c3'
  surface-tint: '#625d5d'
  primary: '#050404'
  on-primary: '#ffffff'
  primary-container: '#201d1d'
  on-primary-container: '#8a8484'
  inverse-primary: '#ccc5c4'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2dfdf'
  on-secondary-container: '#636263'
  tertiary: '#050404'
  on-tertiary: '#ffffff'
  tertiary-container: '#201d1d'
  on-tertiary-container: '#8a8484'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e8e1e0'
  primary-fixed-dim: '#ccc5c4'
  on-primary-fixed: '#1e1b1b'
  on-primary-fixed-variant: '#4a4646'
  secondary-fixed: '#e5e2e2'
  secondary-fixed-dim: '#c8c6c6'
  on-secondary-fixed: '#1b1b1c'
  on-secondary-fixed-variant: '#474647'
  tertiary-fixed: '#e9e1e0'
  tertiary-fixed-dim: '#ccc5c4'
  on-tertiary-fixed: '#1e1b1b'
  on-tertiary-fixed-variant: '#4a4646'
  background: '#faf9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e3e2e2'
  ink-deep: '#0f0000'
  surface-soft: '#f8f7f7'
  hairline: rgba(15,0,0,0.12)
  hairline-strong: '#646262'
  mute: '#646262'
  ash: '#9a9898'
  tui-accent: '#007aff'
  tui-danger: '#ff3b30'
  tui-success: '#30d158'
typography:
  display-xl:
    fontFamily: IBM Plex Mono
    fontSize: 38px
    fontWeight: '700'
    lineHeight: '1.5'
  display-xl-mobile:
    fontFamily: IBM Plex Mono
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.5'
  heading-md:
    fontFamily: IBM Plex Mono
    fontSize: 16px
    fontWeight: '700'
    lineHeight: '1.5'
  body-md:
    fontFamily: IBM Plex Mono
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-strong:
    fontFamily: IBM Plex Mono
    fontSize: 16px
    fontWeight: '500'
    lineHeight: '1.5'
  body-tight:
    fontFamily: IBM Plex Mono
    fontSize: 16px
    fontWeight: '500'
    lineHeight: '1.0'
  button-md:
    fontFamily: IBM Plex Mono
    fontSize: 16px
    fontWeight: '500'
    lineHeight: '2.0'
  caption-md:
    fontFamily: IBM Plex Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '2.0'
spacing:
  xxs: 1px
  xs: 4px
  sm: 8px
  lg: 16px
  xl: 24px
  section-desktop: 96px
  section-tablet: 64px
  section-mobile: 48px
---

## Brand & Style

The design system is built on the philosophy of **Typographic Absolutism** and **Technical Austerity**. It mimics the high-utility, no-nonsense environment of a developer's terminal or a meticulously formatted `README.md` file. The aesthetic is "Low-Fi Pro"—it signals transparency, precision, and a deep focus on technical execution over marketing veneer.

The visual style is a hybrid of **Minimalism** and **Brutalism**. It rejects modern trends like shadows, gradients, and soft blurs in favor of a flat, grid-aligned, and ink-on-paper feel. By utilizing a warm cream canvas instead of a sterile digital white, the system evokes the quality of high-end printed technical documentation.

**Key Principles:**
- **Monospaced Utility:** Every character and layout decision must respect the rhythm of a monospaced font.
- **Flat Hierarchy:** Depth is communicated through color inversion and typographic scale rather than Z-axis effects.
- **Interactive Affordance:** A strict distinction is made between static containers (sharp 0px) and interactive elements (soft 4px).

## Colors

The palette is optimized for legibility and "ink-on-paper" warmth. The **Primary (Ink)** color is used for all essential information, while the **Neutral (Canvas)** provides a soft, non-glaring background.

- **Canvas & Surface:** Use the neutral `#fdfcfc` for the main background. Use `surface-soft` for subtle sectioning and `secondary` for elevated surfaces like code snippets or disabled states.
- **Ink & Text:** The primary `#201d1d` is the default for headlines and body. Use `mute` and `ash` for metadata and secondary hierarchies.
- **TUI (Terminal User Interface) Palette:** Semantic colors (accent, danger, success) are reserved strictly for technical mockups, status indicators, and command-line simulations. They should not be used for general marketing decorations.
- **Borders:** Use the `hairline` token for subtle structural separation and `hairline-strong` for defined tab strips or header boundaries.

## Typography

This system uses monospaced typography exclusively. There are no exceptions for sans-serif or serif fonts. The rhythm is governed by the consistent character width inherent to the font choice.

- **Primary Font:** IBM Plex Mono (as the primary fallback for Berkeley Mono).
- **Scale:** The typography is built on a 16px base. Hierarchy is achieved through weight (400 to 700) and line height rather than excessive size variations.
- **Vertical Air:** Buttons and captions utilize a generous 2.0 line height to ensure legibility and create "visual breathing room" within the dense monospaced layout.
- **Brackets:** Section headers and status markers often use bracketed notation (e.g., `[SECTION NAME]`) to reinforce the terminal aesthetic.

## Layout & Spacing

The layout follows a strict 8px base grid, emphasizing vertical rhythm and systematic alignment.

- **Grid Strategy:** Use a fixed-width central column (Max 960px) for standard content to mimic the readable width of a document. For hero sections and technical displays, allow the frame to expand to 1100px.
- **Section Spacing:** A universal vertical rhythm is applied between major page sections. This scales down from 96px on desktop to 48px on mobile to maintain appropriate density.
- **Alignment:** All elements should align to the left "margin" of the content column. Centered text is discouraged unless used for specific high-impact hero statements.

## Elevation & Depth

This system is strictly flat. Visual depth is never achieved through shadows or Z-space blurs.

- **Tonal Layers:** Depth is created by "inverting" or "stacking" surfaces. A darker surface (`surface-dark`) represents a focused technical area, such as a terminal mockup, within the light canvas.
- **Hairlines:** Use 1px hairlines to separate content modules. These should be subtle and utilize the translucent `hairline` token.
- **Focus States:** Interaction focus is indicated by a 1px solid border using the `ink` color. Do not use outer glows or "ring" effects.

## Shapes

The shape language is strictly geometric and reinforces the "interactive vs. static" rule.

- **Sharp (0px):** All layout-level containers, sections, cards, and navigation bars must have sharp corners. This maintains the rigid, grid-like feel of a text editor.
- **Interactive (4px):** All touchable or clickable elements—buttons, input fields, tags, and code snippets—receive a 4px corner radius. This provides a subtle "affordance" hint that these items are distinct from the background.
- **Exceptions:** Avatar images are the only elements allowed to use a fully rounded (9999px) shape.

## Components

Components are designed to look like text-based UI elements evolved for the web.

- **Buttons:** Solid primary fill (`ink`) with canvas-colored text. They use a 4px radius and 2.0 line height for vertical presence. Secondary buttons use a simple 1px hairline border.
- **Interactive Markers (ASCII):** Use character-based signals for UI state. 
    - `[+]` Expand / Add
    - `[-]` Collapse / Remove
    - `[x]` Close / Delete
    - `→` Link / Action
- **Input Fields:** Flat background (`surface-soft`) with a 4px radius and a 1px hairline border. On focus, the border becomes solid `ink`.
- **Chips & Tags:** Small 4px rounded containers with `caption-md` typography.
- **Lists:** Use `body-md` with custom ASCII bullets. Feature lists use `[+]` as the bullet point.
- **Cards:** No shadows. Cards are defined by either a 1px hairline border or a subtle tonal shift to `secondary` or `surface-soft`. Corners must be 0px sharp.
- **Terminal Mockup:** A specific component using `--colors-surface-dark` background, monospaced text in `tui-accent` or `tui-success`, and sharp corners.