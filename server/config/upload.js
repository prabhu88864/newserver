// import multer from "multer";
// import fs from "fs";
// import path from "path";

// const uploadDir = "uploads/products";
// fs.mkdirSync(uploadDir, { recursive: true });

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, uploadDir),
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname);
//     cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
//   },
// });

// const fileFilter = (req, file, cb) => {
//   const allowed = ["image/jpeg", "image/png", "image/webp"];
//   if (!allowed.includes(file.mimetype)) {
//     return cb(new Error("Only jpg, png, webp allowed"));
//   }
//   cb(null, true);
// };

// export const uploadProductImages = multer({
//   storage,
//   fileFilter,
//   limits: { fileSize: 2 * 1024 * 1024 }, // 2MB per image
// }).array("images", 4); // max 4 images

// export const uploadProfilePic = multer({
//   storage,
//   limits: { fileSize: 5 * 1024 * 1024 },
// });
import multer from "multer";
import fs from "fs";
import path from "path";

const productDir = "uploads/products";
const profileDir = "uploads/profilePics";

fs.mkdirSync(productDir, { recursive: true });
fs.mkdirSync(profileDir, { recursive: true });

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.mimetype)) return cb(new Error("Only jpg, png, webp allowed"));
  cb(null, true);
};

// ✅ product storage
const productStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, productDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

// ✅ profile storage
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, profileDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

export const uploadProductImages = multer({
  storage: productStorage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
}).array("images", 4);

// ✅ THIS must be .single("profilePic")
export const uploadProfilePic = multer({
  storage: profileStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("profilePic");
