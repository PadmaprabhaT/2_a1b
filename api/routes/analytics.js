
const express = require("express");
const pool = require("../db");

const router = express.Router();

// GET /api/analytics/window-revenue
// Returns daily revenue, 7-day moving average, and DENSE_RANK per property.

router.get("/window-revenue", async (req, res) => {
  try {
    const result = await pool.query(`
      WITH calendar AS (
        SELECT g.d::date AS booking_date
        FROM generate_series(
          CURRENT_DATE - 36,
          CURRENT_DATE,
          INTERVAL '1 day'
        ) AS g(d)
      ),
      daily_property_revenue AS (
        SELECT
          b.property_id,
          (b.created_at AT TIME ZONE 'UTC')::date AS booking_date,
          SUM(b.total_cost) AS daily_revenue
        FROM bookings b
        WHERE b.created_at >=
              ((CURRENT_DATE - 36)::timestamp AT TIME ZONE 'UTC')
          AND b.created_at <
              ((CURRENT_DATE + 1)::timestamp AT TIME ZONE 'UTC')
        GROUP BY
          b.property_id,
          (b.created_at AT TIME ZONE 'UTC')::date
      ),
      all_property_days AS (
        SELECT
          p.id AS property_id,
          c.booking_date,
          COALESCE(d.daily_revenue, 0)::numeric AS daily_revenue
        FROM properties p
        CROSS JOIN calendar c
        LEFT JOIN daily_property_revenue d
          ON d.property_id = p.id
          AND d.booking_date = c.booking_date
      ),
      moving_average_calc AS (
        SELECT
          property_id,
          booking_date,
          daily_revenue,
          AVG(daily_revenue) OVER (
            PARTITION BY property_id
            ORDER BY booking_date
            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
          ) AS moving_avg_7d,
          SUM(daily_revenue) OVER (
            PARTITION BY property_id
            ORDER BY booking_date
            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
          ) AS trailing_7d_revenue
        FROM all_property_days
      ),
      ranked AS (
        SELECT
          booking_date,
          property_id,
          daily_revenue,
          ROUND(moving_avg_7d, 2) AS moving_avg_7d,
          trailing_7d_revenue,
          DENSE_RANK() OVER (
            PARTITION BY booking_date
            ORDER BY moving_avg_7d DESC
          ) AS rank_by_moving_avg
        FROM moving_average_calc
      )
      SELECT
        booking_date,
        property_id,
        daily_revenue,
        moving_avg_7d,
        trailing_7d_revenue,
        7 AS days_in_window,
        rank_by_moving_avg
      FROM ranked
      WHERE booking_date >= CURRENT_DATE - 30
      ORDER BY booking_date DESC, rank_by_moving_avg, property_id
    `);

    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error("Failed to fetch window analytics:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "ANALYTICS_QUERY_FAILED",
        message: "Could not retrieve revenue analytics."
      }
    });
  }
});


