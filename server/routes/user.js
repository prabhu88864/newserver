// import express from "express";
// import { Op } from "sequelize";
// import bcrypt from "bcryptjs";
// import User from "../models/User.js";
// import auth from "../middleware/auth.js";
// import isAdmin from "../middleware/isAdmin.js";

// const router = express.Router();

// /**
//  * ✅ GET /api/users
//  * Query:
//  *   page=1&limit=10&search=mani&role=USER
//  */
// router.get("/", auth, isAdmin, async (req, res) => {
//   try {
//     const search = (req.query.search || "").trim();
//     const role = (req.query.role || "").trim().toUpperCase();

//     const where = {};

//     if (role === "USER" || role === "ADMIN") where.role = role;

//     if (search) {
//       where[Op.or] = [
//         { name: { [Op.like]: `%${search}%` } },
//         { email: { [Op.like]: `%${search}%` } },
//         { phone: { [Op.like]: `%${search}%` } },
//       ];
//     }

//     const users = await User.findAll({
//       where,
//       attributes: ["id", "name", "email", "phone", "role", "createdAt", "updatedAt"],
//       order: [["createdAt", "DESC"]],
//     });

//     res.json({
//       total: users.length,
//       users,
//     });
//   } catch (err) {
//     console.error("GET /api/users error:", err);
//     res.status(500).json({ msg: "Server error" });
//   }
// });


// /**
//  * ✅ GET /api/users/:id
//  */
// router.get("/:id", auth, isAdmin, async (req, res) => {
//   try {
//     const user = await User.findByPk(req.params.id, {
//       attributes: ["id", "name", "email", "phone", "role", "createdAt", "updatedAt"],
//     });

//     if (!user) return res.status(404).json({ msg: "User not found" });
//     res.json(user);
//   } catch (err) {
//     console.error("GET /api/users/:id error:", err);
//     res.status(500).json({ msg: "Server error" });
//   }
// });

// /**
//  * ✅ PUT /api/users/:id
//  * Body: { name?, email?, phone?, role?, password? }
//  */
// router.put("/:id", auth, isAdmin, async (req, res) => {
//   try {
//     const { name, email, phone, role, password } = req.body;

//     const user = await User.findByPk(req.params.id);
//     if (!user) return res.status(404).json({ msg: "User not found" });

//     // Prevent admin deleting/changing himself accidentally (optional)
//     // if (user.id === req.user.id) { ... }

//     // Unique check for email/phone if changed
//     if (email && email !== user.email) {
//       const exists = await User.findOne({ where: { email } });
//       if (exists) return res.status(400).json({ msg: "Email already exists" });
//       user.email = email;
//     }

//     if (phone && phone !== user.phone) {
//       const exists = await User.findOne({ where: { phone } });
//       if (exists) return res.status(400).json({ msg: "Phone already exists" });
//       user.phone = phone;
//     }

//     if (name) user.name = name;

//     if (role) {
//       const r = role.toString().toUpperCase();
//       if (!["USER", "ADMIN"].includes(r)) {
//         return res.status(400).json({ msg: "Invalid role" });
//       }
//       user.role = r;
//     }

//     if (password) {
//       user.password = await bcrypt.hash(password, 10);
//     }

//     await user.save();

//     res.json({
//       msg: "User updated",
//       user: {
//         id: user.id,
//         name: user.name,
//         email: user.email,
//         phone: user.phone,
//         role: user.role,
//         createdAt: user.createdAt,
//         updatedAt: user.updatedAt,
//       },
//     });
//   } catch (err) {
//     console.error("PUT /api/users/:id error:", err);

//     // Sequelize unique constraint fallback
//     if (err?.name === "SequelizeUniqueConstraintError") {
//       return res.status(400).json({ msg: "Email/Phone already exists" });
//     }

//     res.status(500).json({ msg: "Server error" });
//   }
// });

// /**
//  * ✅ DELETE /api/users/:id
//  */
// router.delete("/:id", auth, isAdmin, async (req, res) => {
//   try {
//     const user = await User.findByPk(req.params.id);
//     if (!user) return res.status(404).json({ msg: "User not found" });

//     // Safety: prevent admin deleting himself (recommended)
//     if (user.id === req.user.id) {
//       return res.status(400).json({ msg: "You cannot delete your own admin account" });
//     }

//     await user.destroy();
//     res.json({ msg: "User deleted" });
//   } catch (err) {
//     console.error("DELETE /api/users/:id error:", err);
//     res.status(500).json({ msg: "Server error" });
//   }
// });

// export default router;
// ========================= routes/users.js (FULL FILE) =========================
import express from "express";
import { Op } from "sequelize";
import bcrypt from "bcryptjs";

import User from "../models/User.js";
import auth from "../middleware/auth.js";
import isAdmin from "../middleware/isAdmin.js";
import { uploadProfilePic } from "../config/upload.js";

