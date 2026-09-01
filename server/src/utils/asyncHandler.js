// Wraps an async route handler so that any rejected promise (thrown
// error inside an `await`) gets passed to next(err) automatically,
// routing it into our centralized errorHandler instead of crashing
// the process or hanging the request.
//
// Usage:
//   router.post("/", asyncHandler(async (req, res) => {
//     const thing = await mightFail();
//     res.json(thing);
//   }));

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
