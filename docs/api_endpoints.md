Api endpoints · MD
# StaySpot API Endpoints

Express server in `api/` over PostgreSQL (guests, properties, bookings, wallet audit logs, materialized view, stored procedure) and MongoDB (amenities, search sessions, reviews).

## 1. Setup

| Item | Value |
|---|---|
| Base URL | `http://localhost:3000/api` |
| Port | `3000` (hard-coded in `server.js`, binds `0.0.0.0`) |
| PostgreSQL | `process.env.DB` (connection string), pool in `db.js` |
| MongoDB | `process.env.MONGO_URI`, lazy connection in `mongo.js` |
| Auth | None. CORS is enabled for all origins |
| Body format | JSON (`express.json()`) |
| IDs | UUIDs (validated with `uuid.validate`) |

Test the PostgreSQL connection: `node test-db.js`

### Route files

| Mount path | File |
|---|---|
| `/api/properties` | `routes/properties.js` |
| `/api/guests` | `routes/guests.js` |
| `/api/bookings` | `routes/bookings.js` |
| `/api/analytics` | `routes/analytics.js` |
| `/api/health` | `server.js` |

## 2. Response conventions

Success:

```json
{ "success": true, "data": { } }
```

List endpoints add `count` and `pagination`:

```json
{
  "success": true,
  "count": 20,
  "pagination": { "total": 120, "limit": 20, "offset": 0, "has_more": true },
  "data": [ ]
}
```

Error:

```json
{
  "success": false,
  "error": { "code": "INVALID_ID", "message": "A valid guest ID is required." }
}
```

**Pagination** (all list endpoints): `limit` 1 to 100 (default 20), `offset` >= 0 (default 0). Otherwise `400 INVALID_PAGINATION`.

## 3. Endpoint summary

| Method | Endpoint | DB | Purpose |
|---|---|---|---|
| GET | `/api/health` | none | Health check |
| GET | `/api/properties` | PG | List properties |
| GET | `/api/properties/:id` | PG | Property details |
| GET | `/api/properties/:id/amenities` | PG + Mongo | Amenities, rules, accessibility |
| GET | `/api/guests` | PG | List guests |
| GET | `/api/guests/:id` | PG | Guest details |
| GET | `/api/guests/:id/audit-logs` | PG | Wallet audit history |
| GET | `/api/bookings` | PG | List and filter bookings |
| POST | `/api/bookings` | PG | Create a booking (stored procedure) |
| PATCH | `/api/bookings/:id/status` | PG | Advance booking status |
| GET | `/api/analytics/window-revenue` | PG | Daily revenue, 7-day moving average, rank |
| GET | `/api/analytics/property-performance` | PG (MV) | Materialized view summary |
| POST | `/api/analytics/refresh` | PG | Refresh materialized view |
| POST | `/api/analytics/search-sessions` | PG + Mongo | Record a search session |
| GET | `/api/analytics/search-hotspots` | Mongo | Geo summary of recent searches |
| GET | `/api/analytics/reviews` | Mongo | Rating distribution and top tags |

---

## 4. Health

### GET `/api/health`

```json
{ "success": true, "message": "StaySpot API is running!" }
```

---

## 5. Properties

### GET `/api/properties`

List properties with pagination and sorting.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `limit` | int | 20 | 1 to 100 |
| `offset` | int | 0 | >= 0 |
| `sort` | string | `title` | `title`, `price_asc`, `price_desc` (sorts by `base_price`) |

Response: list format from section 2, plus `"sort": "title"`. Each item is a full `properties` row.

| Status | Code |
|---|---|
| 200 | |
| 400 | `INVALID_PAGINATION`, `INVALID_SORT` |
| 500 | `DATABASE_ERROR` |

### GET `/api/properties/:id`

Returns `{ success, data: <properties row> }`.

| Status | Code |
|---|---|
| 200 | |
| 400 | `INVALID_ID` |
| 404 | `PROPERTY_NOT_FOUND` |
| 500 | `DATABASE_ERROR` |

### GET `/api/properties/:id/amenities`

Confirms the property exists in PostgreSQL, then reads MongoDB collection `PropertyAmenities` by `property_id` (stored as a BSON UUID).

```json
{
  "success": true,
  "data": {
    "property_id": "uuid",
    "amenity_categories": [],
    "house_rules": [],
    "accessibility_features": []
  }
}
```

| Status | Code |
|---|---|
| 200 | |
| 400 | `INVALID_ID` |
| 404 | `PROPERTY_NOT_FOUND`, `AMENITIES_NOT_FOUND` |
| 500 | `AMENITIES_QUERY_FAILED` |

---

## 6. Guests

### GET `/api/guests`

Paginated list (`limit`, `offset`), ordered by `id`. Each item is a full `guests` row.

