const express = require("express");
const cors = require("cors");

const uploadRoutes = require("./routes/upload");
const gradeRoutes = require("./routes/grade");
const historyRoutes = require("./routes/history");
const annotationRoutes = require("./routes/annotations");
const exportRoutes = require("./routes/export");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// --- Global middleware ---
app.use(cors());
app.use(express.json()); // parses JSON request bodies into req.body

// --- Health check (useful for confirming the server is alive) ---
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// --- Routes ---
app.use("/api/upload", uploadRoutes);
app.use("/api/grade", gradeRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/annotations", annotationRoutes);
app.use("/api/export", exportRoutes);

// --- Error handler ---
// This MUST be registered last. Express identifies error-handling
// middleware by its 4-argument signature (err, req, res, next).
// Any route that calls next(err) — or throws inside an async handler
// we've wrapped — ends up here instead of crashing the process.
app.use(errorHandler);

module.exports = app;