// GET /api/analytics/property-performance
// Returns the precomputed performance summary for each property.
router.get("/property-performance", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        property_id,
        title,
        total_bookings,
        total_nights_booked,
        gross_revenue,
        realised_bookings,
        realised_nights,
        realised_revenue
      FROM mv_property_performance
      ORDER BY gross_revenue DESC, property_id ASC
    `);

    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error("Failed to fetch property performance:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "PROPERTY_PERFORMANCE_QUERY_FAILED",
        message: "Could not retrieve property performance."
      }
    });
  }
});

// POST /api/analytics/refresh
// Refreshes the materialized view with the latest database data.
router.post("/refresh", async (req, res) => {
  try {
    await pool.query("SELECT refresh_property_performance_mv()");

    return res.json({
      success: true,
      message: "Property performance summary refreshed successfully."
    });
  } catch (error) {
    console.error("Failed to refresh property performance:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "PROPERTY_PERFORMANCE_REFRESH_FAILED",
        message: "Could not refresh property performance."
      }
    });
  }
});

// POST /api/analytics/search-sessions
// Creates a fresh search session for testing and recording search activity.
router.post("/search-sessions", async (req, res) => {
  const {
    guest_id,
    longitude,
    latitude,
    search_filters = {}
  } = req.body || {};

  const lon = Number(longitude);
  const lat = Number(latitude);
  const { guests_count, max_price, min_bedrooms, requires_pool } =
    search_filters;

  if (
    typeof guest_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(guest_id)
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_GUEST_ID",
        message: "Provide a valid guest UUID."
      }
    });
  }

  if (
    longitude === undefined ||
    latitude === undefined ||
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    lon < -180 ||
    lon > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_COORDINATES",
        message: "Provide valid longitude and latitude coordinates."
      }
    });
  }

  const filters = {
    guests_count: guests_count === undefined ? 1 : guests_count,
    max_price: max_price === undefined ? 1200 : max_price,
    min_bedrooms: min_bedrooms === undefined ? 0 : min_bedrooms,
    requires_pool: requires_pool === undefined ? false : requires_pool
  };

  if (
    !Number.isInteger(filters.guests_count) ||
    filters.guests_count < 1 ||
    filters.guests_count > 16 ||
    typeof filters.max_price !== "number" ||
    !Number.isFinite(filters.max_price) ||
    filters.max_price < 0 ||
    !Number.isInteger(filters.min_bedrooms) ||
    filters.min_bedrooms < 0 ||
    filters.min_bedrooms > 5 ||
    typeof filters.requires_pool !== "boolean"
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_SEARCH_FILTERS",
        message:
          "Use guests_count 1–16, max_price >= 0, min_bedrooms 0–5, and a boolean requires_pool."
      }
    });
  }

  try {
    const { UUID } = require("mongodb");
    const db = await require("../mongo").connectMongo();

    // Ensure the session belongs to an existing guest in PostgreSQL.
    const guestResult = await pool.query(
      "SELECT id FROM guests WHERE id = $1",
      [guest_id]
    );

    if (guestResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "GUEST_NOT_FOUND",
          message: "No guest exists with the provided ID."
        }
      });
    }

    const sessionId = new UUID();
    const createdAt = new Date();

    await db.collection("SearchSessions").insertOne({
      guest_id: new UUID(guest_id),
      session_id: sessionId,
      location: {
        type: "Point",
        coordinates: [lon, lat]
      },
      search_filters: filters,
      created_at: createdAt
    });

    return res.status(201).json({
      success: true,
      message: "Search session created successfully.",
      data: {
        session_id: sessionId.toString(),
        guest_id,
        location: {
          type: "Point",
          coordinates: [lon, lat]
        },
        search_filters: filters,
        created_at: createdAt
      }
    });
  } catch (error) {
    console.error("Failed to create search session:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "SEARCH_SESSION_CREATE_FAILED",
        message: "Could not create search session."
      }
    });
  }
});

// GET /api/analytics/search-hotspots?longitude=78.4867&latitude=17.3850
// Summarizes recent search sessions within 5 km of a coordinate.
router.get("/search-hotspots", async (req, res) => {
  const longitude = Number(req.query.longitude);
  const latitude = Number(req.query.latitude);

  if (
    req.query.longitude === undefined ||
    req.query.latitude === undefined ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_COORDINATES",
        message: "Provide valid longitude and latitude coordinates."
      }
    });
  }

  try {
    const db = await require("../mongo").connectMongo();

    const pipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [longitude, latitude]
          },
          distanceField: "distance_meters",
          maxDistance: 5000,
          spherical: true,
          key: "location",
          query: {
            created_at: {
              $gte: new Date(Date.now() - 2 * 60 * 60 * 1000)
            }
          }
        }
      },
      {
        $project: {
          guest_id: 1,
          distance_km: { $divide: ["$distance_meters", 1000] },
          "search_filters.guests_count": 1,
          "search_filters.max_price": 1,
          "search_filters.requires_pool": 1
        }
      },
      {
        $bucket: {
          groupBy: "$distance_km",
          boundaries: [0, 1, 2, 3, 4, 5],
          default: "at_5km_boundary",
          output: {
            total_searches: { $sum: 1 },
            unique_guests: { $addToSet: "$guest_id" },
            average_requested_guests: {
              $avg: "$search_filters.guests_count"
            },
            average_budget_limit: {
              $avg: "$search_filters.max_price"
            },
            pool_requested_count: {
              $sum: {
                $cond: [
                  { $eq: ["$search_filters.requires_pool", true] },
                  1,
                  0
                ]
              }
            }
          }
        }
      },
      {
        $set: {
          ring_km: "$_id",
          unique_guest_count: { $size: "$unique_guests" }
        }
      },
      { $unset: ["unique_guests", "_id"] },
      { $sort: { ring_km: 1 } }
    ];

    const data = await db
      .collection("SearchSessions")
      .aggregate(pipeline)
      .toArray();

    return res.json({
      success: true,
      radius_km: 5,
      recency_hours: 2,
      count: data.length,
      data
    });
  } catch (error) {
    console.error("Failed to fetch search hotspots:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "SEARCH_HOTSPOTS_QUERY_FAILED",
        message: "Could not retrieve search hotspots."
      }
    });
  }
});

// GET /api/analytics/reviews?days=30
// Returns rating distribution, popular tags, and overall review statistics.
router.get("/reviews", async (req, res) => {
  const days = req.query.days === undefined ? 30 : Number(req.query.days);

  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_REVIEW_WINDOW",
        message: "days must be an integer between 1 and 365."
      }
    });
  }

  try {
    const db = await require("../mongo").connectMongo();
    const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const pipeline = [
      { $match: { created_at: { $gte: windowStart } } },
      {
        $facet: {
          rating_distribution: [
            { $group: { _id: "$rating", count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
          ],
          top_tags: [
            { $unwind: "$location_tags" },
            { $group: { _id: "$location_tags", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 10 },
            { $project: { _id: 0, tag: "$_id", count: 1 } }
          ],
          overall: [
            {
              $group: {
                _id: null,
                total_reviews: { $sum: 1 },
                average_rating: { $avg: "$rating" },
                lowest_rating: { $min: "$rating" },
                highest_rating: { $max: "$rating" }
              }
            },
            {
              $project: {
                _id: 0,
                total_reviews: 1,
                average_rating: { $round: ["$average_rating", 3] },
                lowest_rating: 1,
                highest_rating: 1
              }
            }
          ]
        }
      },
      {
        $set: {
          overall: {
            $ifNull: [
              { $first: "$overall" },
              {
                total_reviews: 0,
                average_rating: null,
                lowest_rating: null,
                highest_rating: null
              }
            ]
          }
        }
      },
      {
        $set: {
          rating_distribution: {
            $map: {
              input: [1, 2, 3, 4, 5],
              as: "star",
              in: {
                $let: {
                  vars: {
                    hit: {
                      $first: {
                        $filter: {
                          input: "$rating_distribution",
                          as: "bucket",
                          cond: { $eq: ["$$bucket._id", "$$star"] }
                        }
                      }
                    }
                  },
                  in: {
                    rating: "$$star",
                    count: { $ifNull: ["$$hit.count", 0] },
                    percentage: {
                      $cond: [
                        { $gt: ["$overall.total_reviews", 0] },
                        {
                          $round: [
                            {
                              $multiply: [
                                {
                                  $divide: [
                                    { $ifNull: ["$$hit.count", 0] },
                                    "$overall.total_reviews"
                                  ]
                                },
                                100
                              ]
                            },
                            2
                          ]
                        },
                        0
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      }
    ];

    const results = await db
      .collection("PropertyReviews")
      .aggregate(pipeline, { allowDiskUse: true })
      .toArray();

    const summary = results[0] || {
      rating_distribution: [],
      top_tags: [],
      overall: {
        total_reviews: 0,
        average_rating: null,
        lowest_rating: null,
        highest_rating: null
      }
    };

    return res.json({
      success: true,
      window: {
        days,
        from: windowStart,
        to: new Date()
      },
      ...summary
    });
  } catch (error) {
    console.error("Failed to fetch review analytics:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "REVIEW_ANALYTICS_QUERY_FAILED",
        message: "Could not retrieve review analytics."
      }
    });
  }
});
module.exports = router;