| Status | Code |
|---|---|
| 200 | |
| 400 | `INVALID_PAGINATION` |
| 500 | `DATABASE_ERROR` |

### GET `/api/guests/:id`

Returns `{ success, data: <guests row> }` (includes `wallet_balance`).

| Status | Code |
|---|---|
| 200 | |
| 400 | `INVALID_ID` |
| 404 | `GUEST_NOT_FOUND` |
| 500 | `DATABASE_ERROR` |

### GET `/api/guests/:id/audit-logs`

Wallet audit history for a guest, newest first (`ORDER BY "timestamp" DESC, id DESC`).

| Query param | Type | Default | Notes |
|---|---|---|---|
| `start_date` | `YYYY-MM-DD` | none | Inclusive, must be a real calendar date |
| `end_date` | `YYYY-MM-DD` | none | Inclusive (query uses `< end_date + 1 day`) |
| `limit` | int | 20 | 1 to 100 |
| `offset` | int | 0 | >= 0 |

`start_date` must not be after `end_date`.

```json
{
  "success": true,
  "guest_id": "uuid",
  "pagination": { "total": 5, "limit": 20, "offset": 0, "has_more": false },
  "filters": { "start_date": null, "end_date": null },
  "data": [
    {
      "id": "uuid",
      "guest_id": "uuid",
      "amount_changed": "-250.00",
      "action_type": "string",
      "balance_after": "750.00",
      "running_balance": "750.00",
      "timestamp": "2026-10-01T10:00:00.000Z"
    }
  ]
}
```

`running_balance` is an alias of `balance_after`.

| Status | Code |
|---|---|
| 200 | |
| 400 | `INVALID_ID`, `INVALID_START_DATE`, `INVALID_END_DATE`, `INVALID_DATE_RANGE`, `INVALID_PAGINATION` |
| 404 | `GUEST_NOT_FOUND` |
| 500 | `DATABASE_ERROR` |

---

## 7. Bookings

Booking status values (`booking_status` enum): `CONFIRMED`, `CHECKED_IN`, `COMPLETED`.

### GET `/api/bookings`

| Query param | Type | Default | Notes |
|---|---|---|---|
| `limit` | int | 20 | 1 to 100 |
| `offset` | int | 0 | >= 0 |
| `status` | string | none | `CONFIRMED`, `CHECKED_IN`, `COMPLETED` |
| `guest_id` | UUID | none | Filter by guest |
| `property_id` | UUID | none | Filter by property |

Ordered by `created_at DESC, id DESC`. Each item:

```json
{
  "id": "uuid",
  "guest_id": "uuid",
  "guest_name": "string",
  "property_id": "uuid",
  "property_title": "string",
  "total_cost": "500.00",
  "status": "CONFIRMED",
  "check_in_date": "2026-11-01",
  "check_out_date": "2026-11-05",
  "created_at": "timestamp"
}
```

The response also includes `pagination` and a `filters` object echoing `status`, `guest_id`, `property_id` (null when unset).

| Status | Code |
|---|---|
| 200 | |
| 400 | `INVALID_PAGINATION`, `INVALID_STATUS`, `INVALID_ID` |
| 500 | `DATABASE_ERROR` |

### POST `/api/bookings`

Creates a booking by calling the stored procedure `process_booking_payment`, which debits the guest wallet; a trigger writes the `wallet_audit_logs` row.

**Body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `guest_id` | UUID | yes | Must exist |
| `property_id` | UUID | yes | |
| `total_cost` | number | yes | > 0 |
| `nights` | integer | yes | >= 1 |
| `check_in_date` | `YYYY-MM-DD` | no | Defaults to `CURRENT_DATE` |
| `check_out_date` | `YYYY-MM-DD` | no | If both dates are sent, must equal `check_in_date + nights` |

```json
{
  "guest_id": "uuid",
  "property_id": "uuid",
  "total_cost": 500,
  "nights": 4,
  "check_in_date": "2026-11-01",
  "check_out_date": "2026-11-05"
}
```

**Flow:** read balance before, `CALL process_booking_payment(...)`, read balance after, fetch the new booking, fetch the latest audit log.

**201 response**

```json
{
  "success": true,
  "message": "Booking created successfully.",
  "balance_before": "1000.00",
  "balance_after": "500.00",
  "audit_log": {
    "id": "uuid",
    "amount_changed": "-500.00",
    "action_type": "string",
    "balance_after": "500.00",
    "timestamp": "timestamp"
  },
  "data": { "id": "uuid", "guest_name": "string", "property_title": "string", "status": "CONFIRMED" }
}
```

**Rejected by the procedure (400)**

```json
{
  "success": false,
  "error": { "code": "BOOKING_REJECTED", "message": "<p_error from procedure>" },
  "balance_before": "100.00",
  "balance_after": "100.00"
}
```

