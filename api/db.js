
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DB,
});

module.exports = pool;