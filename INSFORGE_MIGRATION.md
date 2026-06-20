# InsForge-First Runtime Notes

## Current status

The local backend has been scraped from the active product architecture. The app now builds against the frontend, InsForge database/RPC, InsForge Functions, and SQL migrations.

Active project:

- InsForge project: `sellmymeet`
- API base: `https://xxx3s5ke.us-east.insforge.app`
- Function base: `https://xxx3s5ke.function2.insforge.app`

## Active build surfaces

- `frontend/`: user-facing app, dashboards, settings, campaign pages, live/test pages.
- `functions/`: provider callbacks, OAuth/token exchange, queue actions, live/test execution, privileged provider actions.
- `migrations/`: InsForge schema/RPC changes.
- `context/`: product architecture and phase guidance.

Do not build new product features in `backend/`.

## Completed direction

- Frontend auth/profile hydration uses InsForge directly.
- Product data reads/writes are moving through `frontend/lib/insforge-product.js`.
- Live/test automation calls InsForge Functions through `frontend/lib/insforge-functions.js`.
- Twilio SMS/voice, Calendly, meeting, Bob queue, and email runtime actions are represented as InsForge Functions.
- Runtime secrets should live in InsForge secrets, not in a production local backend env.

## Remaining work

- Finish any remaining frontend pages that still expect retired local API behavior.
- Add missing provider functions, such as Calendly OAuth, HubSpot sync, and automation compatibility only if still needed.
- Keep callback URLs pointed at InsForge Functions.
- Remove obsolete backend deployment habits from future build plans.
