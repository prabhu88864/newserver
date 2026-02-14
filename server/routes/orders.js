// ========================= routes/orders.js (FULL CODE) =========================
import express from "express";
import auth from "../middleware/auth.js";

import { Op } from "sequelize";

import Cart from "../models/Cart.js";
import CartItem from "../models/CartItem.js";
import Product from "../models/Product.js";

import Order from "../models/Order.js";
import OrderItem from "../models/OrderItem.js";

import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";

import DeliveryCharge from "../models/DeliveryCharge.js";
import Address from "../models/Address.js";
import isAdmin from "../middleware/isAdmin.js";
import User from "../models/User.js";

import { sequelize } from "../config/db.js";
import AppSetting from "../models/AppSetting.js";
import Referral from "../models/Referral.js";
import { getSettingNumber } from "../utils/appSettings.js";



const router = express.Router();

// async function tryReleasePendingPairBonuses(t) {
//   const minSpend = 30000;

//   const isUnlockedUser = async (userId) => {
//     const w = await Wallet.findOne({ where: { userId }, transaction: t });
//     return !!w?.isUnlocked && Number(w?.totalSpent || 0) >= minSpend;
//   };

//   // find pending PAIR_BONUS transactions
//   const pendingPairTxns = await WalletTransaction.findAll({
//     where: {
//       type: "CREDIT",
//       reason: "PAIR_BONUS",
//     },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });

//   for (const txn of pendingPairTxns) {
//     if (txn?.meta?.pending !== true) continue;

//     // receiver (upline) is wallet owner
//     const wallet = await Wallet.findByPk(txn.walletId, { transaction: t });
//     if (!wallet) continue;

//     const receiverId = wallet.userId;

//     // try to get left/right from meta
//     const leftUserId =
//       txn.meta?.pairs?.[0]?.leftUserId || txn.meta?.leftUserId;
//     const rightUserId =
//       txn.meta?.pairs?.[0]?.rightUserId || txn.meta?.rightUserId;

//     if (!leftUserId || !rightUserId) continue;

//     const [uOk, lOk, rOk] = await Promise.all([
//       isUnlockedUser(receiverId),
//       isUnlockedUser(leftUserId),
//       isUnlockedUser(rightUserId),
//     ]);

//     if (uOk && lOk && rOk) {
//       // ✅ release now
//       wallet.balance = Number(wallet.balance || 0) + Number(txn.amount || 0);
//       await wallet.save({ transaction: t });

