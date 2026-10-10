
const express = require("express");
const cors = require("cors");
const propertiesRouter = require("./routes/properties");
const guestsRouter = require("./routes/guests");
const bookingsRouter = require("./routes/bookings");
const analyticsRouter = require("./routes/analytics");
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api/properties", propertiesRouter);
app.use("/api/guests", guestsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/analytics", analyticsRouter);

// Basic health-check API
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "StaySpot API is running!"
  });
});

// Start the server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`StaySpot API running on port ${PORT}`);
});