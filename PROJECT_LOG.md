# Project Log

## 2026-07-21 - Operations Hub Secure Foundation

### Project

Added Stage 1 of the Restaurant Operations Hub as a private section of the existing Andiamo Dashboard. The first module is a Manager Improvement Inbox for capturing small operational improvements by text, phone photo, or voice recording and reviewing them later on another device.

### Decisions

- Keep the Tip Calculator and Operations Hub inside the same GitHub Pages dashboard.
- Keep the Tip Calculator's existing local browser data and calculations unchanged.
- Use Supabase only for the private cross-device Operations Hub.
- Use passwordless email links instead of a separate password.
- Design venue membership for future restaurant and assistant access rather than tying every record permanently to one person.
- Store photos and original audio in a private bucket and store note metadata separately.
- Require Row Level Security for every application table and private media access.
- Use only the public Supabase browser key in the site; never place a database password, secret/service-role key, or transcription provider key in the repository.
- Defer automatic transcription until it can run through a secure server-side function.
- Validate whether phone capture becomes a real habit before adding maintenance, complaints, tasks, or other modules.

### Changes Made

- Added `operations-hub.html`, `operations-hub.css`, and `operations-hub.js`.
- Added a private Operations Hub link to the Tip Calculator navigation.
- Added passwordless email authentication and persistent cross-device sessions.
- Added first-login venue and owner-membership setup.
- Added written note, category, importance, phone photo, live voice recording, audio-file fallback, and editable transcript inputs.
- Added private media uploads and private signed playback links.
- Added an Improvement Inbox with All, Inbox, Action, and Done filters.
- Added secure status updates and open-inbox counting.
- Added responsive phone and laptop layouts.
- Created Supabase tables for profiles, venues, venue memberships, improvement notes, and note attachments.
- Created a private `operations-media` bucket with a 25 MB per-file limit.
- Added table and storage Row Level Security policies.

### Validation Completed

- `node --check` passed for `operations-hub.js`, `app.js`, and `review-tool.js`.
- HTML ID inspection found no duplicate IDs and no missing JavaScript element references.
- `git diff --check` passed.
- A simulated signed-out browser test passed for the login screen and magic-link request.
- A simulated signed-in browser test passed for first venue setup, written-note saving, and inbox rendering.

### Still Required

- Complete a real magic-link sign-in on the published page.
- Test real Supabase writes, private photo upload, microphone recording, mobile layout, and cross-device review.
- Disable open new-user signup after Ubaldo's account has been created.
- Add automatic transcription only after the basic capture workflow proves useful.

## 2026-07-03 - Finish Week and Weekly History

### Project

Added a completed-week workflow for the tip distribution tool, extended it with safe reopening, changed allocation from weekly pooled tips to daily tip allocation, then added fast weekly shift entry.

### Decisions

- Preserve the existing `localStorage` key and migrate older saved data by defaulting `completedWeeks` to an empty list.
- Reuse the existing cent-based calculation and payout allocation logic for completion snapshots and history exports.
- Save a completed-week record before replacing the current week with a blank week.
- Keep the staff list and FOH/BOH split settings after finishing a week.
- Prevent duplicate completion while a completed record for the same week remains in Weekly History.
- Allow reopening only when the active week is empty so existing active tips and shifts are never overwritten.
- Restore reopened weeks from the completed snapshot without creating or editing staff records.
- Remove the completed history record only after the reopened active-week state is saved successfully.
- Allocate tips by individual date so staff only share tips earned on days they worked.
- Preserve legacy active weekly totals by assigning them to Monday and requiring daily allocation review.
- Keep old completed history records readable and exportable as legacy weekly allocation records.
- Keep the original single-shift form while adding a separate Weekly Shift Builder for faster recurring shift entry.
- Save builder-created shifts atomically so failed validation or storage errors do not partially update the active week.
- Leave the review response tool files and behaviour unchanged.

### Changes Made

