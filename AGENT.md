# Agent guidance for video-feedback

This document gives the AI agent context and rules for working in this repo.

## Repo overview

- **Stack**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4.
- **Entry**: App Router under `app/` — `app/layout.tsx`, `app/page.tsx`, `app/globals.css`.
- **Paths**: Use the `@/*` alias (maps to repo root) in imports.
- **Commands**: `pnpm dev` (development), `pnpm build`, `pnpm start`, `pnpm lint`.

## Dev server expectation

- **Assume the user has already started the dev server** with `pnpm dev` (default: http://localhost:3000).
- **If the app is unreachable** (e.g. Chrome DevTools navigation fails, connection refused, or no page loads):
  - Do **not** start `pnpm dev` yourself.
  - **Prompt the user**: e.g. “The dev server doesn’t appear to be running. Please start it with `pnpm dev` in the project root, then tell me when it’s ready.”

## Use Chrome DevTools to confirm and verify

- **Confirm observations**: Use the **Chrome DevTools MCP** (`user-chrome-devtools`) to inspect the running app (e.g. `list_pages`, `navigate_page`, `take_snapshot`) so observations are based on the live page, not only on code.
- **Verify functionality after changes**: After writing or changing code that affects the UI or behaviour:
  1. Ensure the app is loaded (e.g. `navigate_page` to `http://localhost:3000` or reload).
  2. Use DevTools as needed: **take_snapshot** for structure/accessibility, **list_console_messages** for errors/warnings, **click** (with snapshot UIDs) to test interactions.
  3. Use **take_screenshot** when you need to confirm visual state or when using the screenshot-pixel-inspect skill.
- Prefer **take_snapshot** over screenshots for structural/behaviour checks; use screenshots when validating pixel-level or visual design.

## Available agent skills

Use these when they match the task:

- **screenshot-pixel-inspect**: Validate visual output with screenshots and ImageMagick (e.g. symmetry, exact colours). Use Chrome DevTools to capture the screenshot (e.g. `take_screenshot` with `filePath`), then follow the skill for pixel sampling and iteration.
- **create-rule**: Add or change Cursor rules (e.g. `.cursor/rules/*.mdc`, project conventions).
- **create-skill**: Create or edit Agent Skills (e.g. SKILL.md format, best practices).
- **update-cursor-settings**: Change Cursor/editor settings in `settings.json`.
- **exploring-aws**: Read-only exploration of AWS accounts (assume, list resources, inspect state).
- **slides-generator**: Generate interactive slides (React + Tailwind) for presentations, demos, or benchmarks.

## Conventions

- Prefer TypeScript and existing patterns (functional components, App Router, Tailwind utility classes).
- Use the existing `app/` layout and global styles; add new routes under `app/` as appropriate.
- Run `pnpm lint` when relevant to catch lint issues.