const router = express.Router();
/**
 * ✅ GET /api/users/me
 * Returns currently logged-in user details
 */
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: [
        "id",
        "userID",
        "name",
        "email",
        "phone",
        "role",
        "userType",
        "profilePic",
        "referralCode",
        "bankAccountNumber",
        "ifscCode",
        "accountHolderName",
        "panNumber",
        "upiId",
        "createdAt",
        "updatedAt",
      ],
    });

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.json({ user });
  } catch (err) {
    console.error("GET /api/users/me error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

/**
 * ✅ GET /api/users
 * Query:
 *   page=1&limit=10&search=mani&role=USER
 */
router.get("/", auth, isAdmin, async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const role = (req.query.role || "").trim().toUpperCase();

    const where = {};

    if (role === "USER" || role === "ADMIN") where.role = role;

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
      ];
    }

    const users = await User.findAll({
      where,
      attributes: [
        "id",
        "name",
        "email",
        "phone",
        "role",
        "userType",
        "password",
        "profilePic",
        "bankAccountNumber",
        "ifscCode",
        "accountHolderName",
        "panNumber",
        "upiId",
        "createdAt",
        "updatedAt",
      ],
      order: [["createdAt", "DESC"]],
    });

    res.json({
      total: users.length,
      users,
    });
  } catch (err) {
    console.error("GET /api/users error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

/**
 * ✅ GET /api/users/:id
 */
router.get("/:id", auth, isAdmin, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: [
        "id",
        "name",
        "email",
        "phone",
        "role",
        "userType",
        "password",
        "profilePic",
        "bankAccountNumber",
        "ifscCode",
        "accountHolderName",
        "panNumber",
        "upiId",
        "createdAt",
        "updatedAt",
      ],
    });

    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("GET /api/users/:id error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

/**
 * ✅ PUT /api/users/:id
 * Supports:
 * - multipart/form-data (to upload profilePic file)
 * - regular JSON (no file)
 *
 * Body: { name?, email?, phone?, role?, password?, userType?, profilePic(file) }
 */
router.put("/:id", auth, (req, res) => {
  uploadProfilePic(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ msg: err.message });

      const { name, email, phone, role, password, userType, bankAccountNumber, ifscCode, accountHolderName, panNumber, upiId } = req.body;

      const user = await User.findByPk(req.params.id);
      if (!user) return res.status(404).json({ msg: "User not found" });

      // Unique check for email/phone if changed
      if (email && email !== user.email) {
        const exists = await User.findOne({ where: { email } });
        if (exists) return res.status(400).json({ msg: "Email already exists" });
        user.email = email;
      }

      if (phone && phone !== user.phone) {
        const exists = await User.findOne({ where: { phone } });
        if (exists) return res.status(400).json({ msg: "Phone already exists" });
        user.phone = phone;
      }

      if (name) user.name = name;

      // userType update (optional)
      if (typeof userType !== "undefined" && userType !== null) {
        user.userType = userType;
      }

      // role update
      if (role) {
        const r = role.toString().toUpperCase();
        if (!["USER", "ADMIN"].includes(r)) {
          return res.status(400).json({ msg: "Invalid role" });
        }
        user.role = r;
      }

      // password update
      if (password) {
        user.password = password; // ⚠️ plain save
      }

      // bank details update
      if (bankAccountNumber !== undefined) user.bankAccountNumber = bankAccountNumber;
      if (ifscCode !== undefined) user.ifscCode = ifscCode;
      if (accountHolderName !== undefined) user.accountHolderName = accountHolderName;
      if (panNumber !== undefined) user.panNumber = panNumber;
      if (upiId !== undefined) user.upiId = upiId;

      // profilePic update (only if file uploaded)
      if (req.file) {
        const profilePic = `/${req.file.path.split("\\").join("/")}`;
        user.profilePic = profilePic;
      }

      await user.save();

      res.json({
        msg: "User updated",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          userType: user.userType,
          profilePic: user.profilePic,
          bankAccountNumber: user.bankAccountNumber,
          ifscCode: user.ifscCode,
          accountHolderName: user.accountHolderName,
          panNumber: user.panNumber,
          upiId: user.upiId,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    } catch (err2) {
      console.error("PUT /api/users/:id error:", err2);

      // Sequelize unique constraint fallback
      if (err2?.name === "SequelizeUniqueConstraintError") {
        return res.status(400).json({ msg: "Email/Phone already exists" });
      }

      return res.status(500).json({ msg: "Server error" });
    }
  });
});
// ✅ POST /api/users/change-password
// Body: { oldPassword, newPassword }
router.post("/change-password", auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ msg: "oldPassword and newPassword required" });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ msg: "New password must be at least 6 characters" });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // ✅ plain verify
    if (String(oldPassword) !== String(user.password)) {
      return res.status(400).json({ msg: "Old password is incorrect" });
    }

    // ✅ prevent same password
    if (String(newPassword) === String(user.password)) {
      return res.status(400).json({ msg: "New password must be different" });
    }

    // ✅ update plain
    user.password = String(newPassword);
    await user.save();

    return res.json({ msg: "Password updated successfully" });
  } catch (err) {
    console.error("POST /api/users/change-password error:", err);
    return res.status(500).json({ msg: "Server error" });
  }
});



/**
 * ✅ DELETE /api/users/:id
 */
router.delete("/:id", auth, isAdmin, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Safety: prevent admin deleting himself (recommended)
    if (user.id === req.user.id) {
      return res.status(400).json({ msg: "You cannot delete your own admin account" });
    }

    await user.destroy();
    res.json({ msg: "User deleted" });
  } catch (err) {
    console.error("DELETE /api/users/:id error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});



export default router;

