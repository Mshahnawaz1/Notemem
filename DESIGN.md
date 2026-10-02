# Notemem Design Specification

## 1. Design Philosophy
Notemem's design is heavily inspired by modern, clean consumer tools like BetterShot. It embraces a lightweight, zero-setup ethos while remaining robust enough for AI agents and human users to share a seamless workspace. The UI is designed to feel native, responsive, and distraction-free.

## 2. Brand & Aesthetics

### 2.1 Color Palette
- **Backgrounds & Surfaces:** Clean white and zinc grays (from `zinc-50` to `zinc-900`) to create a bright, minimal workspace that focuses on the content.
- **Brand Accent:** A sharp **violet/purple**. This reflects the modern, AI/agentic nature of the product while providing a vibrant contrast against the stark white/zinc backgrounds.
- **Accents:** Soft pastel shadows and highlights (similar to BetterShot's peach/lilac previews) can be used to soften the aesthetic around marketing assets or onboarding UI.

### 2.2 Typography
- **UI & Marketing:** **Inter** (or Apple's SF Pro on macOS). Used for headings, buttons, marketing copy, and UI elements. Provides a streamlined, consumer-friendly look.
- **Editor & Technical Data:** **JetBrains Mono**. Used for the actual pad contents, code blocks, URLs, and secrets. Leans into the developer/agentic aesthetic and ensures clear readability of technical data.

### 2.3 Visual Details
- **Corners:** Generous rounded corners (`rounded-2xl` for containers, `rounded-lg` for inner elements).
- **Shadows:** Soft, diffused drop shadows (`shadow-xl` and `shadow-2xl`) to create depth for modals, popovers, and elevated feature panels, avoiding harsh borders.

---

## 3. Web UI Layouts

### 3.1 Landing Page (`/`)
The landing page prioritizes conversion and clearly explains the unique value proposition:
- **Hero Section:** A massive, bold hero section leading with the "Zero setup" pitch.
- **Primary Actions:** 
  - A prominent **"Create a Room"** button (one-click instant setup).
  - A secondary **"Join Room"** input/button for users who already have read/write keys.
- **Feature Grid:** Below the hero, visually distinct feature cards explain the agent-human interaction model, MCP support, and data safety.

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

- **Buttons:** Solid violet/purple for primary actions. Zinc/outline for secondary actions. Slight hover state scale and color transition.
- **Input Fields/Textareas:** Light zinc background, subtle border focus ring in the brand violet.
- **Alerts/Banners:** Used sparingly (e.g., for "version changed" concurrency conflicts), utilizing soft background colors with crisp typography.

## 5. Development Guidelines (Tailwind)
- Use standard Tailwind utility classes for consistency (`bg-zinc-50`, `text-zinc-900`, etc.).
- Custom brand color configured in `tailwind.config.js` as `brand`.
- Ensure responsive design, collapsing the sidebar on mobile devices behind a hamburger menu.
