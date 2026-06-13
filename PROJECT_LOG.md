# Project Log

## 2026-06-13 - Milestone 1 Started

### Project

Andiamo Venue Manager Dashboard for Andiamo Trattoria Chippendale.

### User Goals

- Save time when preparing weekly reports.
- Track daily and weekly sales.
- Track actual labour cost percentage first, with planned versus actual comparison later.
- Track productivity, covers, spend per head, bookings, Google reviews, shift notes, and issues for owners/head office.
- Generate both short WhatsApp summaries and formal email reports.
- Keep the first version private, local, and close to zero cost.

### Decisions

- Start with one venue: Andiamo Trattoria Chippendale.
- Design future data structure with multi-venue support in mind.
- Use Monday to Sunday reporting weeks.
- Prioritise actual labour cost in Version 1.
- Track lunch, dinner, delivery/takeaway, and functions/events sales in Version 1.
- Build Milestone 1 as a local static dashboard skeleton because Node.js and npm are not installed on the normal system path.

### Technology Decision

Original recommendation: Next.js, React, Tailwind CSS, SQLite, and Recharts.

Milestone 1 adjustment: use plain HTML, CSS, and JavaScript for the first skeleton so the dashboard can run immediately by opening `index.html`.

Reason:

- It costs $0.
- It requires no install step.
- It is easier for a beginner to inspect.
- It still allows us to learn layout, styling, navigation, and user interface basics.

Future plan:

- Move to Next.js once the local Node/npm setup is available.
- Add SQLite when we begin saving records.

### Changes Made

- Created first project folder.
- Created dashboard page skeleton.
- Added Andiamo Trattoria Chippendale branding.
- Added navigation placeholders.
- Added weekly metric cards.
- Added sales breakdown panel.
- Added owner summary preview.
- Added shift notes and future metric placeholders.
- Added copy-to-clipboard behaviour for the WhatsApp summary.
- Created `PROJECT_LOG.md`.
- Created `TODO.md`.

### Testing

- Confirmed project files were created.
- Confirmed JavaScript syntax passes with bundled Node.js.
- Confirmed main dashboard text exists in `index.html`.
- Attempted in-app browser visual verification, but the browser runner failed because of a Windows permission issue.
- Attempted Playwright visual verification, but the bundled Playwright package could not load `playwright-core`.

### Follow-Up

- Manual visual testing is still needed by opening `index.html` in a browser.
- Later we should install a normal Node.js/npm setup or use a complete browser testing setup before heavier frontend work.

## 2026-06-13 - Tip Distribution V1

### Project Shift

Reworked the local static app into a weekly tip distribution tool for Andiamo Trattoria Chippendale.

### Decisions

- Keep Version 1 as a local browser app with browser storage.
- Use Monday to Sunday weeks.
- Save reusable staff in `localStorage`.
- Enter simple shifts rather than exact start/end times.
- Default to 70% FOH and 30% BOH, with editable split fields that stay balanced to 100%.
- Export an Excel-compatible `.xls` file without adding dependencies.

### Changes Made

- Added weekly setup for Card/Tyro tips, cash tips, total tips, and split percentages.
- Added staff creation and deactivate/reactivate controls.
- Added FOH and BOH shift entry with automatic point previews.
- Added point calculation rules for manager, waiter, senior BOH, and non-senior BOH shifts.
- Added weekly summary cards and staff payout table.
- Added detailed shift list with delete controls.
- Added Excel-compatible export containing overview, staff totals, point breakdown, and detailed shifts.
- Reworked the layout for mobile friendly use.

### Testing

- Confirmed JavaScript syntax passes with bundled Node.js.
- Ran a local runtime harness to confirm the app loads without browser-only crashes.
- Checked a known calculation case: $1,000 total tips split into $700 FOH and $300 BOH, with expected point-based payouts.
- Attempted in-app browser verification, but the browser runner failed because of a Windows sandbox permission issue.

## 2026-06-13 - Review Response Tool V1

### Project

Added a local Google review response tool for Andiamo Trattoria Chippendale.

### Decisions

- Build as a separate `review-tool.html` page linked from the existing local app.
- Keep response generation offline and template-based for Version 1.
- Save generated response history in browser `localStorage`.
- Include delete and clear controls for the history log.
- Generate multiple options for SEO-friendly, manager, and owner response styles.

### Changes Made

- Added customer name, rating, platform, and review text inputs.
- Added response generation that adapts to positive, mixed, and negative ratings.
- Added natural detail detection for pasta, pizza, wine, service, special occasions, wait times, booking issues, value, and noise.
- Added varied Italian restaurant keywords without forcing the same phrase every time.
- Added copy buttons for every generated response option.
- Added local history with generated responses and copied-response tracking.

### Testing

- Confirmed `review-tool.js` syntax passes with bundled Node.js.
- Confirmed existing `app.js` still passes syntax checks.
- Ran a local runtime harness with a sample positive review and confirmed the tool creates three response groups with two options each.
- Attempted in-app browser visual verification, but the browser runner failed because of a Windows sandbox permission issue.
