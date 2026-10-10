
const express = require("express");
const pool = require("../db");
const { validate: isValidUUID } = require("uuid");

const router = express.Router();

// GET /api/guests/:id
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_ID",
        message: "A valid guest ID is required."
      }
    });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM guests WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "GUEST_NOT_FOUND",
          message: "Guest not found."
        }
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Failed to fetch guest:", error.message);

    res.status(500).json({
      success: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Could not retrieve guest details."
      }
    });
  }
});

// GET /api/guests


router.get("/", async (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  const offset = Number(req.query.offset ?? 0);

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
        message:
          "limit must be 1–100 and offset must be a non-negative integer."
      }
    });
  }

  try {
    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS total FROM guests"
    );
    const total = countResult.rows[0].total;

    const result = await pool.query(
      `SELECT *
       FROM guests
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [limit, offset]
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
      data: result.rows
    });
  } catch (error) {
    console.error("Failed to fetch guests:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Could not retrieve guests."
      }
    });
  }
});

router.get("/:id/audit-logs", async (req, res) => {
  const { id } = req.params;
  const { start_date, end_date } = req.query;

  if (!isValidUUID(id)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_ID",
        message: "A valid guest ID is required."
      }
    });
  }

  // Validate real calendar dates in YYYY-MM-DD format.
  const isValidDate = (value) => {
    if (typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value;
  };

  if (start_date !== undefined && !isValidDate(start_date)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_START_DATE",
        message: "start_date must be a valid date in YYYY-MM-DD format."
      }
    });
  }

  if (end_date !== undefined && !isValidDate(end_date)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_END_DATE",
        message: "end_date must be a valid date in YYYY-MM-DD format."
      }
    });
  }

  if (start_date && end_date && start_date > end_date) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_DATE_RANGE",
        message: "start_date must not be after end_date."
      }
    });
  }

  const limit = Number(req.query.limit ?? 20);
  const offset = Number(req.query.offset ?? 0);

  if (
    !Number.isInteger(limit) || limit < 1 || limit > 100 ||
    !Number.isInteger(offset) || offset < 0
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_PAGINATION",
        message: "limit must be 1–100 and offset must be a non-negative integer."
      }
    });
  }

  try {
    // Confirm that the guest exists.
    const guest = await pool.query(
      "SELECT id FROM guests WHERE id = $1",
      [id]
    );

    if (guest.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "GUEST_NOT_FOUND",
          message: "Guest not found."
        }
      });
    }

    const conditions = ["guest_id = $1"];
    const params = [id];

    if (start_date) {
      params.push(start_date);
      conditions.push(
        `"timestamp" >= $${params.length}::date`
      );
    }

    if (end_date) {
      params.push(end_date);
      conditions.push(
        `"timestamp" < ($${params.length}::date + INTERVAL '1 day')`
      );
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM wallet_audit_logs
       WHERE ${whereClause}`,
      params
    );

    const total = countResult.rows[0].total;

    params.push(limit);
    const limitPosition = params.length;

    params.push(offset);
    const offsetPosition = params.length;

    const result = await pool.query(
      `SELECT
         id,
         guest_id,
         amount_changed,
         action_type,
         balance_after,
         balance_after AS running_balance,
         "timestamp"
       FROM wallet_audit_logs
       WHERE ${whereClause}
       ORDER BY "timestamp" DESC, id DESC
       LIMIT $${limitPosition}
       OFFSET $${offsetPosition}`,
      params
    );

    return res.json({
      success: true,
      guest_id: id,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + result.rows.length < total
      },
      filters: {
        start_date: start_date ?? null,
        end_date: end_date ?? null
      },
      data: result.rows
    });
  } catch (error) {
    console.error("Failed to fetch wallet audit logs:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Could not retrieve wallet audit history."
      }
    });
  }
});

module.exports = router;