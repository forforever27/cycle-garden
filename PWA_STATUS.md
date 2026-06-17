# Cycle Garden PWA Status

Date: 2026-06-17
Status: Local PWA prototype created

## Why This Replaces Apps Script UI

The Google Apps Script web app was too slow and visually constrained on mobile. It also showed the Google Apps Script banner, which made the app feel less private and less polished.

This PWA is built as a standalone mobile-first app shell. It can later be deployed on Vercel or another static host without the Apps Script banner.

## Current Local Features

- Dark liquid-glass mobile UI.
- Responsive phone layout without Google Apps Script wrapper.
- PWA manifest for installability.
- Service worker for offline loading.
- Local period start/end recording.
- Local optional notes and symptom chips.
- Calendar view and prediction window.
- Settings for prep days and reminder time.
- JSON data export.
- Temporary `.ics` Calendar export.

- JSON data import / restore (merge by id, never destroys existing records).
- Service worker is network-first: code/UI updates reach devices immediately when online, cache is offline fallback.

## Update 2026-06-17 (later session)

Added and deployed:

- Import / restore from a JSON backup (Settings page). Merge strategy by record id — importing never deletes current data; safe for blank-device restore or combining two devices.
- Export filename now dated (`cycle-garden-backup-YYYYMMDD.json`) with a "keep it safe" reminder.
- Prediction and `.ics` now use the date-latest period instead of the last-inserted one (fixed wrong predictions when an older period is back-filled).
- `.ics` now exports all four discreet reminders: `Restock essentials`, `Personal prep`, `Personal window`, `Body check-in`.
- Service worker switched from cache-first (fixed `v1`) to network-first (`v2`). This fixes a latent bug where code updates would never reach an installed device.

All verified in a local browser preview and confirmed live on GitHub Pages.

## Current Limitation

Data currently lives in browser local storage. The APP is reachable from any device (it is a public URL), but the DATA is per-browser/per-device and does not sync. Cross-device data sync still needs a cloud backend (see below).

## Recommended Cloud Upgrade

Use Supabase:

- Supabase Auth with Google sign-in.
- Supabase Postgres tables:
  - `periods`
  - `notes`
  - `settings`
  - `calendar_events`
- Row-level security so only Xy's account can read/write her data.
- Deploy frontend to Vercel.
- Add Google Calendar OAuth after auth is stable.

## Google Calendar Plan

The final PWA should not use Apps Script for Calendar sync.

Instead:

1. Xy signs in with Google.
2. The app asks for Calendar permission.
3. The backend creates discreet reminders:
   - `Personal prep`
   - `Personal window`
   - `Body check-in`
   - `Restock essentials`
4. Generated event IDs are stored so they can be updated or deleted cleanly.

## Local Preview

```text
http://localhost:8098/index.html
```

