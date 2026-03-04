# Video feedback

A 90s-style video feedback simulation in the browser: point a “camera” at a “screen” showing its own view, with a pulsating blob (flame) between them, and watch the image feed back into swirling patterns.

**Live app:** [https://ukslim.github.io/video-feedback/](https://ukslim.github.io/video-feedback/)

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4

## Commands

- **Develop:** `pnpm dev` → [http://localhost:3000](http://localhost:3000)
- **Build:** `pnpm build`
- **Start (production):** `pnpm start`
- **Lint:** `pnpm lint`

## Behaviour

- **Flame:** A blob at the centre that pulsates in size and hue (red, orange, yellow, white).
- **Camera (drag):**
  - **Top third:** move up/down/left/right
  - **Middle third:** pitch/yaw
  - **Bottom third:** closer/further from the “screen”
- **Gyro:** On supported devices, the gyroscope drives the camera; drag still works for correction.
- **Auto tuning:** Brightness and contrast are adjusted so the feedback doesn’t collapse to solid white or black.

## Deploy (GitHub Pages)

The app is built and deployed via GitHub Actions on push to `main`. In the repo **Settings → Pages**, set **Source** to **GitHub Actions**.
