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



import multer from "multer";
import fs from "fs";
import path from "path";

const UPLOAD_ROOT = process.env.UPLOAD_ROOT || path.resolve("uploads");
// production: /home/u579351912/persistent_uploads
// local: <project>/uploads

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const productDir = path.join(UPLOAD_ROOT, "products");
const profileDir = path.join(UPLOAD_ROOT, "profilePics");
const categoryDir = path.join(UPLOAD_ROOT, "categories");
const subCategoryDir = path.join(UPLOAD_ROOT, "subcategories");

[productDir, profileDir, categoryDir, subCategoryDir].forEach(ensureDir);

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.mimetype)) return cb(new Error("Only jpg, png, webp allowed"));
  cb(null, true);
};

const filename = (req, file, cb) => {
  const ext = path.extname(file.originalname);
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