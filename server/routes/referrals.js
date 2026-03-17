import express from "express";
import crypto from "crypto";
import auth from "../middleware/auth.js";
import ReferralLink from "../models/ReferralLink.js";

const router = express.Router();

// ✅ Single place to change the frontend URL
const FRONTEND_URL = process.env.FRONTEND_URL || "https://mysun.in";

const buildReferralUrl = (code, position, name) =>
  `${FRONTEND_URL}/register?ref=${code}&pos=${position}&by=${encodeURIComponent(name)}`;

export const createDefaultReferralLinks = async (userId, t = null) => {
  const positions = ["LEFT", "RIGHT"];
  for (const position of positions) {
    const code = crypto.randomBytes(24).toString("hex");
    await ReferralLink.create(
      {
        sponsorId: userId,
        code,
        position,
        isActive: true,
      },
      { transaction: t }
    );
  }
};

// GET /api/referrals
router.get("/", auth, async (req, res) => {
  try {
    const links = await ReferralLink.findAll({
      where: { sponsorId: req.user.id },
    });

    const linksWithUrl = links.map((link) => {
      const linkData = link.toJSON ? link.toJSON() : link;
      return {
        ...linkData,
        url: buildReferralUrl(link.code, link.position, req.user.name),
      };
    });

    return res.json(linksWithUrl);
  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
});

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

    const url = buildReferralUrl(code, position, req.user.name);

    return res.json({ msg: "Created", position, referralCode: code, url });
  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
});

export default router;

