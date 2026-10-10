
const pool = require("./db");

async function testConnection() {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database, current_user AS username"
    );

    console.log("PostgreSQL connected successfully!");
    console.log(result.rows[0]);
  } catch (error) {
    console.error("PostgreSQL connection failed:", error.message);
  } finally {
    await pool.end();
  }
}

testConnection();