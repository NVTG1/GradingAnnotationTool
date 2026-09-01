const request = require("supertest");
const app = require("../app");

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("POST /api/upload", () => {
  it("rejects when required files are missing", async () => {
    const res = await request(app).post("/api/upload").send();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("MISSING_FILES");
    expect(res.body.error.message).toContain("questionPaper");
  });
});
