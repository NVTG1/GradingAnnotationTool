const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/gradesense";

  try {
    await mongoose.connect(uri);
    console.log(`[db] Connected to MongoDB at ${uri}`);
  } catch (err) {
    // We log and rethrow rather than silently continuing —
    // a server with no DB connection should fail loudly at startup,
    // not fail mysteriously on the first request.
    console.error("[db] MongoDB connection failed:", err.message);
    throw err;
  }
}

module.exports = connectDB;
