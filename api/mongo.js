const { MongoClient } = require("mongodb");

const client = new MongoClient(process.env.MONGO_URI);

let db;

async function connectMongo() {
  if (db) return db;

  await client.connect();
  db = client.db();
  console.log("MongoDB connected successfully");

  return db;
}

module.exports = { connectMongo };
