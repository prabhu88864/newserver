import express from "express";
import Category from "../models/Category.js";
import SubCategory from "../models/SubCategory.js";
import auth from "../middleware/auth.js";
import isAdmin from "../middleware/isAdmin.js";
import { uploadCategoryImage } from "../config/upload.js";

const router = express.Router();

const imgPath = (file) => (file ? `/${file.path.replaceAll("\\", "/")}` : null);

// GET all
router.get("/", auth, async (req, res) => {
  try {
    const rows = await Category.findAll({ order: [["name", "ASC"]] });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ msg: e.message });
  }
});

// GET single
router.get("/:id", auth, async (req, res) => {
  try {
    const row = await Category.findByPk(req.params.id);
    if (!row) return res.status(404).json({ msg: "Category not found" });
    res.json(row);
  } catch (e) {
    res.status(500).json({ msg: e.message });
  }
});

// CREATE (admin) + image (form-data)
router.post("/", auth,  (req, res) => {
  uploadCategoryImage(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ msg: err.message });

      const name = (req.body.name || "").trim();
      if (!name) return res.status(400).json({ msg: "name required" });

      const exists = await Category.findOne({ where: { name } });
      if (exists) return res.status(400).json({ msg: "Category already exists" });

      const created = await Category.create({
        name,
        image: imgPath(req.file),
      });

      res.status(201).json(created);
    } catch (e) {
      res.status(500).json({ msg: e.message });
    }
  });
});

// UPDATE (admin) + image optional
router.put("/:id", auth, (req, res) => {
  uploadCategoryImage(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ msg: err.message });

      const row = await Category.findByPk(req.params.id);
      if (!row) return res.status(404).json({ msg: "Category not found" });

      const name = (req.body.name || row.name || "").trim();
      if (!name) return res.status(400).json({ msg: "name required" });

      const dup = await Category.findOne({ where: { name } });
      if (dup && dup.id !== row.id) return res.status(400).json({ msg: "Category name already used" });

      await row.update({
        name,
        image: req.file ? imgPath(req.file) : row.image,
      });

      res.json(row);
    } catch (e) {
      res.status(500).json({ msg: e.message });
    }
  });
});

// DELETE (admin) if no subcategories
router.delete("/:id", auth,  async (req, res) => {
  try {
    const row = await Category.findByPk(req.params.id);
    if (!row) return res.status(404).json({ msg: "Category not found" });

    const count = await SubCategory.count({ where: { categoryId: row.id } });
    if (count > 0) return res.status(400).json({ msg: "Cannot delete: subcategories exist" });

    await row.destroy();
    res.json({ msg: "Category deleted" });
  } catch (e) {
    res.status(500).json({ msg: e.message });
  }
});

export default router;
