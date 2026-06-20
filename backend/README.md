# Retired Backend

The local backend app is no longer part of the active product runtime.

Do not add new product features, routes, services, workers, tests, Docker setup,
or deployment logic under `backend/`.

Active build surfaces:

- `frontend/` for the user-facing app.
- `functions/` for provider callbacks, queue actions, live/test execution, OAuth callbacks, and privileged provider calls.
- `migrations/` for InsForge schema/RPC changes.
- `context/` for product architecture and build guidance.

Runtime secrets belong in InsForge secrets. Local env files are development-only.
