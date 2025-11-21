import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure upload directories exist
const createUploadDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Create directories
createUploadDir("./uploads/manual");
createUploadDir("./uploads/contact");

// Manual Statement Storage Configuration
const manualStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./uploads/manual");
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
    cb(null, `${timestamp}__${sanitized}${ext}`);
  },
});

// Contact Attachments Storage Configuration
const contactStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./uploads/contact");
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
    cb(null, `contact_${timestamp}__${sanitized}${ext}`);
  },
});

// File filters
const manualFileFilter = (req, file, cb) => {
  const allowed = ["text/csv", "application/pdf"];
  
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only CSV or PDF files are allowed for statements"));
  }
  cb(null, true);
};

const contactFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 
    'image/png', 
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, PDFs, Word documents, and text files are allowed for contact attachments.'), false);
  }
};

// Create multer instances
const uploadManualStatement = multer({
  storage: manualStorage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: manualFileFilter,
}).single("statement");

const uploadContactAttachments = multer({
  storage: contactStorage,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 5 // Maximum 5 files
  },
  fileFilter: contactFileFilter,
}).array("attachments", 5); // Max 5 files

// Named exports
export { uploadManualStatement, uploadContactAttachments };

// Default export for backward compatibility
export default {
  uploadManualStatement,
  uploadContactAttachments
};