- Added a clearly labelled **Finish Week** button beside Excel export.
- Added confirmation text summarising week range, total tips, FOH pool, BOH pool, shift count, and staff receiving payouts.
- Added finish validation for the existing export safety checks, undistributed positive FOH/BOH pools, exact cent reconciliation, and duplicate completed weeks.
- Added completed-week snapshots with unique ID, week dates, tips, split percentages, pool totals, staff payout results, detailed shifts, and completion timestamp.
- Added post-finish reset that clears weekly tips and shifts, advances the selected week by exactly seven days, and keeps staff and split settings.
- Added Weekly History with expandable payout and shift details, Excel re-export, and confirmed delete.
- Added **Reopen Week** to completed history records with confirmation, empty-active-week validation, and snapshot restoration.
- Replaced weekly Card/Tyro and cash inputs with a seven-day Daily Tips table.
- Reworked payout calculations so each date has separate FOH/BOH pools, separate point totals, separate leftover-cent allocation, and weekly staff payouts are summed from daily payouts.
- Added a compact Daily Allocation breakdown to the Summary.
- Expanded Excel export with daily tips, daily pools, daily staff payout allocations, weekly payout totals, detailed shifts, and cent reconciliation.
- Expanded Finish Week snapshots and Reopen Week restore data to include daily tip records and daily allocation details.
- Added active legacy data migration notice and review confirmation before export/finish.
- Added **Weekly Shift Builder** with one staff selector, eligibility-filtered area options, default settings, seven worked-day checkboxes, compact per-day overrides, point previews, confirmation, exact duplicate detection, and atomic batch saving.
- Improved the visible Excel reconciliation section to show formatted dollar totals, payout totals, difference, and Yes/No exact-cent status instead of raw cent values.
- Updated responsive styles for the new hero actions and history controls.
- Updated the `app.js` cache-busting query in `index.html`.

### Testing

- Manual browser retest still needed in Chrome with the known test week:
  - Card/Tyro tips: $423.65
  - Cash tips: $76.40
  - Total tips: $500.05
  - FOH pool: $350.04
  - BOH pool: $150.01
  - Five shifts across four staff members
- Attempted `node --check app.js`, but Node.js is not installed on the normal system path.
- Confirmed there is no bundled `node.exe` in the project folder.
- Completed static code review for daily allocation by date, weekly shift builder batch validation, exact duplicate detection, save-before-clear ordering, duplicate-week prevention, reopen save ordering, current-week export, history export, and unchanged point calculation functions.

## 2026-07-01 - Staff Management Improvements

### Project

Improved the existing local staff management flow for the tip distribution tool.

### Decisions

- Preserve the existing `localStorage` key and saved staff records.
- Upgrade older staff records in place by defaulting them to both FOH and BOH eligibility.
- Keep existing deactivate/reactivate behaviour and shift calculations unchanged.
- Filter only new shift entry choices by staff eligibility; existing recorded shifts remain intact.

### Changes Made

- Added duplicate staff-name prevention using trimmed, space-collapsed, case-insensitive comparison.
- Added a clear staff validation message for duplicates and missing eligibility.
- Added editable staff names in the staff list.
- Added FOH/BOH eligibility controls for each staff member.
- Updated the shift area dropdown to show only areas the selected active staff member can work.
- Added submit validation so an ineligible area cannot be saved to a new shift.

### Testing

- Attempted `node --check app.js`, but Node.js is not installed on the normal system path.
- Attempted in-app browser verification, but the browser runner hit a Windows permission issue.
- Attempted Chrome and Edge headless verification; the browser processes launched but did not return usable DOM/screenshot output in this shell.
- Completed code-path review for staff add/edit validation, eligibility filtering, deactivate/reactivate preservation, and unchanged payout rules.

### Follow-Up Fix

- Hardened staff duplicate detection after manual testing showed a duplicate legacy name could still be added.
- Replaced the add/edit checks with one shared staff validator that runs before adding a new record or saving an edited name.
- Strengthened the duplicate key to normalise Unicode, remove invisible zero-width characters, trim names, collapse repeated whitespace, and ignore capitalisation.
- Stopped rewriting legacy staff names during state hydration so existing saved staff data is preserved while comparisons still use the stronger normalised key.

### Duplicate Edit UI Fix

- Fixed duplicate edit validation so the message appears directly on the affected staff card.
- Reset invalid edited names back to the staff member's saved name immediately after a blocked save.
- Reset the card's FOH/BOH eligibility controls back to their saved values when a staff edit is rejected.
- Kept duplicate comparison across active and inactive staff using the strengthened normalised key.
- Left tip calculations, shift records, point rules, and payout logic unchanged.

## 2026-07-01 - Money Input Cents Fix

### Project

Fixed weekly tip inputs so Card/Tyro tips and Cash tips can accept dollars and cents.

### Cause

- The money inputs already used `step="0.01"` and `min="0"` in HTML.
- The JavaScript input handler saved `Number(field.value)` and called the full `render()` on every keystroke.
- The full render wrote the numeric value back into the active field, so partial decimal typing like `100.` was converted back to `100` before cents could be entered.

### Changes Made

- Added a money-specific input update path that stores the numeric value and refreshes calculated totals without rewriting the active input field.
- Preserved existing cent rounding, FOH/BOH pool reconciliation, staff management, and point rules.
- Kept Card/Tyro tips and Cash tips as non-negative decimal inputs with `step="0.01"`.

### Testing

- Manual retest needed in browser: entering `100.01` with a 70/30 split should show Total tips `$100.01`, FOH pool `$70.01`, and BOH pool `$30.00`.

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