| Status | Code |
|---|---|
| 201 | |
| 400 | `INVALID_ID`, `INVALID_COST`, `INVALID_NIGHTS`, `INVALID_CHECK_IN_DATE`, `INVALID_CHECK_OUT_DATE`, `DATE_NIGHTS_MISMATCH`, `BOOKING_REJECTED` |
| 404 | `GUEST_NOT_FOUND` |
| 500 | `BOOKING_FAILED` |

### PATCH `/api/bookings/:id/status`

Moves a booking forward. Allowed transitions only: `CONFIRMED` to `CHECKED_IN`, then `CHECKED_IN` to `COMPLETED`. The booking must belong to `guest_id`.

**Body**

```json
{ "status": "CHECKED_IN", "guest_id": "uuid" }
```

`status` must be `CHECKED_IN` or `COMPLETED`. `guest_id` must be the guest who owns the booking.

**200 response**

```json
{
  "success": true,
  "message": "Booking status updated successfully.",
  "data": { "id": "uuid", "guest_id": "uuid", "property_id": "uuid", "total_cost": "500.00", "status": "CHECKED_IN", "check_in_date": "...", "check_out_date": "...", "created_at": "..." }
}
```

| Status | Code | When |
|---|---|---|
| 200 | | Updated |
| 400 | `INVALID_ID`, `INVALID_STATUS` | Bad booking ID, guest ID, or target status |
| 403 | `GUEST_MISMATCH` | Booking belongs to a different guest |
| 404 | `BOOKING_NOT_FOUND` | No such booking |
| 409 | `INVALID_TRANSITION` | Not allowed from current status |
| 409 | `ACTIVE_STAY_EXISTS` | Unique constraint (PG `23505`): guest already has a checked-in booking |
| 500 | `STATUS_UPDATE_FAILED` | |

---

## 8. Analytics

### GET `/api/analytics/window-revenue`

PostgreSQL window-function report for the last 30 days. For each active property and each day it returns daily revenue (zero-filled via a calendar cross join), a 7-day moving average (`RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW`), the trailing 7-day total, and `DENSE_RANK()` of properties per day by moving average. No query params.

Sorted by `booking_date DESC, rank_by_moving_avg ASC, property_id ASC`.

```json
{
  "success": true,
  "count": 30,
  "data": [
    {
      "booking_date": "2026-10-10",
      "property_id": "uuid",
      "daily_revenue": "0.00",
      "moving_avg_7d": "125.50",
      "trailing_7d_revenue": "878.50",
      "days_in_window": 7,
      "rank_by_moving_avg": 1
    }
  ]
}
```

Errors: `500 ANALYTICS_QUERY_FAILED`.

### GET `/api/analytics/property-performance`

Reads materialized view `mv_property_performance`, ordered by `gross_revenue DESC, property_id ASC`. No query params.

```json
{
  "success": true,
  "count": 10,
  "data": [
    {
      "property_id": "uuid",
      "title": "string",
      "total_bookings": 12,
      "total_nights_booked": 40,
      "gross_revenue": "8000.00",
      "realised_bookings": 8,
      "realised_nights": 26,
      "realised_revenue": "5200.00"
    }
  ]
}
```

Errors: `500 PROPERTY_PERFORMANCE_QUERY_FAILED`.

### POST `/api/analytics/refresh`

Runs `SELECT refresh_property_performance_mv()`. No body.

```json
{ "success": true, "message": "Property performance summary refreshed successfully." }
```

Errors: `500 PROPERTY_PERFORMANCE_REFRESH_FAILED`.

### POST `/api/analytics/search-sessions`

Verifies the guest exists in PostgreSQL, then inserts a session into MongoDB collection `SearchSessions`.

**Body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `guest_id` | UUID string | yes | Must exist in `guests` |
| `longitude` | number | yes | -180 to 180 |
| `latitude` | number | yes | -90 to 90 |
| `search_filters.guests_count` | integer | no (default 1) | 1 to 16 |
| `search_filters.max_price` | number | no (default 1200) | >= 0 |
| `search_filters.min_bedrooms` | integer | no (default 0) | 0 to 5 |
| `search_filters.requires_pool` | boolean | no (default false) | |

```json
{
  "guest_id": "uuid",
  "longitude": 78.4867,
  "latitude": 17.385,
  "search_filters": { "guests_count": 2, "max_price": 800, "min_bedrooms": 1, "requires_pool": true }
}
```

**201 response**

```json
{
  "success": true,
  "message": "Search session created successfully.",
  "data": {
    "session_id": "uuid",
    "guest_id": "uuid",
    "location": { "type": "Point", "coordinates": [78.4867, 17.385] },
    "search_filters": { "guests_count": 2, "max_price": 800, "min_bedrooms": 1, "requires_pool": true },
    "created_at": "timestamp"
  }
}
```

