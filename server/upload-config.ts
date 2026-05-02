import multer from "multer";
import path from "path";
import fs from "fs";
import { randomBytes } from "crypto";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const memoryStorage = multer.memoryStorage();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    randomBytes(16, (err: Error | null, raw: Buffer) => {
      if (err) return cb(err, "");
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, raw.toString("hex") + ext);
    });
  },
});

const imageFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed."));
  }
};

const mediaFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ];
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".mov"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG, PNG, GIF, WebP images and MP4, WebM, MOV videos are allowed."));
  }
};

export const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max per image
    files: 5,
  },
  fileFilter: imageFileFilter,
});

export const mediaUpload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max per file
    files: 3,
  },
  fileFilter: mediaFileFilter,
});

export function deleteUploadedFiles(filePaths: string[]): void {
  filePaths.forEach((filePath) => {
    try {
      const fullPath = path.join(uploadsDir, path.basename(filePath));
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (error) {
      console.error("Error deleting file:", error);
    }
  });
}
