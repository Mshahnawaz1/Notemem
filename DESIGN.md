# Notemem Design Specification

## 1. Design Philosophy
Notemem should feel like a well-made engineering tool, not a template: a warm paper background, deep green ink, thin rules and square corners. The reference is potpie.ai. Decoration is limited to what a notebook would have: ruled lines, framed cells and corner ticks.

## 2. Brand & Aesthetics

### 2.1 Color Palette
Defined in `web/tailwind.config.js`:
- `paper` `#F8F6F1`: page background. Surfaces are white.
- `ink` `#0F2A23` (text), `ink-soft` `#4F6B63` (secondary text, the second line of headlines), `ink-faint` `#8A9C96` (hints).
- `line` `#DCE2DE` and `line-strong` `#B9C6C1`: borders and dividers.
- `brand` `#C1E05A`: lime, only for the primary action, selection and small markers. Text on it is `ink`, never white.
- `mist` `#DCEBEA`: pale teal for the GitHub nav cell, active tabs and version chips.

### 2.2 Typography
- **Headings:** Inter Tight (`font-display`), semibold, tight tracking.
- **Body:** Inter (`font-sans`).
- **Labels, buttons, nav, URLs and pad contents:** JetBrains Mono (`font-mono`). Labels and buttons are uppercase with wide tracking (the `.label` class).

### 2.3 Visual Details
- **Corners:** square. Don't use `rounded-*` except for status dots.
- **Depth:** 1px borders instead of shadows.
- **Texture:** `.ruled` draws faint notebook lines on the landing page, `.ruled-dark` draws the same lines as a grid on dark surfaces, and `.ticks` adds corner marks to a framed block.
- **Scale:** keep the landing page compact: 44px buttons, a 52px navbar, a 1080px content width and section headings around 34px.

---

## 3. Web UI Layouts

### 3.1 Landing Page (`/`)
The landing page prioritizes conversion and clearly explains the unique value proposition:
- **Navbar:** Logo on the left, a GitHub link on the right, nothing else.
- **Hero Section:** A large two-tone headline (ink, then `ink-soft`) and a short pitch.
- **Primary Actions:** 
  - A prominent **"Create a Room"** button (one-click instant setup).
  - A secondary **"Join Room"** input/button for users who already have read/write keys.
- **Information:** Below the actions: how it works (three steps), HTTP and MCP examples in a tabbed code block, safety facts, and a strip of limits.
- **Footer:** dark `ink` background with the `.ruled-dark` grid texture: logo, pitch, Create a room and GitHub buttons, link columns, and a faint wordmark behind the content (desktop only). Keep it compact, about 300px tall on desktop.

### 3.2 Room UI (The Workspace)
Once inside a room, the layout shifts to a functional, desktop-like app experience:
- **Sidebar (Left):** 
  - **Top:** A list of the room's named pads (up to 20).
  - **Bottom Left:** Room settings, active read/write URLs, copy-to-clipboard buttons, and the 30-day expiry countdown.
- **Main Editor (Right):** A large, full-bleed, distraction-free text editor area (using JetBrains Mono).
- **History View:** 
  - Activated via a simple toggle on the active pad. 
  - The editor slides or shrinks to reveal a **Timeline of Revisions** anchored to the right edge, allowing users to preview and restore previous versions of the pad.

## 4. Components
Shared classes live in `web/src/index.css`; the logo, navbar and GitHub link are in `web/src/components/Brand.tsx`.

- **Buttons:** `.btn-primary` (lime), `.btn-secondary` (white with a border), `.btn-quiet` (text only). All are mono uppercase.
- **Inputs:** `.field`, a white box with a `line-strong` border that turns `ink` on focus.
- **Pad markdown:** `.pad-prose` maps the typography plugin to the palette. Code blocks sit on `paper` with a border.
- **Alerts/Banners:** Used sparingly (e.g. for "version changed" concurrency conflicts), with soft amber, red or mist backgrounds.

## 5. Development Guidelines (Tailwind)
- Use the palette tokens above (`bg-paper`, `text-ink`, `border-line`), not raw `zinc-*` classes.
- Inline styles are blocked by the CSP; put custom CSS in `web/src/index.css`.
- Make layouts responsive. On mobile the room sidebar collapses behind a menu button.
