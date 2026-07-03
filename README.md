# Andiamo Tip Distribution

Private local browser app for Andiamo Trattoria Chippendale weekly tip distribution.

## Version 1

- Monday to Sunday weekly setup
- Seven-day Card/Tyro and cash tip entry
- Default 70% FOH and 30% BOH split, editable per week
- Reusable staff saved in the browser with deactivate/reactivate controls
- Duplicate staff-name validation that ignores capitalisation and extra spaces
- Editable staff names and FOH/BOH eligibility
- Simple FOH and BOH shift entry filtered by staff eligibility
- Weekly Shift Builder for adding one staff member's selected week shifts in one batch
- Automatic points and payout calculations
- Weekly summary report
- Excel-compatible `.xls` export
- Finish Week workflow with confirmation and exact cent reconciliation
- Completed Weekly History saved in the browser
- Expandable completed weeks with payouts, detailed shifts, reopen, re-export, and confirmed delete
- Mobile friendly layout

## Daily Tip Allocation

Tips are allocated by date, not from one combined weekly pool. Each day has its own Card/Tyro tips, cash tips, daily total, FOH pool, and BOH pool.

For each date, the app converts the daily total to cents, applies the FOH/BOH split, assigns any rounding remainder to BOH as the exact remaining cents, and distributes that date's FOH and BOH pools only to staff who worked that date in the matching area. Weekly staff payouts are the sum of their daily payouts.

If older active browser data has only weekly Card/Tyro and cash totals, those totals are assigned to Monday so they are not lost. The app shows a review notice and blocks export/finish until the daily allocation is confirmed.

## Weekly Shift Builder

Use **Weekly Shift Builder** for fast entry when one employee worked several days in the active Monday-to-Sunday week. Select the employee once, choose default shift settings, tick each worked day, optionally override individual days, then add all selected shifts together.

The builder checks every selected row before saving. Exact duplicate shifts are blocked, but multiple shifts on the same day are allowed when any shift detail differs. The original single **Add Shift** form remains available for individual edits and unusual shifts.

## Finishing a Week

Use **Finish Week** after the weekly tips and shifts have been reviewed.

Before saving, the app confirms the week range, total tips, FOH pool, BOH pool, shift count, and number of staff receiving payouts. It blocks finishing when the same safety checks as Excel export fail, when any positive daily FOH or BOH pool has no matching points, when migrated daily tips have not been reviewed, when payouts do not reconcile exactly to total tips, or when the selected week has already been completed.

After a successful save, the completed-week snapshot is stored in local browser storage. The current week's tips and shifts are cleared only after the completed record is saved, the staff list remains unchanged, the split settings are kept, and the selected week advances by seven days.

## Reopening a Week

Use **Reopen Week** from Weekly History when a completed week needs editing.

The app only reopens a completed week when the active week is empty: all daily Card/Tyro tips are zero, all daily cash tips are zero, and there are no active shifts. Reopening restores the saved week start, daily tips, split percentages, and detailed shifts without changing the staff list. The completed history record is removed only after the restored active week is saved successfully.

## Review Response Tool

- Customer name, rating, platform, and review text input
- SEO-friendly, friendly manager, and professional owner responses
- Multiple options per response style
- Natural Andiamo Trattoria Chippendale and Italian restaurant keywords
- Rating-aware positive, mixed, and damage-control wording
- Copy buttons
- Local browser history log

Open `index.html` for tip distribution or `review-tool.html` for review responses.
