const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const AppError = require("../utils/AppError");
const { uploadSubmission } = require("../controllers/uploadController");

const router = express.Router();

/*
 * Keep uploads relative to this file rather than the process
 * working directory.
 *
 * This means the upload directory works whether the server
 * is started with:
 *
 *   npm start
 *
 * from server/
 *
 * or:
 *
 *   node server/src/server.js
 *
 * from the project root.
 */
const UPLOAD_DIR = path.join(
  __dirname,
  "..",
  "uploads"
);

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, {
    recursive: true,
  });
}

const MAX_FILE_SIZE_BYTES =
  15 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },

  filename: (req, file, cb) => {
    const safeName = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, "_");

    cb(
      null,
      `${Date.now()}-${safeName}`
    );
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },

  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      path
        .extname(file.originalname)
        .toLowerCase() === ".pdf";

    if (!isPdf) {
      return cb(
        new AppError(
          `${file.fieldname} must be a PDF file`,
          400,
          "INVALID_FILE_TYPE"
        )
      );
    }

    cb(null, true);
  },
});

const uploadFields = upload.fields([
  {
    name: "questionPaper",
    maxCount: 1,
  },
  {
    name: "studentAnswer",
    maxCount: 1,
  },
  {
    name: "modelAnswer",
    maxCount: 1,
  },
]);

function handleUpload(req, res, next) {
  uploadFields(
    req,
    res,
    (err) => {
      if (!err) {
        return next();
      }

      if (
        err instanceof multer.MulterError
      ) {
        const message =
          err.code ===
          "LIMIT_FILE_SIZE"
            ? `${err.field || "File"} exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`
            : err.message;

        return next(
          new AppError(
            message,
            400,
            "UPLOAD_ERROR"
          )
        );
      }

      next(err);
    }
  );
}

router.post(
  "/",
  handleUpload,
  uploadSubmission
);

module.exports = router;