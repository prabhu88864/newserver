import express from "express";
import auth from "../middleware/auth.js";
import { Op } from "sequelize";
import { DateTime } from "luxon";

import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";
import PairMatch from "../models/PairMatch.js";
import PairPending from "../models/PairPending.js";

const router = express.Router();

function getIstRange(dateStr) {
  const zone = "Asia/Kolkata";

  const dt = dateStr
    ? DateTime.fromISO(dateStr, { zone })
    : DateTime.now().setZone(zone);

  const start = dt.startOf("day").toUTC().toJSDate();
  const end = dt.plus({ days: 1 }).startOf("day").toUTC().toJSDate();

  return { start, end, istDate: dt.toISODate(), zone };
}

const sumAmounts = (txns) =>
  txns.reduce((acc, t) => acc + Number(t.amount || 0), 0);

const isPendingTxn = (txn) => txn?.meta?.pending === true;

// ✅ GET /api/reports/daily-income?date=2026-02-07
router.get("/daily-income", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { start, end, istDate, zone } = getIstRange(req.query.date);

    const wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet) return res.status(404).json({ msg: "Wallet not found" });

    // 1) pairs matched today (ceiling applied pairs only)
    const pairsMatched = await PairMatch.count({
      where: {
        uplineUserId: userId,
        matchedAt: { [Op.gte]: start, [Op.lt]: end },
      },
    });

    // 2) flushed count today (because you want NO carry forward)
    const flushedPairs = await PairPending.count({
      where: {
        uplineUserId: userId,
        isFlushed: true,
        flushedAt: { [Op.gte]: start, [Op.lt]: end },
      },
    });

    // 3) fetch today transactions (pair + join)
    const txns = await WalletTransaction.findAll({
      where: {
        walletId: wallet.id,
        type: "CREDIT",
        reason: { [Op.in]: ["PAIR_BONUS", "REFERRAL_JOIN_BONUS"] },
        createdAt: { [Op.gte]: start, [Op.lt]: end },
      },
      order: [["id", "DESC"]],
    });

    const pairTxns = txns.filter((t) => t.reason === "PAIR_BONUS");
    const joinTxns = txns.filter((t) => t.reason === "REFERRAL_JOIN_BONUS");

    const pairCredited = pairTxns.filter((t) => !isPendingTxn(t));
    const pairPending = pairTxns.filter((t) => isPendingTxn(t));

    const joinCredited = joinTxns.filter((t) => !isPendingTxn(t));
    const joinPending = joinTxns.filter((t) => isPendingTxn(t));

    const report = {
      date: istDate,
      timezone: zone,

      pairsMatched,            // ✅ today matched pairs (<= 17)
      flushedPairs,            // ✅ today flushed pairs count (no carry forward)

      pairIncome: {
        credited: Number(sumAmounts(pairCredited).toFixed(2)),
        pending: Number(sumAmounts(pairPending).toFixed(2)),
        total: Number(sumAmounts(pairTxns).toFixed(2)),
        transactionsCount: pairTxns.length,
      },

      joinIncome: {
        credited: Number(sumAmounts(joinCredited).toFixed(2)),
        pending: Number(sumAmounts(joinPending).toFixed(2)),
        total: Number(sumAmounts(joinTxns).toFixed(2)),
        transactionsCount: joinTxns.length,
      },

      totals: {
        credited: Number((sumAmounts(pairCredited) + sumAmounts(joinCredited)).toFixed(2)),
        pending: Number((sumAmounts(pairPending) + sumAmounts(joinPending)).toFixed(2)),
        grandTotal: Number((sumAmounts(pairTxns) + sumAmounts(joinTxns)).toFixed(2)),
      },

      // optional: send small lists for UI (not heavy)
      recent: {
        pairTxns: pairTxns.slice(0, 20).map((t) => ({
          id: t.id,
          amount: Number(t.amount || 0),
          pending: isPendingTxn(t),
          createdAt: t.createdAt,
          meta: t.meta || null,
        })),
        joinTxns: joinTxns.slice(0, 20).map((t) => ({
          id: t.id,
          amount: Number(t.amount || 0),
          pending: isPendingTxn(t),
          createdAt: t.createdAt,
          meta: t.meta || null,
        })),
      },
    };

    return res.json(report);
  } catch (err) {
    console.error("DAILY INCOME REPORT ERROR =>", err);
    return res.status(500).json({ msg: "Failed to get daily report", err: err.message });
  }
});

export default router;
