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

## Current Limitation

Data currently lives in browser local storage. This means it is not yet synced across devices.

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

