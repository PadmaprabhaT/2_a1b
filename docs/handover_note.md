

Handover note · MD
# Handover Note: StaySpot Backend

**Inherited from:** Group 2, `mglsj/ssd-a1-g2` (final commit `a373b74`)

## What worked

- Schema constraints, the wallet audit trigger and the `idx_active_stay` partial unique index enforced the rules at the database level, so the API only had to map errors to HTTP codes.
- The materialized view, the Workflow 2 window query and the Mongo workflows plugged straight into the `/api/analytics` endpoints.
- The runbook, seeders and `test_queries.sql` made rebuilding and checking the database quick.
## What did not work

- `process_booking_payment` reported success or failure only through `RAISE NOTICE/WARNING`, so a client could not get the booking ID or the rejection reason.
## What we changed and why

- Added `OUT` parameters `p_booking_id`, `p_success` and `p_error` to `process_booking_payment`. The API now returns the booking, or `400 BOOKING_REJECTED` with the reason.


