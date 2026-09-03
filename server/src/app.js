const express = require("express");
const cors = require("cors");

const uploadRoutes = require("./routes/upload");
const gradeRoutes = require("./routes/grade");
const historyRoutes = require("./routes/history");
const annotationRoutes = require("./routes/annotations");
const exportRoutes = require("./routes/export");
const pageRoutes = require("./routes/pages");
const errorHandler = require("./middleware/errorHandler");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/upload", uploadRoutes);
app.use("/api/grade", gradeRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/annotations", annotationRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/pages", pageRoutes);

app.use(errorHandler);

module.exports = app;