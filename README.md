# Cycle Garden PWA

Private period tracker PWA prototype.

## Current State

- Responsive mobile-first UI.
- Installable PWA manifest.
- Offline cache via service worker.
- Local data storage for period starts, period ends, notes, symptoms, and settings.
- Calendar `.ics` export as a temporary bridge.

## Next Cloud Step

Connect one of these:

- Supabase Auth + Postgres for private multi-device sync.
- Firebase Auth + Firestore for private multi-device sync.

Google Calendar should be connected through Google OAuth in the cloud version, not through the old Apps Script UI.

