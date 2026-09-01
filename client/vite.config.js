import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// No dev-server proxy needed: the backend already sends a permissive
// cors() header (see server/src/app.js), so the browser is fine calling
// http://localhost:5000 directly from Vite's port (5173). If you'd rather
// not hardcode the backend origin, set VITE_API_BASE_URL in client/.env.
export default defineConfig({
  plugins: [react()],
});