| Status | Code |
|---|---|
| 201 | |
| 400 | `INVALID_GUEST_ID`, `INVALID_COORDINATES`, `INVALID_SEARCH_FILTERS` |
| 404 | `GUEST_NOT_FOUND` |
| 500 | `SEARCH_SESSION_CREATE_FAILED` |

### GET `/api/analytics/search-hotspots`

MongoDB aggregation on `SearchSessions`: `$geoNear` (5 km radius, sessions from the last 2 hours), `$project`, `$bucket` into 1 km rings, then `$set`/`$unset`/`$sort`. Needs a `2dsphere` index on `location`.

| Query param | Type | Required | Rules |
|---|---|---|---|
| `longitude` | number | yes | -180 to 180 |
| `latitude` | number | yes | -90 to 90 |

Example: `GET /api/analytics/search-hotspots?longitude=78.4867&latitude=17.3850`

```json
{
  "success": true,
  "radius_km": 5,
  "recency_hours": 2,
  "count": 3,
  "data": [
    {
      "ring_km": 0,
      "total_searches": 14,
      "average_requested_guests": 2.4,
      "average_budget_limit": 900,
      "pool_requested_count": 5,
      "unique_guest_count": 9
    }
  ]
}
```

`ring_km` is the lower bound of each 1 km ring (0 to 4). Results at exactly 5 km land in the `"at_5km_boundary"` bucket.

| Status | Code |
|---|---|
| 200 | |
| 400 | `INVALID_COORDINATES` |
| 500 | `SEARCH_HOTSPOTS_QUERY_FAILED` |

### GET `/api/analytics/reviews`

MongoDB `$facet` aggregation on `PropertyReviews` for reviews created within the last N days.

| Query param | Type | Default | Rules |
|---|---|---|---|
| `days` | integer | 30 | 1 to 365 |
| `property_id` | UUID | none | Limit the summary and return that property's latest reviews |

```json
{
  "success": true,
  "window": { "days": 30, "from": "timestamp", "to": "timestamp" },
  "rating_distribution": [
    { "rating": 1, "count": 2, "percentage": 4.0 },
    { "rating": 2, "count": 0, "percentage": 0 }
  ],
  "top_tags": [ { "tag": "quiet", "count": 12 } ],
  "overall": {
    "total_reviews": 50,
    "average_rating": 4.12,
    "lowest_rating": 1,
    "highest_rating": 5
  }
}
```

- `rating_distribution` always has 5 entries (ratings 1 to 5), zero-filled.
- `top_tags` is the top 10 `location_tags`, sorted by count then name.
- With no reviews, `overall` returns zero/null values.
- Without `property_id`, `overall` covers every property in the window.
- With `property_id`, `overall` and `rating_distribution` are for that property only, and `reviews` lists up to 30 latest reviews (`rating`, `review_text`, `location_tags`, `created_at`).

| Status | Code |
|---|---|
| 200 | |
| 400 | `INVALID_REVIEW_WINDOW`, `INVALID_ID` |
| 404 | `PROPERTY_NOT_FOUND` |
| 500 | `REVIEW_ANALYTICS_QUERY_FAILED` |

---

## 9. Data stores

**PostgreSQL**

| Object | Used by |
|---|---|
| `guests` (`wallet_balance`) | guests, bookings, search-sessions |
| `properties` (`base_price`, `title`) | properties, bookings |
| `bookings` | bookings, window-revenue |
| `wallet_audit_logs` (trigger-written) | audit-logs, POST bookings |
| `mv_property_performance` | property-performance |
| `refresh_property_performance_mv()` | refresh |
| `process_booking_payment(...)` | POST bookings |
| enum `booking_status` | bookings |

**MongoDB**

| Collection | Used by |
|---|---|
| `PropertyAmenities` | `/properties/:id/amenities` |
| `SearchSessions` | `/analytics/search-sessions`, `/analytics/search-hotspots` |
| `PropertyReviews` | `/analytics/reviews` |

## 10. Quick test (curl)

```bash
curl http://localhost:3000/api/health
curl "http://localhost:3000/api/properties?limit=5&sort=price_asc"
curl "http://localhost:3000/api/bookings?status=CONFIRMED&limit=10"
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"guest_id":"<uuid>","property_id":"<uuid>","total_cost":500,"nights":4}'
curl -X PATCH http://localhost:3000/api/bookings/<booking-uuid>/status \
  -H "Content-Type: application/json" -d '{"status":"CHECKED_IN","guest_id":"<guest-uuid>"}'
curl -X POST http://localhost:3000/api/analytics/refresh
curl "http://localhost:3000/api/analytics/search-hotspots?longitude=78.4867&latitude=17.3850"
curl "http://localhost:3000/api/analytics/reviews?days=60"
```