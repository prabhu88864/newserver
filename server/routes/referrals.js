import express from "express";
import crypto from "crypto";
import auth from "../middleware/auth.js";
import ReferralLink from "../models/ReferralLink.js";

const router = express.Router();

// POST /api/referrals/create
// Body: { position: "LEFT" | "RIGHT" }
router.post("/create", auth, async (req, res) => {
  try {
    const position = String(req.body.position || "").toUpperCase();
    if (!["LEFT", "RIGHT"].includes(position)) {
      return res.status(400).json({ msg: "position must be LEFT or RIGHT" });
    }

    const code = crypto.randomBytes(24).toString("hex");

    await ReferralLink.create({
      sponsorId: req.user.id,
      code,
      position,
      isActive: true,
    });

    const url = `https://your-frontend.com/register?ref=${code}`;

    return res.json({ msg: "Created", position, referralCode: code, url });
  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
});

export default router;
