# InsForge Migration Notes

## Current status

The repo is now linked to the InsForge project `tradeservice` and the database schema has been applied to the linked backend.

## Option B direction

This project is being migrated toward **InsForge-native backend usage**:

- Use the InsForge app URL for SDK/platform features
- Keep direct Postgres only where legacy Drizzle services still require it
- Gradually replace custom backend plumbing with InsForge services

## Step completed in this pass

1. Added `@insforge/sdk` to both frontend and backend packages.
2. Added frontend client scaffold:
   - `frontend/lib/insforge.js`
3. Added backend client scaffold:
   - `backend/src/services/insforge-client.js`
4. Updated config/env examples so the app can use:
   - `NEXT_PUBLIC_INSFORGE_URL`
   - `NEXT_PUBLIC_INSFORGE_ANON_KEY`
   - `INSFORGE_URL`
   - `INSFORGE_ANON_KEY`
   - `INSFORGE_API_KEY`
5. Updated the frontend API base fallback to support an InsForge URL-based path.

## Remaining migration path

### Near-term
- Move auth from custom JWT endpoints toward InsForge auth.
- Move outbound email into InsForge-native email sending where appropriate.
- Decide whether Bob actions execute through:
  - backend worker + InsForge database
  - InsForge functions/schedules

### Mid-term
- Replace direct lead CRUD API usage with InsForge SDK where safe.
- Move scheduling/call orchestration state into InsForge-first tables and RPC/functions.
- Add RLS and admin/user separation.

### Long-term
- Remove legacy direct backend layers that only duplicate InsForge features.
- Keep only business-specific orchestration logic in app code.
