
const express = require("express");
const pool = require("../db");
const { connectMongo } = require("../mongo");
const { validate: isValidUUID } = require("uuid");
const router = express.Router();
const { UUID } = require("mongodb");
// GET /api/properties/:id
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_ID",
        message: "A valid property ID is required."
      }
    });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM properties WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "PROPERTY_NOT_FOUND",
          message: "Property not found."
        }
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Failed to fetch property:", error.message);

    res.status(500).json({
      success: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Could not retrieve property details."
      }
    });
  }
});


// GET /api/properties
router.get("/", async (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  const offset = Number(req.query.offset ?? 0);
  const sort = req.query.sort || "title";

  const sortOptions = {
    title: "title ASC, id ASC",
    price_asc: "base_price ASC, id ASC",
    price_desc: "base_price DESC, id ASC"
  };

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

  if (!sortOptions[sort]) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_SORT",
        message: "Use title, price_asc, or price_desc."
      }
    });
  }

  try {
    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS total FROM properties"
    );
    const total = countResult.rows[0].total;

    const result = await pool.query(
      `SELECT *
       FROM properties
       ORDER BY ${sortOptions[sort]}
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
      sort,
      data: result.rows
    });
  } catch (error) {
    console.error("Failed to fetch properties:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Could not retrieve properties."
      }
    });
  }
});

/** GET /api/properties/:id/amenities */
router.get("/:id/amenities", async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_ID",
        message: "A valid property ID is required."
      }
    });
  }

  try {
    // Confirm that the property exists in PostgreSQL.
    const property = await pool.query(
      "SELECT id FROM properties WHERE id = $1",
      [id]
    );

    if (property.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "PROPERTY_NOT_FOUND",
          message: "Property not found."
        }
      });
    }

    // Look up amenities in MongoDB using the UUID representation.
    const db = await connectMongo();
    const amenities = await db.collection("PropertyAmenities").findOne({
      property_id: new UUID(id)
    });

    if (!amenities) {
      return res.status(404).json({
        success: false,
        error: {
          code: "AMENITIES_NOT_FOUND",
          message: "No amenities found for this property."
        }
      });
    }

    return res.json({
      success: true,
      data: {
        property_id: id,
        amenity_categories: amenities.amenity_categories,
        house_rules: amenities.house_rules,
        accessibility_features: amenities.accessibility_features
      }
    });
  } catch (error) {
    console.error("Failed to fetch property amenities:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "AMENITIES_QUERY_FAILED",
        message: "Could not retrieve property amenities."
      }
    });
  }
});
module.exports = router;