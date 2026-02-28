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
// // });
// import multer from "multer";
// import fs from "fs";
// import path from "path";

// const productDir = "uploads/products";
// const profileDir = "uploads/profilePics";
// const categoryDir = "uploads/categories";
// const subCategoryDir = "uploads/subcategories";

// fs.mkdirSync(categoryDir, { recursive: true });
// fs.mkdirSync(subCategoryDir, { recursive: true });


// fs.mkdirSync(productDir, { recursive: true });
// fs.mkdirSync(profileDir, { recursive: true });

// const fileFilter = (req, file, cb) => {
//   const allowed = ["image/jpeg", "image/png", "image/webp"];
//   if (!allowed.includes(file.mimetype)) return cb(new Error("Only jpg, png, webp allowed"));
//   cb(null, true);
// };

// // ✅ product storage
// const productStorage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, productDir),
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname);
//     cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
//   },
// });

// // ✅ profile storage
// const profileStorage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, profileDir),
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname);
//     cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
//   },
// });

// export const uploadProductImages = multer({
//   storage: productStorage,
//   fileFilter,
//   limits: { fileSize: 2 * 1024 * 1024 },
// }).array("images", 4);

// // ✅ THIS must be .single("profilePic")
// export const uploadProfilePic = multer({
//   storage: profileStorage,
//   fileFilter,
//   limits: { fileSize: 5 * 1024 * 1024 },
// }).single("profilePic");


// // ✅ category storage
// const categoryStorage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, categoryDir),
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname);
//     cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
//   },
// });

// // ✅ subcategory storage
// const subCategoryStorage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, subCategoryDir),
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname);
//     cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
//   },
// });

// // ✅ single("image") for category image
// export const uploadCategoryImage = multer({
//   storage: categoryStorage,
//   fileFilter,
//   limits: { fileSize: 2 * 1024 * 1024 },
// }).single("image");

// // ✅ single("image") for subcategory image
// export const uploadSubCategoryImage = multer({
//   storage: subCategoryStorage,
//   fileFilter,
//   limits: { fileSize: 2 * 1024 * 1024 },
// }).single("image");

import "dotenv/config"; // ✅ IMPORTANT (loads .env before using process.env)

import multer from "multer";
import fs from "fs";
import path from "path";

const ROOT =
  (process.env.UPLOAD_ROOT && process.env.UPLOAD_ROOT.trim()) ||
  path.join(process.env.HOME || process.cwd(), "persistent_uploads"); // fallback

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

export const UPLOAD_ROOT = ROOT;

const getPublicPath = (file) => {
  if (!file || !file.path) return null;
  // Hostinger/Linux uses forward slash, but node's path.relative handles it.
  // We force forward slashes for the URL stored in DB.
  const relative = path.relative(ROOT, file.path).split(path.sep).join("/");
  return `/uploads/${relative}`;
};

export { getPublicPath };


const productDir = path.join(ROOT, "products");
const profileDir = path.join(ROOT, "profilePics");
const categoryDir = path.join(ROOT, "categories");
const subCategoryDir = path.join(ROOT, "subcategories");
const bannerDir = path.join(ROOT, "banners");

[productDir, profileDir, categoryDir, subCategoryDir, bannerDir].forEach(ensureDir);

const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);

const fileFilter = (req, file, cb) => {
  if (!allowed.has(file.mimetype)) return cb(new Error("Only jpg, png, webp allowed"));
  cb(null, true);
};

const filename = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
};

const makeStorage = (dir) =>
  multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename,
  });

export const uploadProductImages = multer({
  storage: makeStorage(productDir),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
}).array("images", 4);

export const uploadProfilePic = multer({
  storage: makeStorage(profileDir),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("profilePic");

export const uploadCategoryImage = multer({
  storage: makeStorage(categoryDir),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
}).single("image");

export const uploadSubCategoryImage = multer({
  storage: makeStorage(subCategoryDir),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
}).single("image");

export const uploadBannerImage = multer({
  storage: makeStorage(bannerDir),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Only images are allowed"));
  },
  limits: { fileSize: 3 * 1024 * 1024 },
}).single("image");