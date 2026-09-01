// A small custom Error subclass.
//
// Plain `throw new Error("bad file")` gives us no way to distinguish
// "client sent a bad request" (400) from "our server broke" (500),
// and no safe way to know if the message is OK to show the user.
//
// AppError lets us throw errors that CARRY that information, e.g.:
//   throw new AppError("No file uploaded", 400, "NO_FILE");
//
// The errorHandler middleware reads `.status`, `.code`, and `.expose`
// off of these to build a consistent response.

class AppError extends Error {
  constructor(message, status = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
    // Only expose the message to the client for errors WE threw
    // intentionally (4xx client errors). Unexpected 500s should never
    // leak internal details (stack traces, DB errors) to the frontend.
    this.expose = status < 500;
  }
}

module.exports = AppError;
