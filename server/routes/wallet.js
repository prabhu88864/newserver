import express from "express";
import auth from "../middleware/auth.js";
import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";
import isAdmin from "../middleware/isAdmin.js";
import User from "../models/User.js"; 
import PairMatch from "../models/PairMatch.js";


const router = express.Router();



router.get("/admin", auth, isAdmin, async (req, res) => {
  try {
    const { type, reason, search } = req.query;

    const where = {};
    if (type) where.type = type;
    if (reason) where.reason = reason;

    const txns = await WalletTransaction.findAll({
      where,
      include: [
        {
          model: Wallet,
          required: true,
          include: [
            {
              model: User,
              attributes: ["id", "name", "email", "phone"],
              required: false,
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // 🔍 search (user / amount / walletId)
    let filtered = txns;

    if (search) {
      const q = search.toLowerCase();
      filtered = txns.filter((t) => {
        const uname = String(t.Wallet?.User?.name || "").toLowerCase();
        const phone = String(t.Wallet?.User?.phone || "");
        const amt = String(t.amount || "");
        const wid = String(t.walletId || "");

        return (
          uname.includes(q) ||
          phone.includes(q) ||
          amt.includes(q) ||
          wid.includes(q)
        );
      });
    }

    res.json({
      total: filtered.length,
      transactions: filtered,
    });
  } catch (e) {
    console.error("ADMIN WALLET TXNS ERROR =>", e);
    res.status(500).json({ msg: "Failed to load wallet transactions", err: e.message });
  }
});


/* ================= GET WALLET =================
GET /api/wallet
*/
router.get("/", auth, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ where: { userId: req.user.id } });
    if (!wallet) return res.status(404).json({ msg: "Wallet not found" });

    // ✅ calculate locked amount from pending CREDIT txns
    const txns = await WalletTransaction.findAll({
      where: { walletId: wallet.id, type: "CREDIT" },
      order: [["id", "DESC"]],
      limit: 2000, // adjust
    });

    const lockedBalance = txns
      .filter((t) => t?.meta?.pending === true)
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const availableBalance = Number(wallet.balance || 0);

    return res.json({
      id: wallet.id,
      userId: wallet.userId,
      balance: availableBalance,            // ✅ usable
      lockedBalance,                        // ✅ pending
      totalBalance: availableBalance + lockedBalance, // ✅ show only
      totalSpent: Number(wallet.totalSpent || 0),
      isUnlocked: !!wallet.isUnlocked,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
});

/* ================= WALLET TOPUP =================
POST /api/wallet/topup
Body: { amount }
*/
router.post("/topup", auth, async (req, res) => {
  try {
    const { amount } = req.body;

    if (Number(amount) <= 0)
      return res.status(400).json({ msg: "Invalid amount" });

    let wallet = await Wallet.findOne({ where: { userId: req.user.id } });
    if (!wallet) wallet = await Wallet.create({ userId: req.user.id });

    wallet.balance = Number(wallet.balance) + Number(amount);
    await wallet.save();

    await WalletTransaction.create({
      walletId: wallet.id,
      type: "CREDIT",
      amount,
      reason: "TOPUP",
    });

    res.json({
      msg: "Wallet topped up",
      balance: wallet.balance,
    });
  } catch (e) {
    res.status(500).json({ msg: "Topup failed" });
  }
});

/* ================= WALLET TRANSACTIONS =================
GET /api/wallet/transactions
*/
router.get("/transactions", auth, async (req, res) => {
  const wallet = await Wallet.findOne({ where: { userId: req.user.id } });
  if (!wallet) return res.json([]);

  const txns = await WalletTransaction.findAll({
    where: { walletId: wallet.id },
    order: [["createdAt", "DESC"]],
  });

  res.json(txns);
});

/* ================= WALLET SUMMARY (OPTIONAL) =================
GET /api/wallet/summary
*/
router.get("/summary", auth, async (req, res) => {
  let wallet = await Wallet.findOne({ where: { userId: req.user.id } });
  if (!wallet) wallet = await Wallet.create({ userId: req.user.id });

  const txns = await WalletTransaction.findAll({
    where: { walletId: wallet.id },
    order: [["createdAt", "DESC"]],
    limit: 10,
  });

  res.json({
    balance: wallet.balance,
    transactions: txns,
  });
});

export default router;
