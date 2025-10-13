const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "postgres",
  password: "12344321",
  port: 5432,
});

module.exports = pool;