//       txn.meta.pending = false;
//       txn.meta.releasedAt = new Date();
//       txn.meta.pendingReason = null;
//       await txn.save({ transaction: t });
//     }
//   }
// }
async function tryReleasePendingPairBonuses(t) {
  const minSpend = await getSettingNumber("MIN_SPEND_UNLOCK", t) || 30000;



  const isUnlockedUser = async (userId) => {
    const w = await Wallet.findOne({ where: { userId }, transaction: t });
    return !!w?.isUnlocked && Number(w?.totalSpent || 0) >= minSpend;
  };

  const pendingPairTxns = await WalletTransaction.findAll({
    where: { type: "CREDIT", reason: "PAIR_BONUS" },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  for (const txn of pendingPairTxns) {
    const meta = txn.meta || {};
    if (meta.pending !== true) continue;

    // Lock wallet row (important)
    const wallet = await Wallet.findByPk(txn.walletId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!wallet) continue;

    const receiverId = wallet.userId;

    const leftUserId = meta?.pairs?.[0]?.leftUserId || meta?.leftUserId;
    const rightUserId = meta?.pairs?.[0]?.rightUserId || meta?.rightUserId;
    if (!leftUserId || !rightUserId) continue;

    const [uOk, lOk, rOk] = await Promise.all([
      isUnlockedUser(receiverId),
      isUnlockedUser(leftUserId),
      isUnlockedUser(rightUserId),
    ]);

    if (!uOk || !lOk || !rOk) continue;

    const amt = Number(txn.amount || 0);

    // ✅ move locked -> balance
    wallet.lockedBalance = Math.max(0, Number(wallet.lockedBalance || 0) - amt);
    wallet.balance = Number(wallet.balance || 0) + amt;
    wallet.totalBalance = Number(wallet.balance || 0) + Number(wallet.lockedBalance || 0);

    await wallet.save({ transaction: t });

    // ✅ mark txn released
    txn.meta = {
      ...meta,
      pending: false,
      releasedAt: new Date().toISOString(),
      pendingReason: null,
    };
    await txn.save({ transaction: t });
  }
}



async function addSpendAndUnlockIfNeeded({ userId, amount, t }) {
  const wallet = await Wallet.findOne({
    where: { userId },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!wallet) throw new Error("Wallet not found");

const minSpend = (await getSettingNumber("MIN_SPEND_UNLOCK", t)) || 30000;

  const wasUnlocked = !!wallet.isUnlocked;

  wallet.totalSpent = Number(wallet.totalSpent || 0) + Number(amount || 0);
  if (!wallet.isUnlocked && Number(wallet.totalSpent) >= minSpend) {
    wallet.isUnlocked = true;
  }

  await wallet.save({ transaction: t });
  return { wallet, wasUnlocked, minSpend };
}

// ✅ pay join bonus only if BOTH unlocked
// async function tryPayJoinBonus({ referredUserId, t }) {
//   const ref = await Referral.findOne({
//     where: { referredUserId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!ref) return { paid: false, reason: "NO_REFERRAL_ROW" };
//   if (ref.joinBonusPaid) return { paid: false, reason: "ALREADY_PAID" };

//   const sponsorId = ref.sponsorId;
//   if (!sponsorId) return { paid: false, reason: "NO_SPONSOR" };

//   const [referredWallet, sponsorWallet] = await Promise.all([
//     Wallet.findOne({ where: { userId: referredUserId }, transaction: t, lock: t.LOCK.UPDATE }),
//     Wallet.findOne({ where: { userId: sponsorId }, transaction: t, lock: t.LOCK.UPDATE }),
//   ]);

//   if (!referredWallet?.isUnlocked) return { paid: false, reason: "REFERRED_NOT_UNLOCKED" };
//   if (!sponsorWallet?.isUnlocked) return { paid: false, reason: "SPONSOR_NOT_UNLOCKED" };

//   const JOIN_BONUS = await getSettingNumber("JOIN_BONUS", t);

//   const referredUser = await User.findByPk(referredUserId, {
//     transaction: t,
//     attributes: ["id", "name"],
//   });

//   sponsorWallet.balance = Number(sponsorWallet.balance || 0) + Number(JOIN_BONUS);
//   await sponsorWallet.save({ transaction: t });

//   const txn = await WalletTransaction.create(
//     {
//       walletId: sponsorWallet.id,
//       type: "CREDIT",
//       amount: JOIN_BONUS,
//       reason: "REFERRAL_JOIN_BONUS",
//       meta: { referredUserId, referredName: referredUser?.name || null },
//     },
//     { transaction: t }
//   );

//   ref.joinBonusPaid = true;
//   await ref.save({ transaction: t });

//   return { paid: true, sponsorId, txnId: txn.id, joinBonus: JOIN_BONUS };
// }
async function tryReleasePendingJoinBonusesForReferred({ referredUserId, t }) {
const minSpend = await getSettingNumber("MIN_SPEND_UNLOCK", t) || 30000;


  const isUnlockedUser = async (userId) => {
    const w = await Wallet.findOne({ where: { userId }, transaction: t });
    return !!w?.isUnlocked && Number(w?.totalSpent || 0) >= minSpend;
  };

  // find all pending join bonus txns that belong to sponsor wallets
  const pendingJoinTxns = await WalletTransaction.findAll({
    where: { type: "CREDIT", reason: "REFERRAL_JOIN_BONUS" },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  const referredOk = await isUnlockedUser(referredUserId);
  if (!referredOk) return { released: 0 };

  let released = 0;

  for (const txn of pendingJoinTxns) {
    if (txn?.meta?.pending !== true) continue;

    const meta = txn.meta || {};
    if (Number(meta.referredUserId) !== Number(referredUserId)) continue;

    const sponsorWallet = await Wallet.findByPk(txn.walletId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!sponsorWallet) continue;

    const sponsorOk = await isUnlockedUser(sponsorWallet.userId);
    if (!sponsorOk) continue;

    const amt = Number(txn.amount || 0);

    // ✅ move locked -> balance
    sponsorWallet.lockedBalance = Math.max(
      0,
      Number(sponsorWallet.lockedBalance || 0) - amt
    );
    sponsorWallet.balance = Number(sponsorWallet.balance || 0) + amt;
    sponsorWallet.totalBalance =
      Number(sponsorWallet.balance || 0) + Number(sponsorWallet.lockedBalance || 0);

    await sponsorWallet.save({ transaction: t });

    txn.meta = { ...meta, pending: false, releasedAt: new Date().toISOString(), pendingReason: null };
    await txn.save({ transaction: t });

    released += 1;
  }

  return { released };
}


// ✅ when sponsor unlocks -> pay all pending referrals that are already unlocked
async function tryPayPendingJoinBonusesForSponsor({ sponsorId, t }) {
  const sponsorWallet = await Wallet.findOne({
    where: { userId: sponsorId },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!sponsorWallet?.isUnlocked) return { paidCount: 0, reason: "SPONSOR_NOT_UNLOCKED" };

  const pending = await Referral.findAll({
    where: { sponsorId, joinBonusPaid: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!pending.length) return { paidCount: 0 };
const JOIN_BONUS = (await getSettingNumber("JOIN_BONUS", t)) || 5000;


  const referredIds = pending.map((r) => r.referredUserId);

  const referredWallets = await Wallet.findAll({
    where: { userId: referredIds },
    transaction: t,
  });
  const wMap = new Map(referredWallets.map((w) => [w.userId, w]));

  const referredUsers = await User.findAll({
    where: { id: referredIds },
    attributes: ["id", "name"],
    transaction: t,
  });
  const uMap = new Map(referredUsers.map((u) => [u.id, u]));

  let paidCount = 0;

  for (const ref of pending) {
    const rw = wMap.get(ref.referredUserId);
    if (!rw?.isUnlocked) continue;

    sponsorWallet.balance = Number(sponsorWallet.balance || 0) + Number(JOIN_BONUS);
    await sponsorWallet.save({ transaction: t });

    // await WalletTransaction.create(
    //   {
    //     walletId: sponsorWallet.id,
    //     type: "CREDIT",
    //     amount: JOIN_BONUS,
    //     reason: "REFERRAL_JOIN_BONUS",
    //     meta: {
    //       referredUserId: ref.referredUserId,
    //       referredName: uMap.get(ref.referredUserId)?.name || null,
    //     },
    //   },
    //   { transaction: t }
    // );

    ref.joinBonusPaid = true;
    await ref.save({ transaction: t });

    paidCount += 1;
  }

  return { paidCount };
}


/* ================= PLACE ORDER (from cart) =================
POST /api/orders
Body: { "paymentMethod": "COD" | "WALLET" | "RAZORPAY" }
*/
router.post("/", auth, async (req, res) => {
  try {
    const { paymentMethod, addressId } = req.body;
    if (!paymentMethod) {
      return res.status(400).json({ msg: "paymentMethod required" });
    }
      if (!addressId) return res.status(400).json({ msg: "addressId required" });
      

    // Load cart with products
    const cart = await Cart.findOne({
      where: { userId: req.user.id },
      include: [{ model: CartItem, include: [Product] }],
    });

    if (!cart || !cart.CartItems || cart.CartItems.length === 0) {
      return res.status(400).json({ msg: "Cart is empty" });
    }
        const address = await Address.findOne({
      where: { id: addressId, userId: req.user.id, isActive: true },
    });
    if (!address) return res.status(400).json({ msg: "Invalid address" });
let billAmount = 0;
let totalDiscount = 0;

const dbUser = await User.findByPk(req.user.id, { attributes: ["id", "userType"] });
const userType = String(dbUser?.userType || "").toUpperCase();

for (const item of cart.CartItems) {
  const p = item.Product;
  const qty = Number(item.qty || 0);
  const price = Number(p.price || 0);

  let discPercent = 0;
  if (userType === "ENTREPRENEUR") {
    discPercent = Number(p.entrepreneurDiscount || 0);
  } else if (userType === "TRAINEE_ENTREPRENEUR") {
    discPercent = Number(p.traineeEntrepreneurDiscount || 0);
  }

  const lineBase = qty * price;
  const lineDiscount = (lineBase * discPercent) / 100;

  billAmount += lineBase;
  totalDiscount += lineDiscount;
}



    // ================= DELIVERY CHARGE (DB slabs) =================
    const slab = await DeliveryCharge.findOne({
      where: {
        isActive: true,
        minAmount: { [Op.lte]: billAmount },
        [Op.or]: [
          { maxAmount: { [Op.gte]: billAmount } },
          { maxAmount: null },
        ],
      },
      order: [["minAmount", "DESC"]],
    });

    const deliveryCharge = slab ? Number(slab.charge) : 0;
   const grandTotal = Math.max(
  0,
  Number(billAmount) - Number(totalDiscount) + Number(deliveryCharge)
);


    // ✅ WALLET: check balance BEFORE creating order
    let wallet = null;
    if (paymentMethod === "WALLET") {
      wallet = await Wallet.findOne({ where: { userId: req.user.id } });
      if (!wallet) wallet = await Wallet.create({ userId: req.user.id, balance: 0, lockedBalance: 0, totalBalance: 0, totalSpent: 0, isUnlocked: false });


      if (Number(wallet.balance) < Number(grandTotal)) {
        return res.status(400).json({ msg: "Insufficient wallet balance" });
      }
    }

    // Create order (totalAmount = grandTotal)
    const order = await Order.create({
      userId: req.user.id,
      totalAmount: grandTotal,
       totalDiscount: Number(totalDiscount.toFixed(2)),

      addressId: address.id,
      deliveryCharge: deliveryCharge,
      paymentMethod,
      status: "PENDING",
      paymentStatus: paymentMethod === "COD" ? "PENDING" : "PENDING",
    });

    // Create order items + reduce stock
    for (const item of cart.CartItems) {
      const p = item.Product;

      await OrderItem.create({
        orderId: order.id,
        productId: p.id,
        price: p.price, // snapshot
        qty: item.qty,
      });

      await p.update({ stockQty: p.stockQty - item.qty });
    }

    // ✅ WALLET: deduct + transaction + mark order paid
    if (paymentMethod === "WALLET") {
      wallet.balance = Number(wallet.balance || 0) - Number(grandTotal || 0);
      wallet.totalBalance = Number(wallet.balance || 0) + Number(wallet.lockedBalance || 0);
      await wallet.save();


      await WalletTransaction.create({
        walletId: wallet.id,
        type: "DEBIT",
        amount: grandTotal, // ✅ includes delivery charge
        reason: "ORDER_PAYMENT",
        orderId: order.id,
      });

      await order.update({
        status: "PAID",
        paymentStatus: "SUCCESS",
      });
    }

    // Clear cart
    await CartItem.destroy({ where: { cartId: cart.id } });

    return res.status(201).json({
      msg: "Order placed",
      orderId: order.id,
      addressId: order.addressId,
      totalDiscount: Number(totalDiscount.toFixed(2)),
      billAmount,
      deliveryCharge,
      grandTotal,
      paymentMethod,
      walletBalance: paymentMethod === "WALLET" ? wallet.balance : undefined,
    });
  } catch (e) {
    console.error("ORDER ERROR =>", e);
    return res.status(500).json({ msg: "Order failed", err: e.message });
  }
});
// ================= ADMIN: UPDATE ORDER STATUS =================
// PATCH /api/orders/admin/:id/status
// Body: { status: "PENDING"|"PAID"|"CANCELLED"|"DELIVERED" }
// router.patch("/admin/:id/status", auth, isAdmin, async (req, res) => {
//   try {
//     const { status } = req.body;
//     const allowed = ["PENDING", "PAID", "CANCELLED", "DELIVERED"];

//     if (!status || !allowed.includes(String(status).toUpperCase())) {
//       return res.status(400).json({ msg: "Invalid status" });
//     }

//     const order = await Order.findByPk(req.params.id);
//     if (!order) return res.status(404).json({ msg: "Order not found" });

//     const next = String(status).toUpperCase();

//     // ✅ business rules
//     // delivered only if paid (or COD can be delivered even if paymentStatus pending)
//     if (next === "DELIVERED") {
//       if (order.status === "CANCELLED") {
//         return res.status(400).json({ msg: "Cancelled order cannot be delivered" });
//       }
//       // set deliveredOn automatically
//       await order.update({ status: "DELIVERED", deliveredOn: new Date() });
//     } else {
//       // if switching away from DELIVERED, clear deliveredOn (optional)
//       await order.update({
//         status: next,
//         deliveredOn: next === "DELIVERED" ? order.deliveredOn : null,
//       });
//     }

//     return res.json({
//       msg: "Status updated",
//       orderId: order.id,
//       status: order.status,
//       deliveredOn: order.deliveredOn,
//     });
//   } catch (e) {
//     console.error("PATCH /api/orders/admin/:id/status error:", e);
//     res.status(500).json({ msg: "Failed to update status" });
//   }
// });
router.patch("/admin/:id/status", auth, isAdmin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { status } = req.body;
    const allowed = ["PENDING", "PAID", "CANCELLED", "DELIVERED"];

    if (!status || !allowed.includes(String(status).toUpperCase())) {
      await t.rollback();
      return res.status(400).json({ msg: "Invalid status" });
    }

    const order = await Order.findByPk(req.params.id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ msg: "Order not found" });
    }

    const next = String(status).toUpperCase();
    const wasDelivered = order.status === "DELIVERED";

    if (next === "DELIVERED") {
      if (order.status === "CANCELLED") {
        await t.rollback();
        return res.status(400).json({ msg: "Cancelled order cannot be delivered" });
      }
      await order.update({ status: "DELIVERED", deliveredOn: new Date() }, { transaction: t });
    } else {
      await order.update(
        { status: next, deliveredOn: next === "DELIVERED" ? order.deliveredOn : null },
        { transaction: t }
      );
    }

    let spendInfo = null;
    let joinBonus = null;
    let sponsorPending = null;

    // ✅ only on first time DELIVERED
    if (!wasDelivered && next === "DELIVERED") {
      spendInfo = await addSpendAndUnlockIfNeeded({
        userId: order.userId,
        amount: order.totalAmount,
        t,
      });

      // ✅ if this user newly unlocked now
      // if (!spendInfo.wasUnlocked && spendInfo.wallet.isUnlocked) {
      //   // 1) user unlocked => try pay sponsor join bonus (if sponsor unlocked too)
      //   joinBonus = await tryPayJoinBonus({ referredUserId: order.userId, t });

      //   // 2) user unlocked => if user is sponsor for others, pay pending
      //   sponsorPending = await tryPayPendingJoinBonusesForSponsor({
      //     sponsorId: order.userId,
      //     t,
      //   });
      //     await tryReleasePendingPairBonuses(t);
      // }
      if (!spendInfo.wasUnlocked && spendInfo.wallet.isUnlocked) {
  // ✅ referred unlocked now => release sponsor pending join bonus

      await User.update(
        { userType: "ENTREPRENEUR" },
        { where: { id: order.userId }, transaction: t }
      );
        const releasedJoin = await tryReleasePendingJoinBonusesForReferred({
          referredUserId: order.userId,
          t,
        });

        // ✅ release pending pair bonuses too (but fix it to move locked->balance)
        await tryReleasePendingPairBonuses(t);

        sponsorPending = { releasedJoin };
      }

    }

    await t.commit();

    return res.json({
      msg: "Status updated",
      orderId: order.id,
      status: order.status,
      deliveredOn: order.deliveredOn,
      spendInfo: spendInfo
        ? { totalSpent: spendInfo.wallet.totalSpent, isUnlocked: spendInfo.wallet.isUnlocked, minSpend: spendInfo.minSpend }
        : null,
      joinBonus,
      sponsorPending,
    });
  } catch (e) {
    await t.rollback();
    console.error("PATCH /api/orders/admin/:id/status error:", e);
    return res.status(500).json({ msg: "Failed to update status", err: e.message });
  }
});


/* ================= ADMIN ORDERS =================
GET /api/orders/admin?search=...
search matches: orderId / status / user name/email/phone / product name
*/
router.get("/admin", auth, isAdmin, async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const where = {}; // admin => all orders

    // numeric search => order id
    if (search && /^\d+$/.test(search)) {
      where.id = Number(search);
    }

    const orders = await Order.findAll({
      where,
      include: [
        {
          model: User,
          attributes: ["id", "name", "email", "phone", "role"],
          required: false,
        },
        {
          model: Address,
          required: false,
        },
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              ...(search && !/^\d+$/.test(search)
                ? {
                    where: {
                      name: { [Op.like]: `%${search}%` },
                    },
                    required: false,
                  }
                : {}),
            },
          ],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      distinct: true,
    });

    // ✅ if search is text, filter by status/user fields too
    let filtered = orders;

    if (search && !/^\d+$/.test(search)) {
      const q = search.toLowerCase();
      filtered = orders.filter((o) => {
        const status = String(o.status || "").toLowerCase();
        const uname = String(o.User?.name || "").toLowerCase();
        const uemail = String(o.User?.email || "").toLowerCase();
        const uphone = String(o.User?.phone || "").toLowerCase();

        const products = (o.OrderItems || [])
          .map((it) => it?.Product?.name || "")
          .join(" ")
          .toLowerCase();

        return (
          status.includes(q) ||
          uname.includes(q) ||
          uemail.includes(q) ||
          uphone.includes(q) ||
          products.includes(q)
        );
      });
    }

    res.json({ total: filtered.length, orders: filtered });
  } catch (e) {
    console.error("GET /api/orders/admin error:", e);
    res.status(500).json({ msg: "Failed to get admin orders" });
  }
});


/* ================= GET MY ORDERS =================
GET /api/orders
*/
router.get("/", auth, async (req, res) => {
  try {
    const search = (req.query.search || "").trim();

    // ✅ base condition: only logged-in user's orders
    const where = { userId: req.user.id };

    // ✅ allow searching by orderId or status
    if (search) {
      // if numeric -> order id search
      if (/^\d+$/.test(search)) {
        where.id = Number(search);
      } else {
        // status search (PAID / PENDING etc)
        where.status = { [Op.like]: `%${search}%` };
      }
    }

    const orders = await Order.findAll({
  where,
  include: [
    { model: Address }, // ✅ Order belongsTo Address
    {
      model: OrderItem,
      include: [
        {
          model: Product,
          ...(search && !/^\d+$/.test(search)
            ? { where: { name: { [Op.like]: `%${search}%` } }, required: false }
            : {}),
        },
      ],
    },
  ],
  order: [["createdAt", "DESC"]],
  distinct: true,
});


    res.json({ total: orders.length, orders });
  } catch (e) {
    console.error("GET /api/orders error:", e);
    res.status(500).json({ msg: "Failed to get orders" });
  }
});

/* ================= GET SINGLE ORDER =================
GET /api/orders/:id
*/
router.get("/:id", auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      where: { id: req.params.id, userId: req.user.id },
      include: [{ model: OrderItem, include: [Product] }],
    });

    if (!order) return res.status(404).json({ msg: "Order not found" });
    res.json(order);
  } catch (e) {
    console.error(e);
    res.status(500).json({ msg: "Failed to get order" });
  }
});

