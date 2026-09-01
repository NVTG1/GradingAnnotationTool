require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5000;

async function start() {
  // We connect to the DB BEFORE listening on purpose: if Mongo isn't
  // reachable, we want the server to fail to start (loud, obvious)
  // rather than accept requests it can't actually fulfill.
  await connectDB();

  app.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[server] Failed to start:", err.message);
  process.exit(1);
});
