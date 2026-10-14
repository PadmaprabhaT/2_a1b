const express = require("express");
const pool = require("../db");
const { validate: isValidUUID } = require("uuid");

const router = express.Router();

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// GET /api/bookings
router.get("/", async (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  const offset = Number(req.query.offset ?? 0);
  const { status, guest_id, property_id } = req.query;

  const validStatuses = ["CONFIRMED", "CHECKED_IN", "COMPLETED"];

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_PAGINATION",
        message: "limit must be 1–100 and offset must be a non-negative integer."
      }
    });
  }

  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_STATUS",
        message: "status must be CONFIRMED, CHECKED_IN, or COMPLETED."
      }
    });
  }

  if (
    (guest_id && !isValidUUID(guest_id)) ||
    (property_id && !isValidUUID(property_id))
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_ID",
        message: "guest_id and property_id must be valid UUIDs."
      }
    });
  }

  try {
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`b.status = $${params.length}::booking_status`);
    }

    if (guest_id) {
      params.push(guest_id);
      conditions.push(`b.guest_id = $${params.length}`);
    }

    if (property_id) {
      params.push(property_id);
      conditions.push(`b.property_id = $${params.length}`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM bookings b
       ${whereClause}`,
      params
    );

    const total = countResult.rows[0].total;

    const dataParams = [...params, limit, offset];

    const result = await pool.query(
      `SELECT
         b.id,
         b.guest_id,
         g.name AS guest_name,
         b.property_id,
         p.title AS property_title,
         b.total_cost,
         b.status,
         b.check_in_date,
         b.check_out_date,
         b.created_at
       FROM bookings b
       JOIN guests g ON b.guest_id = g.id
       JOIN properties p ON b.property_id = p.id
       ${whereClause}
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT $${params.length + 1}
       OFFSET $${params.length + 2}`,
      dataParams
    );

    return res.json({
      success: true,
      count: result.rows.length,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + result.rows.length < total
      },
      filters: {
        status: status || null,
        guest_id: guest_id || null,
        property_id: property_id || null
      },
      data: result.rows
    });
  } catch (error) {
    console.error("Failed to fetch bookings:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Could not retrieve bookings."
      }
    });
  }
});



// POST /api/bookings
router.post("/", async (req, res) => {
  const {
    guest_id,
    property_id,
    total_cost,
    check_in_date,
    check_out_date,
    nights
  } = req.body;

  // Validate UUIDs
  if (!isValidUUID(guest_id) || !isValidUUID(property_id)) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_ID", message: "Valid guest_id and property_id UUIDs are required." }
    });
  }

  const cost = Number(total_cost);
  if (!Number.isFinite(cost) || cost <= 0) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_COST", message: "total_cost must be a positive number." }
    });
  }

  const stayNights = Number(nights);
  if (!Number.isInteger(stayNights) || stayNights < 1) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_NIGHTS", message: "nights must be a positive integer." }
    });
  }

  if (check_in_date !== undefined && !isValidDateString(check_in_date)) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_CHECK_IN_DATE", message: "check_in_date must be in YYYY-MM-DD format." }
    });
  }

  if (check_out_date !== undefined && !isValidDateString(check_out_date)) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_CHECK_OUT_DATE", message: "check_out_date must be in YYYY-MM-DD format." }
    });
  }

  if (check_in_date !== undefined && check_out_date !== undefined) {
    const expectedCheckOut = new Date(`${check_in_date}T00:00:00.000Z`);
    expectedCheckOut.setUTCDate(expectedCheckOut.getUTCDate() + stayNights);
    const expectedDate = expectedCheckOut.toISOString().slice(0, 10);

    if (check_out_date !== expectedDate) {
      return res.status(400).json({
        success: false,
        error: { code: "DATE_NIGHTS_MISMATCH", message: "check_out_date must equal check_in_date plus nights." }
      });
    }
  }

  try {
    // 1. Fetch balance before transaction
    const preGuestRes = await pool.query(
      "SELECT wallet_balance FROM guests WHERE id = $1",
      [guest_id]
    );

    if (preGuestRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "GUEST_NOT_FOUND", message: "Guest not found." }
      });
    }

    const balanceBefore = preGuestRes.rows[0].wallet_balance;

    // 2. Call the stored procedure
    const callResult = await pool.query(
      `CALL process_booking_payment(
        $1,
        $2,
        $3,
        COALESCE($4::date, CURRENT_DATE),
        $5,
        NULL::uuid,
        NULL::boolean,
        NULL::text
      )`,
      [guest_id, property_id, cost, check_in_date || null, stayNights]
    );

    const { p_booking_id, p_success, p_error } = callResult.rows[0] || {};

    // 3. Fetch balance after (even if failed)
    const postGuestRes = await pool.query(
      "SELECT wallet_balance FROM guests WHERE id = $1",
      [guest_id]
    );
    const balanceAfter = postGuestRes.rows[0]?.wallet_balance ?? balanceBefore;

    // Handle failure reported by the procedure
    if (p_success !== true) {
      return res.status(400).json({
        success: false,
        error: {
          code: "BOOKING_REJECTED",
          message: p_error || "Booking could not be completed."
        },
        balance_before: balanceBefore,
        balance_after: balanceAfter
      });
    }

    // 4. Fetch the newly created booking details
    const bookingRes = await pool.query(
      `SELECT
         b.id,
         b.guest_id,
         g.name AS guest_name,
         b.property_id,
         p.title AS property_title,
         b.total_cost,
         b.status,
         b.check_in_date,
         b.check_out_date,
         b.created_at
       FROM bookings b
       JOIN guests g ON g.id = b.guest_id
       JOIN properties p ON p.id = b.property_id
       WHERE b.id = $1`,
      [p_booking_id]
    );

    // 5. Fetch the trigger-generated audit log
    const auditRes = await pool.query(
      `SELECT id, amount_changed, action_type, balance_after, "timestamp"
       FROM wallet_audit_logs
       WHERE guest_id = $1
       ORDER BY "timestamp" DESC, id DESC
       LIMIT 1`,
      [guest_id]
    );

    return res.status(201).json({
      success: true,
      message: "Booking created successfully.",
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      audit_log: auditRes.rows[0] || null,
      data: bookingRes.rows[0]
    });
  } catch (error) {
    console.error("Booking creation failed:", error.message);
    return res.status(500).json({
      success: false,
      error: {
        code: "BOOKING_FAILED",
        message: error.message || "Booking could not be completed."
      }
    });
  }
});

/**
 * PATCH /api/bookings/:id/status
 * Allowed transitions:
 * CONFIRMED -> CHECKED_IN -> COMPLETED
 */
router.patch("/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Validate booking ID.
  if (!isValidUUID(id)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_ID",
        message: "A valid booking ID is required."
      }
    });
  }

  // Only these target statuses are permitted.
  if (!["CHECKED_IN", "COMPLETED"].includes(status)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_STATUS",
        message: "Status must be CHECKED_IN or COMPLETED."
      }
    });
  }

  try {
    const result = await pool.query(
      `UPDATE bookings
       SET status = $1::booking_status
       WHERE id = $2
         AND (
           ($1 = 'CHECKED_IN' AND status = 'CONFIRMED')
           OR
           ($1 = 'COMPLETED' AND status = 'CHECKED_IN')
         )
       RETURNING
         id,
         guest_id,
         property_id,
         total_cost,
         status,
         check_in_date,
         check_out_date,
         created_at`,
      [status, id]
    );

    // No update means the booking does not exist or the transition
    // is not permitted from its current status.
    if (result.rows.length === 0) {
      const existing = await pool.query(
        "SELECT status FROM bookings WHERE id = $1",
        [id]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: "BOOKING_NOT_FOUND",
            message: "Booking not found."
          }
        });
      }

      return res.status(409).json({
        success: false,
        error: {
          code: "INVALID_TRANSITION",
          message: `Cannot change booking from ${existing.rows[0].status} to ${status}.`
        }
      });
    }

    return res.json({
      success: true,
      message: "Booking status updated successfully.",
      data: result.rows[0]
    });
  } catch (error) {
    // PostgreSQL unique-constraint violation, e.g. another active stay.
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: {
          code: "ACTIVE_STAY_EXISTS",
          message: "This guest already has a checked-in booking."
        }
      });
    }

    console.error("Booking status update failed:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "STATUS_UPDATE_FAILED",
        message: "Could not update booking status."
      }
    });
  }
});

module.exports = router;