/* ================= ADMIN: CREATE OFFLINE ORDER =================
POST /api/orders/admin/offline
Body:
{
  userId: number,
  items: [{ productId:number, qty:number }],
  paymentMethod: "OFFLINE" | "CASH" | "BANK" | "UPI",
  paymentRef: "optional",
  addressId: optional,
  markDelivered: boolean (optional)
}
*/
router.post("/admin/offline", auth, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const userId = Number(req.body.userId);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const paymentMethod = String(req.body.paymentMethod || "OFFLINE").toUpperCase();
    const paymentRef = String(req.body.paymentRef || "").trim();
    const addressId = req.body.addressId ? Number(req.body.addressId) : null;
    const markDelivered = !!req.body.markDelivered;

    if (!userId || userId <= 0) throw new Error("userId required");
    if (!items.length) throw new Error("items required");

    const allowedPay = ["OFFLINE", "CASH", "BANK", "UPI"];
    if (!allowedPay.includes(paymentMethod)) throw new Error("Invalid paymentMethod");

    const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!user) throw new Error("User not found");

    // address optional (admin may not want address)
    let address = null;
    if (addressId) {
      address = await Address.findOne({
        where: { id: addressId, userId: userId, isActive: true },
        transaction: t,
      });
      if (!address) throw new Error("Invalid addressId for this user");
    }

    // Load products (lock to avoid race)
    const productIds = items.map((x) => Number(x.productId)).filter(Boolean);
    const products = await Product.findAll({
      where: { id: productIds, isActive: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const pMap = new Map(products.map((p) => [p.id, p]));
    if (products.length !== productIds.length) {
      throw new Error("One or more products not found / inactive");
    }

    // calculate totals with your discount logic (same as user order)
    let billAmount = 0;
    let totalDiscount = 0;

    const uType = String(user.userType || "").toUpperCase();

    for (const it of items) {
      const pid = Number(it.productId);
      const qty = Number(it.qty || 0);
      if (!pid || qty <= 0) throw new Error("Invalid items (productId/qty)");

      const p = pMap.get(pid);
      if (!p) throw new Error("Product not found");

      if (Number(p.stockQty || 0) < qty) {
        throw new Error(`Stock not enough for ${p.name}`);
      }

      const price = Number(p.price || 0);
      let discPercent = 0;

      if (uType === "ENTREPRENEUR") discPercent = Number(p.entrepreneurDiscount || 0);
      else if (uType === "TRAINEE_ENTREPRENEUR") discPercent = Number(p.traineeEntrepreneurDiscount || 0);

      const lineBase = qty * price;
      const lineDiscount = (lineBase * discPercent) / 100;

      billAmount += lineBase;
      totalDiscount += lineDiscount;
    }

    // delivery charge (optional: if address present then charge, else 0)
    let deliveryCharge = 0;
    if (address) {
      const slab = await DeliveryCharge.findOne({
        where: {
          isActive: true,
          minAmount: { [Op.lte]: billAmount },
          [Op.or]: [{ maxAmount: { [Op.gte]: billAmount } }, { maxAmount: null }],
        },
        order: [["minAmount", "DESC"]],
        transaction: t,
      });
      deliveryCharge = slab ? Number(slab.charge) : 0;
    }

    const grandTotal = Math.max(0, Number(billAmount) - Number(totalDiscount) + Number(deliveryCharge));

    // Create order
    const order = await Order.create(
      {
        userId: userId,
        totalAmount: grandTotal,
        totalDiscount: Number(totalDiscount.toFixed(2)),
        deliveryCharge: deliveryCharge,
        addressId: address ? address.id : null,

        paymentMethod: paymentMethod,            // OFFLINE/CASH/BANK/UPI
        paymentStatus: "SUCCESS",                // offline means already paid
        status: markDelivered ? "DELIVERED" : "PAID",
        deliveredOn: markDelivered ? new Date() : null,

        meta: {
          offline: true,
          paymentRef: paymentRef || null,
          createdByAdminId: req.user.id,
        },
      },
      { transaction: t }
    );

    // Create order items + reduce stock
    for (const it of items) {
      const p = pMap.get(Number(it.productId));
      const qty = Number(it.qty);

      await OrderItem.create(
        {
          orderId: order.id,
          productId: p.id,
          price: p.price,
          qty: qty,
        },
        { transaction: t }
      );

      await p.update({ stockQty: Number(p.stockQty) - qty }, { transaction: t });
    }

    // ✅ If admin marked delivered, apply spend+unlock+referral release logic same as your status route
    let spendInfo = null;
    let sponsorPending = null;

    if (markDelivered) {
      spendInfo = await addSpendAndUnlockIfNeeded({ userId: order.userId, amount: order.totalAmount, t });

      if (!spendInfo.wasUnlocked && spendInfo.wallet.isUnlocked) {
        // update userType
        await User.update({ userType: "ENTREPRENEUR" }, { where: { id: order.userId }, transaction: t });

        const releasedJoin = await tryReleasePendingJoinBonusesForReferred({
          referredUserId: order.userId,
          t,
        });

        await tryReleasePendingPairBonuses(t);

        sponsorPending = { releasedJoin };
      }
    }

    await t.commit();

    return res.status(201).json({
      msg: "Offline order created",
      orderId: order.id,
      userId: order.userId,
      billAmount,
      totalDiscount: Number(totalDiscount.toFixed(2)),
      deliveryCharge,
      grandTotal,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      spendInfo: spendInfo
        ? { totalSpent: spendInfo.wallet.totalSpent, isUnlocked: spendInfo.wallet.isUnlocked, minSpend: spendInfo.minSpend }
        : null,
      sponsorPending,
    });
  } catch (e) {
    await t.rollback();
    console.error("ADMIN OFFLINE ORDER ERROR =>", e);
    return res.status(400).json({ msg: e.message });
  }
});


export default router;
