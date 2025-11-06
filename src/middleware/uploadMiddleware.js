import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure uploads directory exists
const uploadDir = "./uploads/manual";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),

  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");

    cb(null, `${timestamp}__${sanitized}${ext}`);
  },
});

// Validate allowed formats
const fileFilter = (req, file, cb) => {
  const allowed = ["text/csv", "application/pdf"];

  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only CSV or PDF files are allowed"));
  }

  cb(null, true);
};

export const uploadManualStatement = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter,
}).single("statement");
