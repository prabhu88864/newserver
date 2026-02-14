// import express from 'express'
// import jwt from 'jsonwebtoken'
// import bcrypt from 'bcryptjs'
// import User from '../models/User.js'

// const router = express.Router()

// // REGISTER
// router.post('/register', async (req, res) => {
//   try {
//     const { name, email, phone, password ,role} = req.body

//     if (!name || !email || !phone || !password) {
//       return res.status(400).json({ msg: 'All fields are required' })
//     }

//     const exists = await User.findOne({ where: { email } })
//     if (exists) return res.status(400).json({ msg: 'Email already exists' })

//     const user = await User.create({ name, email, phone, password ,role})

//     res.status(201).json({
//       msg: 'User registered successfully',
//       user: { id: user.id, name: user.name, email: user.email, phone: user.phone,role: user.role },
//     })
//   } catch (err) {
//     console.error(err)
//     res.status(500).json({ msg: 'Server error' })
//   }
// })

// // LOGIN
// router.post('/login', async (req, res) => {
//   try {
//     const { email, password } = req.body

//     if (!email || !password) {
//       return res.status(400).json({ msg: 'Email and password required' })
//     }

//     const user = await User.findOne({ where: { email } })
//     if (!user) return res.status(400).json({ msg: 'Invalid credentials' })

//     const isMatch = await bcrypt.compare(password, user.password)
//     if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' })

//    const token = jwt.sign(
//   { id: user.id, role: user.role },
//   process.env.JWT_SECRET,
//   { expiresIn: "1d" }
// );

// res.json({
//   msg: "Login successful",
//   token,
//   user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
// });
//   } catch (err) {
//     console.error(err)
//     res.status(500).json({ msg: 'Server error' })
//   }
// })

// // export default router
// import express from "express";
// // import express from "express";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import { sequelize } from "../config/db.js";

// import User from "../models/User.js";
// import Wallet from "../models/Wallet.js";
// import WalletTransaction from "../models/WalletTransaction.js";
// import Referral from "../models/Referral.js";
// import BinaryNode from "../models/BinaryNode.js";
// import ReferralLink from "../models/ReferralLink.js";

// const router = express.Router();

// const JOIN_BONUS = 5000;
// const PAIR_BONUS = 3000;
// const DOWNLINE_PAIR_BONUS = 3000;

// const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" });

// const generateReferralCode = () =>
//   "R" + Math.random().toString(36).substring(2, 8).toUpperCase();

// async function creditWallet({ userId, amount, reason, meta, t }) {
//   const wallet = await Wallet.findOne({
//     where: { userId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!wallet) throw new Error("Wallet not found");

//   wallet.balance = Number(wallet.balance) + Number(amount);
//   await wallet.save({ transaction: t });

//   await WalletTransaction.create(
//     { walletId: wallet.id, type: "CREDIT", amount, reason, meta: meta || null },
//     { transaction: t }
//   );
// }

// async function ensureNode(userId, t) {
//   let node = await BinaryNode.findOne({ where: { userId }, transaction: t });
//   if (!node) {
//     node = await BinaryNode.create(
//       { userId, parentId: null, position: null, leftChildId: null, rightChildId: null },
//       { transaction: t }
//     );
//   }
//   return node;
// }

// async function findPlacementParent({ sponsorUserId, position, t }) {
//   let current = await BinaryNode.findOne({
//     where: { userId: sponsorUserId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!current) throw new Error("Sponsor node not found");

//   while (true) {
//     if (position === "LEFT") {
//       if (!current.leftChildId) return current;
//       current = await BinaryNode.findOne({
//         where: { userId: current.leftChildId },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//     } else {
//       if (!current.rightChildId) return current;
//       current = await BinaryNode.findOne({
//         where: { userId: current.rightChildId },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//     }
//   }
// }

// async function updateUplineCountsAndBonuses({ startParentUserId, placedPosition, t }) {
//   let node = await BinaryNode.findOne({ where: { userId: startParentUserId }, transaction: t });
//   let pos = placedPosition;

//   while (node) {
//     const uplineUser = await User.findByPk(node.userId, { transaction: t, lock: t.LOCK.UPDATE });
//     if (!uplineUser) break;

//     if (pos === "LEFT") uplineUser.leftCount += 1;
//     else uplineUser.rightCount += 1;

//     const totalPairs = Math.min(uplineUser.leftCount, uplineUser.rightCount);

//     const newSelfPairs = totalPairs - uplineUser.paidPairs;
//     if (newSelfPairs > 0) {
//       await creditWallet({
//         userId: uplineUser.id,
//         amount: newSelfPairs * PAIR_BONUS,
//         reason: "PAIR_BONUS",
//         meta: { newPairs: newSelfPairs, each: PAIR_BONUS },
//         t,
//       });
//       uplineUser.paidPairs += newSelfPairs;
//     }

//     if (uplineUser.sponsorId) {
//       const newSponsorPairs = totalPairs - uplineUser.sponsorPaidPairs;
//       if (newSponsorPairs > 0) {
//         await creditWallet({
//           userId: uplineUser.sponsorId,
//           amount: newSponsorPairs * DOWNLINE_PAIR_BONUS,
//           reason: "DOWNLINE_PAIR_BONUS",
//           meta: { fromUserId: uplineUser.id, newPairs: newSponsorPairs, each: DOWNLINE_PAIR_BONUS },
//           t,
//         });
//         uplineUser.sponsorPaidPairs += newSponsorPairs;
//       }
//     }

//     await uplineUser.save({ transaction: t });

//     const currentNode = await BinaryNode.findOne({ where: { userId: uplineUser.id }, transaction: t });
//     pos = currentNode?.position;
//     if (!currentNode?.parentId) break;

//     node = await BinaryNode.findOne({ where: { userId: currentNode.parentId }, transaction: t });
//   }
// }

// /**
//  * POST /api/auth/register
//  * Body:
//  * {
//  *   name,email,phone,password,
//  *   referralCode?: "<LEFT/RIGHT link-code>"   ✅ only this (no pos)
//  * }
//  */
// router.post("/register", async (req, res) => {
//   const { name, email, phone, password } = req.body;

//   // ✅ referralCode means LEFT/RIGHT link-code created by sponsor
//   const referralCode = req.body.referralCode;

//   const t = await sequelize.transaction();
//   try {
//     if (!name || !email || !phone || !password) throw new Error("name,email,phone,password required");

//     // create unique user referralCode
//     let myCode = generateReferralCode();
//     while (await User.findOne({ where: { referralCode: myCode }, transaction: t })) {
//       myCode = generateReferralCode();
//     }

//     const user = await User.create(
//       { name, email, phone, password, referralCode: myCode },
//       { transaction: t }
//     );

//     await Wallet.create({ userId: user.id, balance: 0 }, { transaction: t });

//     await BinaryNode.create(
//       { userId: user.id, parentId: null, position: null, leftChildId: null, rightChildId: null },
//       { transaction: t }
//     );

//     // ✅ If referralCode (link-code) present -> backend finds sponsor + position
//     if (referralCode) {
//       const link = await ReferralLink.findOne({
//         where: { code: referralCode, isActive: true },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });

//       if (!link) throw new Error("Invalid referral code");

//       const sponsor = await User.findByPk(link.sponsorId, {
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//       if (!sponsor) throw new Error("Sponsor not found");

//       const pos = link.position; // ✅ LEFT/RIGHT decided by sponsor when link created

//       await ensureNode(sponsor.id, t);

//       // direct sponsor
//       user.sponsorId = sponsor.id;
//       await user.save({ transaction: t });

//       const placedParent = await findPlacementParent({
//         sponsorUserId: sponsor.id,
//         position: pos,
//         t,
//       });

//       await Referral.create(
//         { sponsorId: sponsor.id, referredUserId: user.id, position: pos, joinBonusPaid: false },
//         { transaction: t }
//       );

//       const myNode = await BinaryNode.findOne({
//         where: { userId: user.id },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });

//       myNode.parentId = placedParent.userId;
//       myNode.position = pos;
//       await myNode.save({ transaction: t });

//       if (pos === "LEFT") placedParent.leftChildId = user.id;
//       else placedParent.rightChildId = user.id;
//       await placedParent.save({ transaction: t });

//       // ✅ join bonus to sponsor
//       await creditWallet({
//         userId: sponsor.id,
//         amount: JOIN_BONUS,
//         reason: "REFERRAL_JOIN_BONUS",
//         meta: { referredUserId: user.id, referredName: user.name },
//         t,
//       });

//       // ✅ pair bonuses
//       await updateUplineCountsAndBonuses({
//         startParentUserId: placedParent.userId,
//         placedPosition: pos,
//         t,
//       });
//     }

//     await t.commit();

//     const token = signToken(user.id);
//     return res.json({
//       msg: "Registered",
//       token,
//       user: { id: user.id, name: user.name, referralCode: user.referralCode },
//     });
//   } catch (err) {
//     await t.rollback();
//     return res.status(400).json({ msg: err.message });
//   }
// });

// // LOGIN (keep yours if already)
// router.post("/login", async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     const user = await User.findOne({ where: { email } });
//     if (!user) return res.status(400).json({ msg: "Invalid credentials" });

//     const ok = await bcrypt.compare(password, user.password);
//     if (!ok) return res.status(400).json({ msg: "Invalid credentials" });

//     const token = signToken(user.id);
//     return res.json({
//       msg: "Logged in",
//       token,
//       user: { id: user.id, name: user.name, role: user.role, referralCode: user.referralCode },
//     });
//   } catch (err) {
//     return res.status(500).json({ msg: err.message });
//   }
// });

// export default router;
// ========================= routes/auth.js (FULL CODE) =========================
// import express from "express";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import { sequelize } from "../config/db.js";

// import User from "../models/User.js";
// import Wallet from "../models/Wallet.js";
// import WalletTransaction from "../models/WalletTransaction.js";

// import Referral from "../models/Referral.js";
// import ReferralLink from "../models/ReferralLink.js";
// import ReferralEdge from "../models/ReferralEdge.js";

// const router = express.Router();

// const JOIN_BONUS = 5000;
// const PAIR_BONUS = 3000;
// const DOWNLINE_PAIR_BONUS = 3000;

// const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" });

// const generateReferralCode = () =>
//   "R" + Math.random().toString(36).substring(2, 8).toUpperCase();

// async function creditWallet({ userId, amount, reason, meta, t }) {
//   const wallet = await Wallet.findOne({
//     where: { userId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!wallet) throw new Error("Wallet not found");

//   wallet.balance = Number(wallet.balance) + Number(amount);
//   await wallet.save({ transaction: t });

//   await WalletTransaction.create(
//     { walletId: wallet.id, type: "CREDIT", amount, reason, meta: meta || null },
//     { transaction: t }
//   );
// }

// // ✅ LEFT/RIGHT list: slot 1..n under sponsor (no spillover)
// async function getNextSlot(sponsorId, pos, t) {
//   const last = await ReferralEdge.findOne({
//     where: { sponsorId, position: pos },
//     order: [["slot", "DESC"]],
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   return (last?.slot || 0) + 1;
// }

// /**
//  * ✅ Pair income rules (direct sponsor based):
//  * - sponsor.leftCount/rightCount increment based on direct referral position
//  * - pairs = min(leftCount, rightCount)
//  * - newPairs = pairs - paidPairs => CREDIT newPairs*3000 to that user
//  * - if that user has sponsorId => sponsor also gets newPairs*3000 (downline pair bonus)
//  */
// // async function updateSponsorCountsAndBonuses({ sponsorId, pos, t }) {
// //   let currentSponsorId = sponsorId;

// //   while (currentSponsorId) {
// //     const u = await User.findByPk(currentSponsorId, { transaction: t, lock: t.LOCK.UPDATE });
// //     if (!u) break;

// //     if (pos === "LEFT") u.leftCount += 1;
// //     else u.rightCount += 1;

// //     const totalPairs = Math.min(u.leftCount, u.rightCount);

// //     // self pair bonus
// //     const newSelfPairs = totalPairs - u.paidPairs;
// //     if (newSelfPairs > 0) {
// //       await creditWallet({
// //         userId: u.id,
// //         amount: newSelfPairs * PAIR_BONUS,
// //         reason: "PAIR_BONUS",
// //         meta: { newPairs: newSelfPairs, each: PAIR_BONUS },
// //         t,
// //       });
// //       u.paidPairs += newSelfPairs;
// //     }

// //     // sponsor gets when downline completes pair
// //     if (u.sponsorId) {
// //       const newSponsorPairs = totalPairs - u.sponsorPaidPairs;
// //       if (newSponsorPairs > 0) {
// //         await creditWallet({
// //           userId: u.sponsorId,
// //           amount: newSponsorPairs * DOWNLINE_PAIR_BONUS,
// //           reason: "DOWNLINE_PAIR_BONUS",
// //           meta: { fromUserId: u.id, newPairs: newSponsorPairs, each: DOWNLINE_PAIR_BONUS },
// //           t,
// //         });
// //         u.sponsorPaidPairs += newSponsorPairs;
// //       }
// //     }

// //     await u.save({ transaction: t });
// //     currentSponsorId = u.sponsorId || null;
// //   }
// // }


// async function updateDirectSponsorCountsAndBonuses({ sponsorId, pos, t }) {
//   const u = await User.findByPk(sponsorId, { transaction: t, lock: t.LOCK.UPDATE });
//   if (!u) return;

//   // ✅ only direct sponsor counts increment
//   if (pos === "LEFT") u.leftCount += 1;
//   else u.rightCount += 1;

//   const totalPairs = Math.min(u.leftCount, u.rightCount);

//   // ✅ self pair bonus (only for this user)
//   const newSelfPairs = totalPairs - u.paidPairs;
//   if (newSelfPairs > 0) {
//     await creditWallet({
//       userId: u.id,
//       amount: newSelfPairs * PAIR_BONUS,
//       reason: "PAIR_BONUS",
//       meta: { newPairs: newSelfPairs, each: PAIR_BONUS },
//       t,
//     });
//     u.paidPairs += newSelfPairs;
//   }

//   // ✅ sponsor gets downline pair bonus when THIS user completes new pairs
//   if (u.sponsorId) {
//     const newSponsorPairs = totalPairs - u.sponsorPaidPairs;
//     if (newSponsorPairs > 0) {
//       await creditWallet({
//         userId: u.sponsorId,
//         amount: newSponsorPairs * DOWNLINE_PAIR_BONUS,
//         reason: "DOWNLINE_PAIR_BONUS",
//         meta: { fromUserId: u.id, newPairs: newSponsorPairs, each: DOWNLINE_PAIR_BONUS },
//         t,
//       });
//       u.sponsorPaidPairs += newSponsorPairs;
//     }
//   }

//   await u.save({ transaction: t });
// }

// // ========================= REGISTER =========================
// // POST /api/auth/register
// // Body: { name,email,phone,password, referralCode?: "<LEFT/RIGHT link-code>" }
// router.post("/register", async (req, res) => {
//   const { name, email, phone, password } = req.body;

//   // ✅ referralCode = ReferralLink.code (LEFT/RIGHT link-code created by sponsor)
//   const referralCode = req.body.referralCode;

//   const t = await sequelize.transaction();
//   try {
//     if (!name || !email || !phone || !password) {
//       throw new Error("name,email,phone,password required");
//     }

//     // create unique user referralCode (user's own code)
//     let myCode = generateReferralCode();
//     while (await User.findOne({ where: { referralCode: myCode }, transaction: t })) {
//       myCode = generateReferralCode();
//     }

//     const user = await User.create(
//       { name, email, phone, password, referralCode: myCode },
//       { transaction: t }
//     );

//     // wallet
//     await Wallet.create({ userId: user.id, balance: 0 }, { transaction: t });

//     // ✅ Apply referral if present (NO spillover to B/C, direct under sponsor list)
//     if (referralCode) {
//       const link = await ReferralLink.findOne({
//         where: { code: referralCode, isActive: true },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//       if (!link) throw new Error("Invalid referral code");

//       const sponsor = await User.findByPk(link.sponsorId, {
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//       if (!sponsor) throw new Error("Sponsor not found");

//       const pos = String(link.position || "").toUpperCase();
//       if (!["LEFT", "RIGHT"].includes(pos)) throw new Error("Invalid referral position");

//       // set direct sponsor
//       user.sponsorId = sponsor.id;
//       await user.save({ transaction: t });

//       // store referred users info (audit)
//       await Referral.create(
//         { sponsorId: sponsor.id, referredUserId: user.id, position: pos, joinBonusPaid: true },
//         { transaction: t }
//       );

//       // store under sponsor left/right unlimited list
//       const slot = await getNextSlot(sponsor.id, pos, t);

//       await ReferralEdge.create(
//         { sponsorId: sponsor.id, childId: user.id, position: pos, slot },
//         { transaction: t }
//       );

//       // join bonus to sponsor
//       await creditWallet({
//         userId: sponsor.id,
//         amount: JOIN_BONUS,
//         reason: "REFERRAL_JOIN_BONUS",
//         meta: { referredUserId: user.id, referredName: user.name, position: pos, slot },
//         t,
//       });

//       // pair bonuses (direct sponsor based)
//       // await updateSponsorCountsAndBonuses({
//       //   sponsorId: sponsor.id,
//       //   pos,
//       //   t,
//       // });
//       await updateDirectSponsorCountsAndBonuses({
//         sponsorId: sponsor.id,
//         pos,
//         t,
//       });

//     }

//     await t.commit();

//     const token = signToken(user.id);
//     return res.json({
//       msg: "Registered",
//       token,
//       user: { id: user.id, name: user.name, referralCode: user.referralCode },
//     });
//   } catch (err) {
//     await t.rollback();
//     return res.status(400).json({ msg: err.message });
//   }
// });

// // ========================= LOGIN =========================
// router.post("/login", async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     const user = await User.findOne({ where: { email } });
//     if (!user) return res.status(400).json({ msg: "Invalid credentials" });

//     const ok = await bcrypt.compare(password, user.password);
//     if (!ok) return res.status(400).json({ msg: "Invalid credentials" });

//     const token = signToken(user.id);
//     return res.json({
//       msg: "Logged in",
//       token,
//       user: { id: user.id, name: user.name, role: user.role, email: user.email, phone: user.phone, referralCode: user.referralCode },

//     });
//   } catch (err) {
//     return res.status(500).json({ msg: err.message });
//   }
// });

// export default router;


// // ========================= routes/auth.js (FULL CODE - SPILLOVER BINARY) =========================
// import express from "express";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import { sequelize } from "../config/db.js";

// import User from "../models/User.js";
// import Wallet from "../models/Wallet.js";
// import WalletTransaction from "../models/WalletTransaction.js";

// import Referral from "../models/Referral.js";
// import ReferralLink from "../models/ReferralLink.js";
// import BinaryNode from "../models/BinaryNode.js";

// const router = express.Router();

// const JOIN_BONUS = 5000;
// const PAIR_BONUS = 3000;


// const signToken = (id) =>
//   jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" });

// const generateReferralCode = () =>
//   "R" + Math.random().toString(36).substring(2, 8).toUpperCase();

// // ========================= WALLET CREDIT =========================
// async function creditWallet({ userId, amount, reason, meta, t }) {
//   const wallet = await Wallet.findOne({
//     where: { userId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!wallet) throw new Error("Wallet not found");

//   wallet.balance = Number(wallet.balance) + Number(amount);
//   await wallet.save({ transaction: t });

//   await WalletTransaction.create(
//     {
//       walletId: wallet.id,
//       type: "CREDIT",
//       amount,
//       reason,
//       meta: meta || null,
//     },
//     { transaction: t }
//   );
// }

// // ========================= BINARY NODE HELPERS =========================
// async function ensureNode(userId, t) {
//   let node = await BinaryNode.findOne({
//     where: { userId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!node) {
//     node = await BinaryNode.create(
//       {
//         userId,
//         parentId: null,
//         position: null,
//         leftChildId: null,
//         rightChildId: null,
//       },
//       { transaction: t }
//     );
//   }
//   return node;
// }

// // ✅ Spillover placement: go down LEFT/RIGHT path until empty slot
// async function findPlacementParent({ sponsorUserId, position, t }) {
//   let current = await BinaryNode.findOne({
//     where: { userId: sponsorUserId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!current) throw new Error("Sponsor node not found");

//   while (true) {
//     if (position === "LEFT") {
//       if (!current.leftChildId) return current;

//       current = await BinaryNode.findOne({
//         where: { userId: current.leftChildId },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//     } else {
//       if (!current.rightChildId) return current;

//       current = await BinaryNode.findOne({
//         where: { userId: current.rightChildId },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//     }

//     if (!current) throw new Error("Broken tree: missing node while placing");
//   }
// }

// // ✅ Spillover upline updates + pair bonuses
// async function updateUplineCountsAndBonuses({
//   startParentUserId,
//   placedPosition,
//   t,
// }) {
//   let node = await BinaryNode.findOne({
//     where: { userId: startParentUserId },
//     transaction: t,
//   });
//   let pos = placedPosition;

//   while (node) {
//     const uplineUser = await User.findByPk(node.userId, {
//       transaction: t,
//       lock: t.LOCK.UPDATE,
//     });
//     if (!uplineUser) break;

//     // increment side counts for that upline
//     if (pos === "LEFT") uplineUser.leftCount = Number(uplineUser.leftCount || 0) + 1;
//     else uplineUser.rightCount = Number(uplineUser.rightCount || 0) + 1;

//     const totalPairs = Math.min(
//       Number(uplineUser.leftCount || 0),
//       Number(uplineUser.rightCount || 0)
//     );

//     // ✅ self pair bonus
//     const paidPairs = Number(uplineUser.paidPairs || 0);
//     const newSelfPairs = totalPairs - paidPairs;

//   if (newSelfPairs > 0) {
//   await creditWallet({
//     userId: uplineUser.id,
//     amount: newSelfPairs * PAIR_BONUS,
//     reason: "PAIR_BONUS",
//     meta: {
//       each: PAIR_BONUS,
//       newPairs: newSelfPairs,

//       // ✅ at least this info now (trigger info)
//       triggeredByUserId: startParentUserId,     // or the newly joined user id (better)
//       triggeredSide: pos,
//       countsAfter: {
//         left: Number(uplineUser.leftCount || 0),
//         right: Number(uplineUser.rightCount || 0),
//       },
//     },
//     t,
//   });

//   uplineUser.paidPairs = paidPairs + newSelfPairs;
// }





//     await uplineUser.save({ transaction: t });

//     // move up the tree
//     const currentNode = await BinaryNode.findOne({
//       where: { userId: uplineUser.id },
//       transaction: t,
//     });

//     pos = currentNode?.position; // LEFT/RIGHT at its parent
//     if (!currentNode?.parentId) break;

//     node = await BinaryNode.findOne({
//       where: { userId: currentNode.parentId },
//       transaction: t,
//     });
//   }
// }

// // ========================= REGISTER =========================
// // POST /api/auth/register
// // Body: { name,email,phone,password, referralCode?: "<link-code>" }
// router.post("/register", async (req, res) => {
//   const { name, email, phone, password } = req.body;
//   const referralCode = req.body.referralCode; // ReferralLink.code (LEFT/RIGHT)

//   const t = await sequelize.transaction();
//   try {
//     if (!name || !email || !phone || !password) {
//       throw new Error("name,email,phone,password required");
//     }

//     // prevent duplicates
//     const existsEmail = await User.findOne({ where: { email }, transaction: t });
//     if (existsEmail) throw new Error("Email already exists");

//     const existsPhone = await User.findOne({ where: { phone }, transaction: t });
//     if (existsPhone) throw new Error("Phone already exists");

//     // unique user referralCode
//     let myCode = generateReferralCode();
//     while (await User.findOne({ where: { referralCode: myCode }, transaction: t })) {
//       myCode = generateReferralCode();
//     }

//     // create user
//     const user = await User.create(
//       {
//         name,
//         email,
//         phone,
//         password, // hashed by hook
//         referralCode: myCode,
//       },
//       { transaction: t }
//     );

//     // create wallet
//     await Wallet.create({ userId: user.id, balance: 0 }, { transaction: t });

//     // create binary node for user
//     await BinaryNode.create(
//       {
//         userId: user.id,
//         parentId: null,
//         position: null,
//         leftChildId: null,
//         rightChildId: null,
//       },
//       { transaction: t }
//     );

//     // ========================= APPLY REFERRAL (SPILLOVER) =========================
//     if (referralCode) {
//       const link = await ReferralLink.findOne({
//         where: { code: referralCode, isActive: true },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//       if (!link) throw new Error("Invalid referral code");

//       const sponsor = await User.findByPk(link.sponsorId, {
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//       if (!sponsor) throw new Error("Sponsor not found");

//       const pos = String(link.position || "").toUpperCase();
//       if (!["LEFT", "RIGHT"].includes(pos)) throw new Error("Invalid referral position");

//       // direct sponsor
//       user.sponsorId = sponsor.id;
//       await user.save({ transaction: t });

//       // ensure sponsor node exists
//       await ensureNode(sponsor.id, t);

//       // spillover placement down the chosen side
//       const placedParent = await findPlacementParent({
//         sponsorUserId: sponsor.id,
//         position: pos,
//         t,
//       });

//       // audit referral row
//       const refRow = await Referral.create(
//         {
//           sponsorId: sponsor.id,
//           referredUserId: user.id,
//           position: pos,
//           joinBonusPaid: false,
//         },
//         { transaction: t }
//       );

//       // attach my node under placement parent
//       const myNode = await BinaryNode.findOne({
//         where: { userId: user.id },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });

//       myNode.parentId = placedParent.userId;
//       myNode.position = pos;
//       await myNode.save({ transaction: t });

//       // set placement parent's child pointer
//       if (pos === "LEFT") placedParent.leftChildId = user.id;
//       else placedParent.rightChildId = user.id;
//       await placedParent.save({ transaction: t });

//       // ✅ join bonus to sponsor (once)
//       if (!refRow.joinBonusPaid) {
//        await creditWallet({
//         userId: sponsor.id,
//         amount: JOIN_BONUS,
//         reason: "REFERRAL_JOIN_BONUS",
//         meta: {
//           referredUserId: user.id,
//           referredName: user.name,
//         placedUnderUserId: placedParent.userId, 
//           placedPosition: pos,
//         },
//         t,
//       });

//         refRow.joinBonusPaid = true;
//         await refRow.save({ transaction: t });
//       }

//       // ✅ spillover upline pair bonus updates
//       await updateUplineCountsAndBonuses({
//         startParentUserId: placedParent.userId,
//         placedPosition: pos,
//         t,
//       });
//     }

//     await t.commit();

//     const token = signToken(user.id);
//     return res.json({
//       msg: "Registered",
//       token,
//       user: {
//         id: user.id,
//         name: user.name,
//         role: user.role,
//         email: user.email,
//         phone: user.phone,
//         referralCode: user.referralCode,
//       },
//     });
//   } catch (err) {
//     await t.rollback();
//     return res.status(400).json({ msg: err.message });
//   }
// });

// // ========================= LOGIN =========================
// router.post("/login", async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     if (!email || !password) return res.status(400).json({ msg: "email,password required" });

//     const user = await User.findOne({ where: { email } });
//     if (!user) return res.status(400).json({ msg: "Invalid credentials" });

//     const ok = await bcrypt.compare(password, user.password);
//     if (!ok) return res.status(400).json({ msg: "Invalid credentials" });

//     const token = signToken(user.id);
//     return res.json({
//       msg: "Logged in",
//       token,
//       user: {
//         id: user.id,
//         name: user.name,
//         role: user.role,
//         email: user.email,
//         phone: user.phone,
//         referralCode: user.referralCode,
//       },
//     });
//   } catch (err) {
//     return res.status(500).json({ msg: err.message });
//   }
// });

// export default router;



/// working 
///up to add
//                     // unclock wallet

// import express from "express";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import { sequelize } from "../config/db.js";

// import User from "../models/User.js";
// import Wallet from "../models/Wallet.js";
// import WalletTransaction from "../models/WalletTransaction.js";

// import Referral from "../models/Referral.js";
// import ReferralLink from "../models/ReferralLink.js";
// import BinaryNode from "../models/BinaryNode.js";

// import PairPending from "../models/PairPending.js";
// import PairMatch from "../models/PairMatch.js";

// const router = express.Router();

// console.log("AUTH FILE: PAIR-PENDING + PAIR-MATCH ENABLED");

// const JOIN_BONUS = 5000;
// const PAIR_BONUS = 3000;

// const signToken = (id) =>
//   jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" });

// const generateReferralCode = () =>
//   "R" + Math.random().toString(36).substring(2, 8).toUpperCase();

// // ========================= WALLET CREDIT (returns txn) =========================
// async function creditWallet({ userId, amount, reason, meta, t }) {
//   const wallet = await Wallet.findOne({
//     where: { userId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!wallet) throw new Error("Wallet not found");

//   wallet.balance = Number(wallet.balance || 0) + Number(amount || 0);
//   await wallet.save({ transaction: t });

//   const txn = await WalletTransaction.create(
//     {
//       walletId: wallet.id,
//       type: "CREDIT",
//       amount,
//       reason,
//       meta: meta || null,
//     },
//     { transaction: t }
//   );

//   return txn;
// }

// // ========================= BINARY NODE HELPERS =========================
// async function ensureNode(userId, t) {
//   let node = await BinaryNode.findOne({
//     where: { userId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!node) {
//     node = await BinaryNode.create(
//       {
//         userId,
//         parentId: null,
//         position: null,
//         leftChildId: null,
//         rightChildId: null,
//       },
//       { transaction: t }
//     );
//   }
//   return node;
// }

// // Spillover placement: go down LEFT/RIGHT path until empty slot
// async function findPlacementParent({ sponsorUserId, position, t }) {
//   let current = await BinaryNode.findOne({
//     where: { userId: sponsorUserId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!current) throw new Error("Sponsor node not found");

//   while (true) {
//     if (position === "LEFT") {
//       if (!current.leftChildId) return current;

//       current = await BinaryNode.findOne({
//         where: { userId: current.leftChildId },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//     } else {
//       if (!current.rightChildId) return current;

//       current = await BinaryNode.findOne({
//         where: { userId: current.rightChildId },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//     }

//     if (!current) throw new Error("Broken tree: missing node while placing");
//   }
// }

// // ========================= PAIRING (PairPending + PairMatch) =========================
// async function updateUplineCountsAndBonuses({
//   startParentUserId,
//   placedPosition,
//   newlyJoinedUserId,
//   t,
// }) {
//   let node = await BinaryNode.findOne({
//     where: { userId: startParentUserId },
//     transaction: t,
//   });

//   let pos = placedPosition;

//   while (node) {
//     const uplineUser = await User.findByPk(node.userId, {
//       transaction: t,
//       lock: t.LOCK.UPDATE,
//     });
//     if (!uplineUser) break;

//     // 1) increment counts
//     if (pos === "LEFT") uplineUser.leftCount = Number(uplineUser.leftCount || 0) + 1;
//     else uplineUser.rightCount = Number(uplineUser.rightCount || 0) + 1;

//     // 2) store pending entry (exact downline id)
//     await PairPending.create(
//       {
//         uplineUserId: uplineUser.id,
//         side: pos,
//         downlineUserId: newlyJoinedUserId,
//         isUsed: false,
//       },
//       { transaction: t }
//     );

//     // 3) find FIFO unused left & right
//     const leftUnused = await PairPending.findAll({
//       where: { uplineUserId: uplineUser.id, side: "LEFT", isUsed: false },
//       order: [["id", "ASC"]],
//       transaction: t,
//       lock: t.LOCK.UPDATE,
//     });

//     const rightUnused = await PairPending.findAll({
//       where: { uplineUserId: uplineUser.id, side: "RIGHT", isUsed: false },
//       order: [["id", "ASC"]],
//       transaction: t,
//       lock: t.LOCK.UPDATE,
//     });

//     const canMake = Math.min(leftUnused.length, rightUnused.length);

//     if (canMake > 0) {
//       // Build pairs FIFO
//       const pairs = [];
//       for (let i = 0; i < canMake; i++) {
//         pairs.push({ leftP: leftUnused[i], rightP: rightUnused[i] });
//       }

//       // fetch names for meta
//       const leftIds = pairs.map((p) => p.leftP.downlineUserId);
//       const rightIds = pairs.map((p) => p.rightP.downlineUserId);

//       const [leftUsers, rightUsers] = await Promise.all([
//         User.findAll({
//           where: { id: leftIds },
//           attributes: ["id", "name"],
//           transaction: t,
//         }),
//         User.findAll({
//           where: { id: rightIds },
//           attributes: ["id", "name"],
//           transaction: t,
//         }),
//       ]);

//       const leftMap = new Map(leftUsers.map((u) => [u.id, u]));
//       const rightMap = new Map(rightUsers.map((u) => [u.id, u]));

//       // create PairMatch rows + mark pendings used
//       const createdMatches = [];
//       for (const p of pairs) {
//         const leftDownId = p.leftP.downlineUserId;
//         const rightDownId = p.rightP.downlineUserId;

//         const m = await PairMatch.create(
//           {
//             uplineUserId: uplineUser.id,
//             leftUserId: leftDownId,
//             rightUserId: rightDownId,
//             bonusEach: PAIR_BONUS,
//             amount: PAIR_BONUS,
//             matchedAt: new Date(),
//           },
//           { transaction: t }
//         );

//         await p.leftP.update(
//           { isUsed: true, usedInPairMatchId: m.id },
//           { transaction: t }
//         );
//         await p.rightP.update(
//           { isUsed: true, usedInPairMatchId: m.id },
//           { transaction: t }
//         );

//         createdMatches.push(m);
//       }

//       // credit wallet (one txn for multiple pairs)
//       const txn = await creditWallet({
//         userId: uplineUser.id,
//         amount: canMake * PAIR_BONUS,
//         reason: "PAIR_BONUS",
//         meta: {
//           each: PAIR_BONUS,
//           newPairs: canMake,
//           countsAfter: {
//             left: Number(uplineUser.leftCount || 0),
//             right: Number(uplineUser.rightCount || 0),
//           },
//           triggeredSide: placedPosition,
//           triggeredByUserId: startParentUserId,
//           pairs: createdMatches.map((m) => ({
//             pairMatchId: m.id,
//             leftUserId: m.leftUserId,
//             leftUserName: leftMap.get(m.leftUserId)?.name || null,
//             rightUserId: m.rightUserId,
//             rightUserName: rightMap.get(m.rightUserId)?.name || null,
//             matchedAt: m.matchedAt,
//           })),
//         },
//         t,
//       });

//       // link PairMatch -> walletTransactionId
//       for (const m of createdMatches) {
//         await m.update({ walletTransactionId: txn.id }, { transaction: t });
//       }

//       uplineUser.paidPairs = Number(uplineUser.paidPairs || 0) + canMake;
//     }

//     await uplineUser.save({ transaction: t });

//     // move up
//     const currentNode = await BinaryNode.findOne({
//       where: { userId: uplineUser.id },
//       transaction: t,
//     });

//     pos = currentNode?.position;
//     if (!currentNode?.parentId) break;

//     node = await BinaryNode.findOne({
//       where: { userId: currentNode.parentId },
//       transaction: t,
//     });
//   }
// }

// // ========================= REGISTER =========================
// // POST /api/auth/register
// // Body: { name,email,phone,password, referralCode?: "<link-code>" }
// router.post("/register", async (req, res) => {
//   const { name, email, phone, password } = req.body;
//   const referralCode = req.body.referralCode;

//   const t = await sequelize.transaction();
//   try {
//     if (!name || !email || !phone || !password) {
//       throw new Error("name,email,phone,password required");
//     }

//     // prevent duplicates
//     const existsEmail = await User.findOne({ where: { email }, transaction: t });
//     if (existsEmail) throw new Error("Email already exists");

//     const existsPhone = await User.findOne({ where: { phone }, transaction: t });
//     if (existsPhone) throw new Error("Phone already exists");

//     // unique user referralCode
//     let myCode = generateReferralCode();
//     while (await User.findOne({ where: { referralCode: myCode }, transaction: t })) {
//       myCode = generateReferralCode();
//     }

//     // create user
//     const user = await User.create(
//       { name, email, phone, password, referralCode: myCode },
//       { transaction: t }
//     );

//     // create wallet
//     await Wallet.create({ userId: user.id, balance: 0 }, { transaction: t });

//     // create binary node for user
//     await BinaryNode.create(
//       {
//         userId: user.id,
//         parentId: null,
//         position: null,
//         leftChildId: null,
//         rightChildId: null,
//       },
//       { transaction: t }
//     );

//     // ========================= APPLY REFERRAL (SPILLOVER) =========================
//     if (referralCode) {
//       const link = await ReferralLink.findOne({
//         where: { code: referralCode, isActive: true },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//       if (!link) throw new Error("Invalid referral code");

//       const sponsor = await User.findByPk(link.sponsorId, {
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//       if (!sponsor) throw new Error("Sponsor not found");

//       const pos = String(link.position || "").toUpperCase();
//       if (!["LEFT", "RIGHT"].includes(pos)) throw new Error("Invalid referral position");

//       // direct sponsor
//       user.sponsorId = sponsor.id;
//       await user.save({ transaction: t });

//       // ensure sponsor node exists
//       await ensureNode(sponsor.id, t);

//       // spillover placement down the chosen side
//       const placedParent = await findPlacementParent({
//         sponsorUserId: sponsor.id,
//         position: pos,
//         t,
//       });

//       // audit referral row
//       const refRow = await Referral.create(
//         {
//           sponsorId: sponsor.id,
//           referredUserId: user.id,
//           position: pos,
//           joinBonusPaid: false,
//         },
//         { transaction: t }
//       );

//       // attach my node under placement parent
//       const myNode = await BinaryNode.findOne({
//         where: { userId: user.id },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });

//       myNode.parentId = placedParent.userId;
//       myNode.position = pos;
//       await myNode.save({ transaction: t });

//       // set placement parent's child pointer
//       if (pos === "LEFT") placedParent.leftChildId = user.id;
//       else placedParent.rightChildId = user.id;
//       await placedParent.save({ transaction: t });

//       // ✅ join bonus to sponsor (once)
//       if (!refRow.joinBonusPaid) {
//         await creditWallet({
//           userId: sponsor.id,
//           amount: JOIN_BONUS,
//           reason: "REFERRAL_JOIN_BONUS",
//           meta: {
//             referredUserId: user.id,
//             referredName: user.name,
//             placedUnderUserId: placedParent.userId,
//             placedPosition: pos,
//           },
//           t,
//         });

//         refRow.joinBonusPaid = true;
//         await refRow.save({ transaction: t });
//       }

//       // ✅ upline pair logic
//       await updateUplineCountsAndBonuses({
//         startParentUserId: placedParent.userId,
//         placedPosition: pos,
//         newlyJoinedUserId: user.id,
//         t,
//       });
//     }

//     await t.commit();

//     const token = signToken(user.id);
//     return res.json({
//       msg: "Registered",
//       token,
//       user: {
//         id: user.id,
//         name: user.name,
//         role: user.role,
//         email: user.email,
//         phone: user.phone,
//         referralCode: user.referralCode,
//       },
//     });
//   } catch (err) {
//     await t.rollback();
//     return res.status(400).json({ msg: err.message });
//   }
// });

// // ========================= LOGIN =========================
// router.post("/login", async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     if (!email || !password) return res.status(400).json({ msg: "email,password required" });

//     const user = await User.findOne({ where: { email } });
//     if (!user) return res.status(400).json({ msg: "Invalid credentials" });

//     const ok = await bcrypt.compare(password, user.password);
//     if (!ok) return res.status(400).json({ msg: "Invalid credentials" });

//     const token = signToken(user.id);
//     return res.json({
//       msg: "Logged in",
//       token,
//       user: {
//         id: user.id,
//         name: user.name,
//         role: user.role,
//         email: user.email,
//         phone: user.phone,
//         referralCode: user.referralCode,
//       },
//     });
//   } catch (err) {
//     return res.status(500).json({ msg: err.message });
//   }
// });

// export default router;

// // ========================= routes/auth.js (FULL CODE) =========================
// import express from "express";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import { sequelize } from "../config/db.js";

// import User from "../models/User.js";
// import Wallet from "../models/Wallet.js";
// import WalletTransaction from "../models/WalletTransaction.js";

// import Referral from "../models/Referral.js";
// import ReferralLink from "../models/ReferralLink.js";
// import BinaryNode from "../models/BinaryNode.js";

// import PairPending from "../models/PairPending.js";
// import PairMatch from "../models/PairMatch.js";

// const router = express.Router();

// console.log("AUTH FILE: JOIN BONUS AFTER 30K SPEND (pending txn until unlock) + PAIR ENABLED");

// const MIN_SPEND_UNLOCK = 30000; // ✅ 30,000 spend after DELIVERED (you will update wallet.totalSpent in orders route)
// const JOIN_BONUS = 5000;
// const PAIR_BONUS = 3000;

// const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" });

// const generateReferralCode = () =>
//   "R" + Math.random().toString(36).substring(2, 8).toUpperCase();

// // ========================= WALLET CREDIT (returns txn) =========================
// // ✅ JOIN BONUS rule:
// // - sponsor wallet must be unlocked (totalSpent >= 30000)
// // - referred user wallet must be unlocked (totalSpent >= 30000)
// // If not unlocked -> create CREDIT txn as pending (balance NOT added)
// async function creditWallet({ userId, amount, reason, meta, t }) {
//   const wallet = await Wallet.findOne({
//     where: { userId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!wallet) throw new Error("Wallet not found");

//   // ✅ normalize
//   const sponsorUnlocked =
//     !!wallet.isUnlocked && Number(wallet.totalSpent || 0) >= Number(MIN_SPEND_UNLOCK);

//   let canCredit = true;
//   let pendingReason = null;

//   if (reason === "REFERRAL_JOIN_BONUS") {
//     const referredUserId = meta?.referredUserId;

//     if (!referredUserId) {
//       canCredit = false;
//       pendingReason = "MISSING_REFERRED_USER_ID";
//     } else {
//       const referredWallet = await Wallet.findOne({
//         where: { userId: referredUserId },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });

//       const referredUnlocked =
//         !!referredWallet?.isUnlocked &&
//         Number(referredWallet?.totalSpent || 0) >= Number(MIN_SPEND_UNLOCK);

//       if (!sponsorUnlocked) {
//         canCredit = false;
//         pendingReason = "SPONSOR_NOT_UNLOCKED";
//       } else if (!referredUnlocked) {
//         canCredit = false;
//         pendingReason = "REFERRED_NOT_UNLOCKED";
//       }
//     }
//   }

//   // ✅ not eligible now -> create pending txn only (no balance add)
//   if (!canCredit) {
//     const txn = await WalletTransaction.create(
//       {
//         walletId: wallet.id,
//         type: "CREDIT",
//         amount,
//         reason,
//         meta: {
//           ...(meta || {}),
//           pending: true,
//           pendingReason,
//           minSpendRequired: MIN_SPEND_UNLOCK,
//           createdButNotCredited: true,
//         },
//       },
//       { transaction: t }
//     );
//     return txn;
//   }

//   // ✅ eligible -> add to balance + create txn
//   wallet.balance = Number(wallet.balance || 0) + Number(amount || 0);
//   await wallet.save({ transaction: t });

//   const txn = await WalletTransaction.create(
//     { walletId: wallet.id, type: "CREDIT", amount, reason, meta: meta || null },
//     { transaction: t }
//   );

//   return txn;
// }

// // ========================= BINARY NODE HELPERS =========================
// async function ensureNode(userId, t) {
//   let node = await BinaryNode.findOne({
//     where: { userId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!node) {
//     node = await BinaryNode.create(
//       { userId, parentId: null, position: null, leftChildId: null, rightChildId: null },
//       { transaction: t }
//     );
//   }
//   return node;
// }

// // Spillover placement: go down LEFT/RIGHT path until empty slot
// async function findPlacementParent({ sponsorUserId, position, t }) {
//   let current = await BinaryNode.findOne({
//     where: { userId: sponsorUserId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!current) throw new Error("Sponsor node not found");

//   while (true) {
//     if (position === "LEFT") {
//       if (!current.leftChildId) return current;
//       current = await BinaryNode.findOne({
//         where: { userId: current.leftChildId },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//     } else {
//       if (!current.rightChildId) return current;
//       current = await BinaryNode.findOne({
//         where: { userId: current.rightChildId },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//     }
//     if (!current) throw new Error("Broken tree: missing node while placing");
//   }
// }

// // ========================= PAIRING (PairPending + PairMatch) =========================
// async function updateUplineCountsAndBonuses({ startParentUserId, placedPosition, newlyJoinedUserId, t }) {
//   let node = await BinaryNode.findOne({
//     where: { userId: startParentUserId },
//     transaction: t,
//   });

//   let pos = placedPosition;

//   while (node) {
//     const uplineUser = await User.findByPk(node.userId, {
//       transaction: t,
//       lock: t.LOCK.UPDATE,
//     });
//     if (!uplineUser) break;

//     // 1) increment counts
//     if (pos === "LEFT") uplineUser.leftCount = Number(uplineUser.leftCount || 0) + 1;
//     else uplineUser.rightCount = Number(uplineUser.rightCount || 0) + 1;

//     // 2) store pending entry (exact downline id)
//     await PairPending.create(
//       { uplineUserId: uplineUser.id, side: pos, downlineUserId: newlyJoinedUserId, isUsed: false },
//       { transaction: t }
//     );

//     // 3) FIFO unused left & right
//     const leftUnused = await PairPending.findAll({
//       where: { uplineUserId: uplineUser.id, side: "LEFT", isUsed: false },
//       order: [["id", "ASC"]],
//       transaction: t,
//       lock: t.LOCK.UPDATE,
//     });

//     const rightUnused = await PairPending.findAll({
//       where: { uplineUserId: uplineUser.id, side: "RIGHT", isUsed: false },
//       order: [["id", "ASC"]],
//       transaction: t,
//       lock: t.LOCK.UPDATE,
//     });

//     const canMake = Math.min(leftUnused.length, rightUnused.length);

//     if (canMake > 0) {
//       const pairs = [];
//       for (let i = 0; i < canMake; i++) pairs.push({ leftP: leftUnused[i], rightP: rightUnused[i] });

//       const leftIds = pairs.map((p) => p.leftP.downlineUserId);
//       const rightIds = pairs.map((p) => p.rightP.downlineUserId);

//       const [leftUsers, rightUsers] = await Promise.all([
//         User.findAll({ where: { id: leftIds }, attributes: ["id", "name"], transaction: t }),
//         User.findAll({ where: { id: rightIds }, attributes: ["id", "name"], transaction: t }),
//       ]);

//       const leftMap = new Map(leftUsers.map((u) => [u.id, u]));
//       const rightMap = new Map(rightUsers.map((u) => [u.id, u]));

//       const createdMatches = [];
//       for (const p of pairs) {
//         const m = await PairMatch.create(
//           {
//             uplineUserId: uplineUser.id,
//             leftUserId: p.leftP.downlineUserId,
//             rightUserId: p.rightP.downlineUserId,
//             bonusEach: PAIR_BONUS,
//             amount: PAIR_BONUS,
//             matchedAt: new Date(),
//           },
//           { transaction: t }
//         );

//         await p.leftP.update({ isUsed: true, usedInPairMatchId: m.id }, { transaction: t });
//         await p.rightP.update({ isUsed: true, usedInPairMatchId: m.id }, { transaction: t });

//         createdMatches.push(m);
//       }

//       // NOTE: Pair bonus still credits immediately here.
//       // Later you can apply same "30k unlock" rule to PAIR_BONUS too.
//       const txn = await creditWallet({
//         userId: uplineUser.id,
//         amount: canMake * PAIR_BONUS,
//         reason: "PAIR_BONUS",
//         meta: {
//           each: PAIR_BONUS,
//           newPairs: canMake,
//           countsAfter: { left: Number(uplineUser.leftCount || 0), right: Number(uplineUser.rightCount || 0) },
//           triggeredSide: placedPosition,
//           triggeredByUserId: startParentUserId,
//           pairs: createdMatches.map((m) => ({
//             pairMatchId: m.id,
//             leftUserId: m.leftUserId,
//             leftUserName: leftMap.get(m.leftUserId)?.name || null,
//             rightUserId: m.rightUserId,
//             rightUserName: rightMap.get(m.rightUserId)?.name || null,
//             matchedAt: m.matchedAt,
//           })),
//         },
//         t,
//       });

//       for (const m of createdMatches) {
//         await m.update({ walletTransactionId: txn.id }, { transaction: t });
//       }

//       uplineUser.paidPairs = Number(uplineUser.paidPairs || 0) + canMake;
//     }

//     await uplineUser.save({ transaction: t });

//     // move up
//     const currentNode = await BinaryNode.findOne({
//       where: { userId: uplineUser.id },
//       transaction: t,
//     });

//     pos = currentNode?.position;
//     if (!currentNode?.parentId) break;

//     node = await BinaryNode.findOne({
//       where: { userId: currentNode.parentId },
//       transaction: t,
//     });
//   }
// }

// // ========================= REGISTER =========================
// // POST /api/auth/register
// // Body: { name,email,phone,password, referralCode?: "<link-code>" }
// router.post("/register", async (req, res) => {
//   const { name, email, phone, password } = req.body;
//   const referralCode = req.body.referralCode;

//   const t = await sequelize.transaction();
//   try {
//     if (!name || !email || !phone || !password) throw new Error("name,email,phone,password required");

//     const existsEmail = await User.findOne({ where: { email }, transaction: t });
//     if (existsEmail) throw new Error("Email already exists");

//     const existsPhone = await User.findOne({ where: { phone }, transaction: t });
//     if (existsPhone) throw new Error("Phone already exists");

//     // unique user referralCode
//     let myCode = generateReferralCode();
//     while (await User.findOne({ where: { referralCode: myCode }, transaction: t })) {
//       myCode = generateReferralCode();
//     }

//     // create user
//     const user = await User.create({ name, email, phone, password, referralCode: myCode }, { transaction: t });

//     // create wallet (must have totalSpent + isUnlocked fields in model)
//     await Wallet.create(
//       { userId: user.id, balance: 0, totalSpent: 0, isUnlocked: false },
//       { transaction: t }
//     );

//     // create binary node for user
//     await BinaryNode.create(
//       { userId: user.id, parentId: null, position: null, leftChildId: null, rightChildId: null },
//       { transaction: t }
//     );

//     // ========================= APPLY REFERRAL (SPILLOVER) =========================
//     if (referralCode) {
//       const link = await ReferralLink.findOne({
//         where: { code: referralCode, isActive: true },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//       if (!link) throw new Error("Invalid referral code");

//       const sponsor = await User.findByPk(link.sponsorId, { transaction: t, lock: t.LOCK.UPDATE });
//       if (!sponsor) throw new Error("Sponsor not found");

//       const pos = String(link.position || "").toUpperCase();
//       if (!["LEFT", "RIGHT"].includes(pos)) throw new Error("Invalid referral position");

//       // direct sponsor
//       user.sponsorId = sponsor.id;
//       await user.save({ transaction: t });

//       // ensure sponsor node exists
//       await ensureNode(sponsor.id, t);

//       // spillover placement down the chosen side
//       const placedParent = await findPlacementParent({ sponsorUserId: sponsor.id, position: pos, t });

//       // audit referral row
//       const refRow = await Referral.create(
//         { sponsorId: sponsor.id, referredUserId: user.id, position: pos, joinBonusPaid: false },
//         { transaction: t }
//       );

//       // attach my node under placement parent
//       const myNode = await BinaryNode.findOne({
//         where: { userId: user.id },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });

//       myNode.parentId = placedParent.userId;
//       myNode.position = pos;
//       await myNode.save({ transaction: t });

//       // set placement parent's child pointer
//       if (pos === "LEFT") placedParent.leftChildId = user.id;
//       else placedParent.rightChildId = user.id;
//       await placedParent.save({ transaction: t });

//       // ✅ JOIN BONUS CALL SAME — BUT creditWallet will hold it until 30k unlock
//       if (!refRow.joinBonusPaid) {
//         const txn = await creditWallet({
//           userId: sponsor.id,
//           amount: JOIN_BONUS,
//           reason: "REFERRAL_JOIN_BONUS",
//           meta: {
//             referredUserId: user.id,
//             referredName: user.name,
//             placedUnderUserId: placedParent.userId,
//             placedPosition: pos,
//           },
//           t,
//         });

//         // ✅ mark as paid ONLY if it was actually credited (not pending)
//         if (txn?.meta?.pending !== true) {
//           refRow.joinBonusPaid = true;
//           await refRow.save({ transaction: t });
//         }
//       }

//       // ✅ upline pair logic (still immediate; later we can apply 30k rule to pairs too)
//       await updateUplineCountsAndBonuses({
//         startParentUserId: placedParent.userId,
//         placedPosition: pos,
//         newlyJoinedUserId: user.id,
//         t,
//       });
//     }

//     await t.commit();

//     const token = signToken(user.id);
//     return res.json({
//       msg: "Registered",
//       token,
//       user: {
//         id: user.id,
//         name: user.name,
//         role: user.role,
//         email: user.email,
//         phone: user.phone,
//         referralCode: user.referralCode,
//       },
//     });
//   } catch (err) {
//     await t.rollback();
//     return res.status(400).json({ msg: err.message });
//   }
// });

// // ========================= LOGIN =========================
// router.post("/login", async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     if (!email || !password) return res.status(400).json({ msg: "email,password required" });

//     const user = await User.findOne({ where: { email } });
//     if (!user) return res.status(400).json({ msg: "Invalid credentials" });

//     const ok = await bcrypt.compare(password, user.password);
//     if (!ok) return res.status(400).json({ msg: "Invalid credentials" });

//     const token = signToken(user.id);
//     return res.json({
//       msg: "Logged in",
//       token,
//       user: {
//         id: user.id,
//         name: user.name,
//         role: user.role,
//         email: user.email,
//         phone: user.phone,
//         referralCode: user.referralCode,
//       },
//     });
//   } catch (err) {
//     return res.status(500).json({ msg: err.message });
//   }
// });

// export default router;

// // ========================= routes/auth.js (FULL CODE) =========================
// import express from "express";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import { sequelize } from "../config/db.js";

// import User from "../models/User.js";
// import Wallet from "../models/Wallet.js";
// import WalletTransaction from "../models/WalletTransaction.js";

// import Referral from "../models/Referral.js";
// import ReferralLink from "../models/ReferralLink.js";
// import BinaryNode from "../models/BinaryNode.js";

// import PairPending from "../models/PairPending.js";
// import PairMatch from "../models/PairMatch.js";

// const router = express.Router();

// console.log("AUTH FILE: JOIN + PAIR BONUS (pending until 30k unlock) + PAIR-PENDING + PAIR-MATCH");

// const MIN_SPEND_UNLOCK = 30000;
// const JOIN_BONUS = 5000;
// const PAIR_BONUS = 3000;

// const signToken = (id) =>
//   jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" });

// const generateReferralCode = () =>
//   "R" + Math.random().toString(36).substring(2, 8).toUpperCase();

// // ========================= WALLET CREDIT (returns txn) =========================
// // ✅ JOIN + PAIR both pending rules
// async function creditWallet({ userId, amount, reason, meta, t }) {
//   const wallet = await Wallet.findOne({
//     where: { userId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!wallet) throw new Error("Wallet not found");

//   const minSpend = MIN_SPEND_UNLOCK;

//   const isUnlocked = (w) =>
//     !!w?.isUnlocked && Number(w?.totalSpent || 0) >= Number(minSpend);

//   const receiverUnlocked = isUnlocked(wallet);

//   let canCredit = true;
//   let pendingReason = null;

//   // ✅ RULE 1: JOIN BONUS -> sponsor + referred both unlocked
//   if (reason === "REFERRAL_JOIN_BONUS") {
//     const referredUserId = meta?.referredUserId;
//     if (!referredUserId) {
//       canCredit = false;
//       pendingReason = "MISSING_REFERRED_USER_ID";
//     } else {
//       const referredWallet = await Wallet.findOne({
//         where: { userId: referredUserId },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });

//       if (!receiverUnlocked) {
//         canCredit = false;
//         pendingReason = "SPONSOR_NOT_UNLOCKED";
//       } else if (!isUnlocked(referredWallet)) {
//         canCredit = false;
//         pendingReason = "REFERRED_NOT_UNLOCKED";
//       }
//     }
//   }

//   // ✅ RULE 2: PAIR BONUS -> upline + left + right all unlocked
//   if (reason === "PAIR_BONUS") {
//     // If multiple pairs credited in one txn, we validate all pairs.
//     const pairs = Array.isArray(meta?.pairs) && meta.pairs.length
//       ? meta.pairs
//       : [{ leftUserId: meta?.leftUserId, rightUserId: meta?.rightUserId }];

//     if (!receiverUnlocked) {
//       canCredit = false;
//       pendingReason = "UPLINE_NOT_UNLOCKED";
//     } else {
//       for (const p of pairs) {
//         const leftUserId = p?.leftUserId;
//         const rightUserId = p?.rightUserId;

//         if (!leftUserId || !rightUserId) {
//           canCredit = false;
//           pendingReason = "MISSING_LEFT_RIGHT_IDS";
//           break;
//         }

//         const [leftW, rightW] = await Promise.all([
//           Wallet.findOne({
//             where: { userId: leftUserId },
//             transaction: t,
//             lock: t.LOCK.UPDATE,
//           }),
//           Wallet.findOne({
//             where: { userId: rightUserId },
//             transaction: t,
//             lock: t.LOCK.UPDATE,
//           }),
//         ]);

//         if (!isUnlocked(leftW)) {
//           canCredit = false;
//           pendingReason = "LEFT_NOT_UNLOCKED";
//           break;
//         }
//         if (!isUnlocked(rightW)) {
//           canCredit = false;
//           pendingReason = "RIGHT_NOT_UNLOCKED";
//           break;
//         }
//       }
//     }
//   }

//   // ✅ If not eligible -> create pending txn only (no balance add)
//   if (!canCredit) {
//     const txn = await WalletTransaction.create(
//       {
//         walletId: wallet.id,
//         type: "CREDIT",
//         amount,
//         reason,
//         meta: {
//           ...(meta || {}),
//           pending: true,
//           pendingReason,
//           minSpendRequired: minSpend,
//           createdButNotCredited: true,
//         },
//       },
//       { transaction: t }
//     );
//     return txn;
//   }

//   // ✅ Eligible -> credit wallet
//   wallet.balance = Number(wallet.balance || 0) + Number(amount || 0);
//   await wallet.save({ transaction: t });

//   const txn = await WalletTransaction.create(
//     { walletId: wallet.id, type: "CREDIT", amount, reason, meta: meta || null },
//     { transaction: t }
//   );

//   return txn;
// }

// // ========================= BINARY NODE HELPERS =========================
// async function ensureNode(userId, t) {
//   let node = await BinaryNode.findOne({
//     where: { userId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!node) {
//     node = await BinaryNode.create(
//       {
//         userId,
//         parentId: null,
//         position: null,
//         leftChildId: null,
//         rightChildId: null,
//       },
//       { transaction: t }
//     );
//   }
//   return node;
// }

// // Spillover placement: go down LEFT/RIGHT path until empty slot
// async function findPlacementParent({ sponsorUserId, position, t }) {
//   let current = await BinaryNode.findOne({
//     where: { userId: sponsorUserId },
//     transaction: t,
//     lock: t.LOCK.UPDATE,
//   });
//   if (!current) throw new Error("Sponsor node not found");

//   while (true) {
//     if (position === "LEFT") {
//       if (!current.leftChildId) return current;

//       current = await BinaryNode.findOne({
//         where: { userId: current.leftChildId },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//     } else {
//       if (!current.rightChildId) return current;

//       current = await BinaryNode.findOne({
//         where: { userId: current.rightChildId },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//     }

//     if (!current) throw new Error("Broken tree: missing node while placing");
//   }
// }

// // ========================= PAIRING (PairPending + PairMatch) =========================
// async function updateUplineCountsAndBonuses({
//   startParentUserId,
//   placedPosition,
//   newlyJoinedUserId,
//   t,
// }) {
//   let node = await BinaryNode.findOne({
//     where: { userId: startParentUserId },
//     transaction: t,
//   });

//   let pos = placedPosition;

//   while (node) {
//     const uplineUser = await User.findByPk(node.userId, {
//       transaction: t,
//       lock: t.LOCK.UPDATE,
//     });
//     if (!uplineUser) break;

//     // 1) increment counts
//     if (pos === "LEFT")
//       uplineUser.leftCount = Number(uplineUser.leftCount || 0) + 1;
//     else uplineUser.rightCount = Number(uplineUser.rightCount || 0) + 1;

//     // 2) store pending entry (exact downline id)
//     await PairPending.create(
//       {
//         uplineUserId: uplineUser.id,
//         side: pos,
//         downlineUserId: newlyJoinedUserId,
//         isUsed: false,
//       },
//       { transaction: t }
//     );

//     // 3) find FIFO unused left & right
//     const leftUnused = await PairPending.findAll({
//       where: { uplineUserId: uplineUser.id, side: "LEFT", isUsed: false },
//       order: [["id", "ASC"]],
//       transaction: t,
//       lock: t.LOCK.UPDATE,
//     });

//     const rightUnused = await PairPending.findAll({
//       where: { uplineUserId: uplineUser.id, side: "RIGHT", isUsed: false },
//       order: [["id", "ASC"]],
//       transaction: t,
//       lock: t.LOCK.UPDATE,
//     });

//     const canMake = Math.min(leftUnused.length, rightUnused.length);

//     if (canMake > 0) {
//       // Build pairs FIFO
//       const pairs = [];
//       for (let i = 0; i < canMake; i++) {
//         pairs.push({ leftP: leftUnused[i], rightP: rightUnused[i] });
//       }

//       // fetch names for meta
//       const leftIds = pairs.map((p) => p.leftP.downlineUserId);
//       const rightIds = pairs.map((p) => p.rightP.downlineUserId);

//       const [leftUsers, rightUsers] = await Promise.all([
//         User.findAll({
//           where: { id: leftIds },
//           attributes: ["id", "name"],
//           transaction: t,
//         }),
//         User.findAll({
//           where: { id: rightIds },
//           attributes: ["id", "name"],
//           transaction: t,
//         }),
//       ]);

//       const leftMap = new Map(leftUsers.map((u) => [u.id, u]));
//       const rightMap = new Map(rightUsers.map((u) => [u.id, u]));

//       // create PairMatch rows + mark pendings used
//       const createdMatches = [];
//       for (const p of pairs) {
//         const leftDownId = p.leftP.downlineUserId;
//         const rightDownId = p.rightP.downlineUserId;

//         const m = await PairMatch.create(
//           {
//             uplineUserId: uplineUser.id,
//             leftUserId: leftDownId,
//             rightUserId: rightDownId,
//             bonusEach: PAIR_BONUS,
//             amount: PAIR_BONUS,
//             matchedAt: new Date(),
//           },
//           { transaction: t }
//         );

//         await p.leftP.update(
//           { isUsed: true, usedInPairMatchId: m.id },
//           { transaction: t }
//         );
//         await p.rightP.update(
//           { isUsed: true, usedInPairMatchId: m.id },
//           { transaction: t }
//         );

//         createdMatches.push(m);
//       }

//       // ✅ credit wallet (one txn for multiple pairs)
//       // NOW this also respects 30k rule for upline + left + right using creditWallet()
//       const txn = await creditWallet({
//         userId: uplineUser.id,
//         amount: canMake * PAIR_BONUS,
//         reason: "PAIR_BONUS",
//         meta: {
//           each: PAIR_BONUS,
//           newPairs: canMake,
//           countsAfter: {
//             left: Number(uplineUser.leftCount || 0),
//             right: Number(uplineUser.rightCount || 0),
//           },
//           triggeredSide: placedPosition,
//           triggeredByUserId: startParentUserId,
//           pairs: createdMatches.map((m) => ({
//             pairMatchId: m.id,
//             leftUserId: m.leftUserId,
//             leftUserName: leftMap.get(m.leftUserId)?.name || null,
//             rightUserId: m.rightUserId,
//             rightUserName: rightMap.get(m.rightUserId)?.name || null,
//             matchedAt: m.matchedAt,
//           })),
//         },
//         t,
//       });

//       // link PairMatch -> walletTransactionId (even if pending, we keep the link)
//       for (const m of createdMatches) {
//         await m.update({ walletTransactionId: txn.id }, { transaction: t });
//       }

//       // Note: paidPairs is "pairs created/processed", not necessarily "paid to wallet now"
//       uplineUser.paidPairs = Number(uplineUser.paidPairs || 0) + canMake;
//     }

//     await uplineUser.save({ transaction: t });

//     // move up
//     const currentNode = await BinaryNode.findOne({
//       where: { userId: uplineUser.id },
//       transaction: t,
//     });

//     pos = currentNode?.position;
//     if (!currentNode?.parentId) break;

//     node = await BinaryNode.findOne({
//       where: { userId: currentNode.parentId },
//       transaction: t,
//     });
//   }
// }

// // ========================= REGISTER =========================
// // POST /api/auth/register
// // Body: { name,email,phone,password, referralCode?: "<link-code>" }
// router.post("/register", async (req, res) => {
//   const { name, email, phone, password } = req.body;
//   const referralCode = req.body.referralCode;

//   const t = await sequelize.transaction();
//   try {
//     if (!name || !email || !phone || !password) {
//       throw new Error("name,email,phone,password required");
//     }

//     // prevent duplicates
//     const existsEmail = await User.findOne({ where: { email }, transaction: t });
//     if (existsEmail) throw new Error("Email already exists");

//     const existsPhone = await User.findOne({ where: { phone }, transaction: t });
//     if (existsPhone) throw new Error("Phone already exists");

//     // unique user referralCode
//     let myCode = generateReferralCode();
//     while (await User.findOne({ where: { referralCode: myCode }, transaction: t })) {
//       myCode = generateReferralCode();
//     }

//     // create user
//     const user = await User.create(
//       { name, email, phone, password, referralCode: myCode },
//       { transaction: t }
//     );

//     // create wallet
//     await Wallet.create(
//       { userId: user.id, balance: 0, totalSpent: 0, isUnlocked: false },
//       { transaction: t }
//     );

//     // create binary node for user
//     await BinaryNode.create(
//       {
//         userId: user.id,
//         parentId: null,
//         position: null,
//         leftChildId: null,
//         rightChildId: null,
//       },
//       { transaction: t }
//     );

//     // ========================= APPLY REFERRAL (SPILLOVER) =========================
//     if (referralCode) {
//       const link = await ReferralLink.findOne({
//         where: { code: referralCode, isActive: true },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//       if (!link) throw new Error("Invalid referral code");

//       const sponsor = await User.findByPk(link.sponsorId, {
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//       if (!sponsor) throw new Error("Sponsor not found");

//       const pos = String(link.position || "").toUpperCase();
//       if (!["LEFT", "RIGHT"].includes(pos)) throw new Error("Invalid referral position");

//       // direct sponsor
//       user.sponsorId = sponsor.id;
//       await user.save({ transaction: t });

//       // ensure sponsor node exists
//       await ensureNode(sponsor.id, t);

//       // spillover placement down the chosen side
//       const placedParent = await findPlacementParent({
//         sponsorUserId: sponsor.id,
//         position: pos,
//         t,
//       });

//       // audit referral row
//       const refRow = await Referral.create(
//         {
//           sponsorId: sponsor.id,
//           referredUserId: user.id,
//           position: pos,
//           joinBonusPaid: false,
//         },
//         { transaction: t }
//       );

//       // attach my node under placement parent
//       const myNode = await BinaryNode.findOne({
//         where: { userId: user.id },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });

//       myNode.parentId = placedParent.userId;
//       myNode.position = pos;
//       await myNode.save({ transaction: t });

//       // set placement parent's child pointer
//       if (pos === "LEFT") placedParent.leftChildId = user.id;
//       else placedParent.rightChildId = user.id;
//       await placedParent.save({ transaction: t });

//       // ✅ JOIN BONUS (will be pending until sponsor + referred unlock)
//       if (!refRow.joinBonusPaid) {
//         const txn = await creditWallet({
//           userId: sponsor.id,
//           amount: JOIN_BONUS,
//           reason: "REFERRAL_JOIN_BONUS",
//           meta: {
//             referredUserId: user.id,
//             referredName: user.name,
//             placedUnderUserId: placedParent.userId,
//             placedPosition: pos,
//           },
//           t,
//         });

//         // mark paid only if actually credited
//         if (txn?.meta?.pending !== true) {
//           refRow.joinBonusPaid = true;
//           await refRow.save({ transaction: t });
//         }
//       }

//       // ✅ upline pair logic (PAIR_BONUS will also be pending until A+B+C unlock)
//       await updateUplineCountsAndBonuses({
//         startParentUserId: placedParent.userId,
//         placedPosition: pos,
//         newlyJoinedUserId: user.id,
//         t,
//       });
//     }

//     await t.commit();

//     const token = signToken(user.id);
//     return res.json({
//       msg: "Registered",
//       token,
//       user: {
//         id: user.id,
//         name: user.name,
//         role: user.role,
//         email: user.email,
//         phone: user.phone,
//         referralCode: user.referralCode,
//       },
//     });
//   } catch (err) {
//     await t.rollback();
//     return res.status(400).json({ msg: err.message });
//   }
// });

// // ========================= LOGIN =========================
// router.post("/login", async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     if (!email || !password)
//       return res.status(400).json({ msg: "email,password required" });

//     const user = await User.findOne({ where: { email } });
//     if (!user) return res.status(400).json({ msg: "Invalid credentials" });

//     const ok = await bcrypt.compare(password, user.password);
//     if (!ok) return res.status(400).json({ msg: "Invalid credentials" });

//     const token = signToken(user.id);
//     return res.json({
//       msg: "Logged in",
//       token,
//       user: {
//         id: user.id,
//         name: user.name,
//         role: user.role,
//         email: user.email,
//         phone: user.phone,
//         referralCode: user.referralCode,
//       },
//     });
//   } catch (err) {
//     return res.status(500).json({ msg: err.message });
//   }
// });

// export default router;


// ========================= routes/auth.js (FULL CODE) =========================// routes/auth.js (FULL CODE)  ✅ ROLE=ADMIN direct create ✅ JOIN+PAIR pending until 30k unlock ✅ PairPending + PairMatch
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sequelize } from "../config/db.js";

import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";

import Referral from "../models/Referral.js";
import ReferralLink from "../models/ReferralLink.js";
import BinaryNode from "../models/BinaryNode.js";

import PairPending from "../models/PairPending.js";
import PairMatch from "../models/PairMatch.js";
import { getSettingNumber } from "../config/settings.js";
import { uploadProfilePic } from "../config/upload.js";
import { Op } from "sequelize";
import { checkAndGrantAwards } from "../config/awardRewards.js";



const router = express.Router();

console.log(
  "AUTH FILE: JOIN + PAIR BONUS (pending until 30k unlock) + PAIR-PENDING + PAIR-MATCH + ADMIN DIRECT CREATE"
);

// const MIN_SPEND_UNLOCK = 30000;


const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" });

const generateReferralCode = () =>
  "R" + Math.random().toString(36).substring(2, 8).toUpperCase();

// ========================= WALLET CREDIT (returns txn) =========================
// ✅ JOIN + PAIR both pending rules
async function creditWallet({ userId, amount, reason, meta, t }) {
  const wallet = await Wallet.findOne({
    where: { userId },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!wallet) throw new Error("Wallet not found");

  const minSpend = (await getSettingNumber("MIN_SPEND_UNLOCK", t)) || 30000;



  const isUnlocked = (w) =>
    !!w?.isUnlocked && Number(w?.totalSpent || 0) >= Number(minSpend);

  const receiverUnlocked = isUnlocked(wallet);

  let canCredit = true;
  let pendingReason = null;

  // ✅ RULE 1: JOIN BONUS -> sponsor + referred both unlocked
  if (reason === "REFERRAL_JOIN_BONUS") {
    const referredUserId = meta?.referredUserId;

    if (!referredUserId) {
      canCredit = false;
      pendingReason = "MISSING_REFERRED_USER_ID";
    } else {
      const referredWallet = await Wallet.findOne({
        where: { userId: referredUserId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!receiverUnlocked) {
        canCredit = false;
        pendingReason = "SPONSOR_NOT_UNLOCKED";
      } else if (!isUnlocked(referredWallet)) {
        canCredit = false;
        pendingReason = "REFERRED_NOT_UNLOCKED";
      }
    }
  }

  // ✅ RULE 2: PAIR BONUS -> upline + left + right all unlocked
  if (reason === "PAIR_BONUS") {
    // If multiple pairs credited in one txn, validate all pairs.
    const pairs =
      Array.isArray(meta?.pairs) && meta.pairs.length
        ? meta.pairs
        : [{ leftUserId: meta?.leftUserId, rightUserId: meta?.rightUserId }];

    if (!receiverUnlocked) {
      canCredit = false;
      pendingReason = "UPLINE_NOT_UNLOCKED";
    } else {
      for (const p of pairs) {
        const leftUserId = p?.leftUserId;
        const rightUserId = p?.rightUserId;

        if (!leftUserId || !rightUserId) {
          canCredit = false;
          pendingReason = "MISSING_LEFT_RIGHT_IDS";
          break;
        }

        const [leftW, rightW] = await Promise.all([
          Wallet.findOne({
            where: { userId: leftUserId },
            transaction: t,
            lock: t.LOCK.UPDATE,
          }),
          Wallet.findOne({
            where: { userId: rightUserId },
            transaction: t,
            lock: t.LOCK.UPDATE,
          }),
        ]);

        if (!isUnlocked(leftW)) {
          canCredit = false;
          pendingReason = "LEFT_NOT_UNLOCKED";
          break;
        }
        if (!isUnlocked(rightW)) {
          canCredit = false;
          pendingReason = "RIGHT_NOT_UNLOCKED";
          break;
        }
      }
    }
  }

  // ✅ If not eligible -> create pending txn + add to lockedBalance
  if (!canCredit) {
    const txn = await WalletTransaction.create(
      {
        walletId: wallet.id,
        type: "CREDIT",
        amount,
        reason,
        meta: {
          ...(meta || {}),
          pending: true,
          pendingReason,
          minSpendRequired: minSpend,
          createdButNotCredited: true,
        },
      },
      { transaction: t }
    );

    wallet.lockedBalance = Number(wallet.lockedBalance || 0) + Number(amount || 0);
    wallet.totalBalance =
      Number(wallet.balance || 0) + Number(wallet.lockedBalance || 0);

    await wallet.save({ transaction: t });
    return txn;
  }

  // ✅ Eligible -> credit wallet balance
  wallet.balance = Number(wallet.balance || 0) + Number(amount || 0);
  wallet.totalBalance =
    Number(wallet.balance || 0) + Number(wallet.lockedBalance || 0);

  await wallet.save({ transaction: t });

  const txn = await WalletTransaction.create(
    {
      walletId: wallet.id,
      type: "CREDIT",
      amount,
      reason,
      meta: meta || null,
    },
    { transaction: t }
  );

  return txn;

}

// ========================= BINARY NODE HELPERS =========================
async function ensureNode(userId, t) {
  let node = await BinaryNode.findOne({
    where: { userId },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!node) {
    node = await BinaryNode.create(
      {
        userId,
        parentId: null,
        position: null,
        leftChildId: null,
        rightChildId: null,
      },
      { transaction: t }
    );
  }
  return node;
}

// Spillover placement: go down LEFT/RIGHT path until empty slot
async function findPlacementParent({ sponsorUserId, position, t }) {
  let current = await BinaryNode.findOne({
    where: { userId: sponsorUserId },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!current) throw new Error("Sponsor node not found");

  while (true) {
    if (position === "LEFT") {
      if (!current.leftChildId) return current;

      current = await BinaryNode.findOne({
        where: { userId: current.leftChildId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
    } else {
      if (!current.rightChildId) return current;

      current = await BinaryNode.findOne({
        where: { userId: current.rightChildId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
    }

    if (!current) throw new Error("Broken tree: missing node while placing");
  }
}

// ========================= PAIRING (PairPending + PairMatch) =========================
async function updateUplineCountsAndBonuses({
  startParentUserId,
  placedPosition,
  newlyJoinedUserId,
  t,
}) {
  const PAIR_BONUS = await getSettingNumber("PAIR_BONUS", t) || 3000;
  let node = await BinaryNode.findOne({
    where: { userId: startParentUserId },
    transaction: t,
  });

  let pos = placedPosition;

  while (node) {
    const uplineUser = await User.findByPk(node.userId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!uplineUser) break;

    // 1) increment counts
    if (pos === "LEFT")
      uplineUser.leftCount = Number(uplineUser.leftCount || 0) + 1;
    else uplineUser.rightCount = Number(uplineUser.rightCount || 0) + 1;

    // 2) store pending entry (exact downline id)
    await PairPending.create(
      {
        uplineUserId: uplineUser.id,
        side: pos,
        downlineUserId: newlyJoinedUserId,
        isUsed: false,
      },
      { transaction: t }
    );

    // 3) find FIFO unused left & right
    const leftUnused = await PairPending.findAll({
    where: { uplineUserId: uplineUser.id, side: "LEFT", isUsed: false, isFlushed: false },

      order: [["id", "ASC"]],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const rightUnused = await PairPending.findAll({
     where: { uplineUserId: uplineUser.id, side: "RIGHT", isUsed: false, isFlushed: false },

      order: [["id", "ASC"]],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

  

        const canMake = Math.min(leftUnused.length, rightUnused.length);

    if (canMake > 0) {
      const DAILY_PAIR_CEILING =
        (await getSettingNumber("DAILY_PAIR_CEILING", t)) || 17;

      // today range (server timezone; if IST, ok)
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      // how many pairs already matched today
      const todayCount = await PairMatch.count({
        where: {
          uplineUserId: uplineUser.id,
          matchedAt: { [Op.gte]: start, [Op.lt]: end },
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      const remainingToday = Math.max(
        0,
        Number(DAILY_PAIR_CEILING) - Number(todayCount || 0)
      );

      const allowed = Math.min(canMake, remainingToday);
      const flushCount = Math.max(0, canMake - allowed);

      // ✅ 1) create only allowed pairs
      const createdMatches = [];
      if (allowed > 0) {
        const pairs = [];
        for (let i = 0; i < allowed; i++) {
          pairs.push({ leftP: leftUnused[i], rightP: rightUnused[i] });
        }

        const leftIds = pairs.map((p) => p.leftP.downlineUserId);
        const rightIds = pairs.map((p) => p.rightP.downlineUserId);

        const [leftUsers, rightUsers] = await Promise.all([
          User.findAll({
            where: { id: leftIds },
            attributes: ["id", "name"],
            transaction: t,
          }),
          User.findAll({
            where: { id: rightIds },
            attributes: ["id", "name"],
            transaction: t,
          }),
        ]);

        const leftMap = new Map(leftUsers.map((u) => [u.id, u]));
        const rightMap = new Map(rightUsers.map((u) => [u.id, u]));

        for (const p of pairs) {
          const leftDownId = p.leftP.downlineUserId;
          const rightDownId = p.rightP.downlineUserId;

          const m = await PairMatch.create(
            {
              uplineUserId: uplineUser.id,
              leftUserId: leftDownId,
              rightUserId: rightDownId,
              bonusEach: PAIR_BONUS,
              amount: PAIR_BONUS,
              matchedAt: new Date(),
            },
            { transaction: t }
          );

          await p.leftP.update(
            { isUsed: true, usedInPairMatchId: m.id },
            { transaction: t }
          );
          await p.rightP.update(
            { isUsed: true, usedInPairMatchId: m.id },
            { transaction: t }
          );

          createdMatches.push({
            row: m,
            leftName: leftMap.get(m.leftUserId)?.name || null,
            rightName: rightMap.get(m.rightUserId)?.name || null,
          });
        }

        const txn = await creditWallet({
          userId: uplineUser.id,
          amount: allowed * PAIR_BONUS,
          reason: "PAIR_BONUS",
          meta: {
            each: PAIR_BONUS,
            newPairs: allowed,
            dailyCeiling: DAILY_PAIR_CEILING,
            todayAlreadyMatched: todayCount,
            flushedPairs: flushCount,
            pairs: createdMatches.map((x) => ({
              pairMatchId: x.row.id,
              leftUserId: x.row.leftUserId,
              leftUserName: x.leftName,
              rightUserId: x.row.rightUserId,
              rightUserName: x.rightName,
              matchedAt: x.row.matchedAt,
            })),
          },
          t,
        });

        for (const x of createdMatches) {
          await x.row.update({ walletTransactionId: txn.id }, { transaction: t });
        }

        uplineUser.paidPairs = Number(uplineUser.paidPairs || 0) + allowed;
      }

      // ✅ 2) NO carry-forward: flush remaining possible pairs
      if (flushCount > 0) {
        const now = new Date();

        for (let i = allowed; i < canMake; i++) {
          const l = leftUnused[i];
          const r = rightUnused[i];

          await l.update(
            {
              isUsed: true,
              usedInPairMatchId: null,
              isFlushed: true,
              flushedAt: now,
              flushReason: "DAILY_CEILING",
            },
            { transaction: t }
          );

          await r.update(
            {
              isUsed: true,
              usedInPairMatchId: null,
              isFlushed: true,
              flushedAt: now,
              flushReason: "DAILY_CEILING",
            },
            { transaction: t }
          );
        }
      }
    }


    await uplineUser.save({ transaction: t });
    await checkAndGrantAwards({ userId: uplineUser.id, t });


    // move up
    const currentNode = await BinaryNode.findOne({
      where: { userId: uplineUser.id },
      transaction: t,
    });

    pos = currentNode?.position;
    if (!currentNode?.parentId) break;

    node = await BinaryNode.findOne({
      where: { userId: currentNode.parentId },
      transaction: t,
    });
  }
}

// ========================= REGISTER =========================
// POST /api/auth/register
// Body: { name,email,phone,password, referralCode?: "<link-code>", role?: "USER"|"ADMIN" }
// router.post("/register", async (req, res) => {
//   const { name, email, phone, password } = req.body;
//   const referralCode = req.body.referralCode;

//   const t = await sequelize.transaction();
//   try {
//     if (!name || !email || !phone || !password) {
//       throw new Error("name,email,phone,password required");
//     }

//     // prevent duplicates
//     const existsEmail = await User.findOne({ where: { email }, transaction: t });
//     if (existsEmail) throw new Error("Email already exists");

//     const existsPhone = await User.findOne({ where: { phone }, transaction: t });
//     if (existsPhone) throw new Error("Phone already exists");

//     // unique referralCode
//     let myCode = generateReferralCode();
//     while (
//       await User.findOne({ where: { referralCode: myCode }, transaction: t })
//     ) {
//       myCode = generateReferralCode();
//     }

//     // ✅ ROLE LOGIC (DIRECT):
//     const requestedRole = String(req.body.role || "USER").toUpperCase();
//     const roleToSave = requestedRole === "ADMIN" ? "ADMIN" : "USER";

//     // create user
//     const user = await User.create(
//       { name, email, phone, password, referralCode: myCode, role: roleToSave },
//       { transaction: t }
//     );

//     // create wallet
//    await Wallet.create(
//   {
//     userId: user.id,
//     balance: 0,
//     lockedBalance: 0,
//     totalBalance: 0,
//     totalSpent: 0,
//     isUnlocked: false,
//   },
//   { transaction: t }
// );


//     // create binary node
//     await BinaryNode.create(
//       {
//         userId: user.id,
//         parentId: null,
//         position: null,
//         leftChildId: null,
//         rightChildId: null,
//       },
//       { transaction: t }
//     );

//     // ✅ ADMIN register: no referral logic needed (optional)
//     // If you still want ADMIN to join in tree using referralCode, remove this if-block.
//     if (roleToSave === "ADMIN") {
//       await t.commit();
//       const token = signToken(user.id);
//       return res.json({
//         msg: "Registered",
//         token,
//         user: {
//           id: user.id,
//           name: user.name,
//           role: user.role,
//           email: user.email,
//           phone: user.phone,
//           referralCode: user.referralCode,
//         },
//       });
//     }

//     // ========================= APPLY REFERRAL (SPILLOVER) =========================
//     if (referralCode) {
//       const link = await ReferralLink.findOne({
//         where: { code: referralCode, isActive: true },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//       if (!link) throw new Error("Invalid referral code");

//       const sponsor = await User.findByPk(link.sponsorId, {
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });
//       if (!sponsor) throw new Error("Sponsor not found");

//       const pos = String(link.position || "").toUpperCase();
//       if (!["LEFT", "RIGHT"].includes(pos))
//         throw new Error("Invalid referral position");

//       // direct sponsor
//       user.sponsorId = sponsor.id;
//       await user.save({ transaction: t });

//       await ensureNode(sponsor.id, t);

//       const placedParent = await findPlacementParent({
//         sponsorUserId: sponsor.id,
//         position: pos,
//         t,
//       });

//       const refRow = await Referral.create(
//         {
//           sponsorId: sponsor.id,
//           referredUserId: user.id,
//           position: pos,
//           joinBonusPaid: false,
//         },
//         { transaction: t }
//       );

//       const myNode = await BinaryNode.findOne({
//         where: { userId: user.id },
//         transaction: t,
//         lock: t.LOCK.UPDATE,
//       });

//       myNode.parentId = placedParent.userId;
//       myNode.position = pos;
//       await myNode.save({ transaction: t });

//       if (pos === "LEFT") placedParent.leftChildId = user.id;
//       else placedParent.rightChildId = user.id;
//       await placedParent.save({ transaction: t });

//       // ✅ JOIN BONUS (pending until sponsor + referred unlock)
//       if (!refRow.joinBonusPaid) {
//          const JOIN_BONUS = await getSettingNumber("JOIN_BONUS", t) || 5000;
//         const txn = await creditWallet({
//           userId: sponsor.id,
//           amount: JOIN_BONUS,
//           reason: "REFERRAL_JOIN_BONUS",
//           meta: {
//             referredUserId: user.id,
//             referredName: user.name,
//             placedUnderUserId: placedParent.userId,
//             placedPosition: pos,
//           },
//           t,
//         });

//         if (txn?.meta?.pending !== true) {
//           refRow.joinBonusPaid = true;
//           await refRow.save({ transaction: t });
//         }
//       }

//       // ✅ PAIR BONUS (pending until upline + left + right unlock)
//       await updateUplineCountsAndBonuses({
//         startParentUserId: placedParent.userId,
//         placedPosition: pos,
//         newlyJoinedUserId: user.id,
//         t,
//       });
//     }

//     await t.commit();

//     const token = signToken(user.id);
//     return res.json({
//       msg: "Registered",
//       token,
//       user: {
//         id: user.id,
//         name: user.name,
//         role: user.role,
//         email: user.email,
//         phone: user.phone,
//         referralCode: user.referralCode,
//       },
//     });
//   } catch (err) {
//     await t.rollback();
//     return res.status(400).json({ msg: err.message });
//   }
// });
router.post("/register", (req, res) => {
  uploadProfilePic(req, res, async (err) => {
    console.log("REQ HEADERS =>", req.headers["content-type"]);
    console.log("REQ BODY =>", req.body);
    console.log("REQ FILE =>", req.file);

    const t = await sequelize.transaction();

    try {
      if (err) return res.status(400).json({ msg: err.message });

      const { name, email, phone, password } = req.body;
      const referralCode = req.body.referralCode;

      const userType = req.body.userType;
      const { bankAccountNumber, ifscCode, accountHolderName, panNumber, upiId } = req.body;
      const profilePic = req.file
        ? `/${req.file.path.split("\\").join("/")}`
        : null;


      if (!name || !email || !phone || !password) {
        throw new Error("name,email,phone,password required");
      }

      // prevent duplicates
      const existsEmail = await User.findOne({ where: { email }, transaction: t });
      if (existsEmail) throw new Error("Email already exists");

      const existsPhone = await User.findOne({ where: { phone }, transaction: t });
      if (existsPhone) throw new Error("Phone already exists");

      // unique referralCode
      let myCode = generateReferralCode();
      while (
        await User.findOne({ where: { referralCode: myCode }, transaction: t })
      ) {
        myCode = generateReferralCode();
      }

      // role
      const requestedRole = String(req.body.role || "USER").toUpperCase();
      const roleToSave = requestedRole === "ADMIN" ? "ADMIN" : "USER";

      // create user
      const user = await User.create(
        {
          name,
          email,
          phone,
          password,
          referralCode: myCode,
          role: roleToSave,
          ...(userType ? { userType } : {}),
          ...(profilePic ? { profilePic } : {}),
          ...(bankAccountNumber ? { bankAccountNumber } : {}),
          ...(ifscCode ? { ifscCode } : {}),
          ...(accountHolderName ? { accountHolderName } : {}),
          ...(panNumber ? { panNumber } : {}),
          ...(upiId ? { upiId } : {}),
        },
        { transaction: t }
      );

      // create wallet
      await Wallet.create(
        {
          userId: user.id,
          balance: 0,
          lockedBalance: 0,
          totalBalance: 0,
          totalSpent: 0,
          isUnlocked: false,
        },
        { transaction: t }
      );

      // create binary node
      await BinaryNode.create(
        {
          userId: user.id,
          userPkId: user.userID,
          userType: user.userType || userType || null,
          joiningDate: new Date(),
          parentId: null,
          position: null,
          leftChildId: null,
          rightChildId: null,
        },
        { transaction: t }
      );

      // ADMIN shortcut
      if (roleToSave === "ADMIN") {
        await t.commit();
        const token = signToken(user.id);
        return res.json({
          msg: "Registered",
          token,
          user: {
            id: user.id,

            name: user.name,
            role: user.role,
            email: user.email,

            phone: user.phone,
            referralCode: user.referralCode,
            bankAccountNumber: user.bankAccountNumber,
            ifscCode: user.ifscCode,
            accountHolderName: user.accountHolderName,
            panNumber: user.panNumber,
            upiId: user.upiId,
          },
        });
      }

      // ================= APPLY REFERRAL =================
      if (referralCode) {
        const link = await ReferralLink.findOne({
          where: { code: referralCode, isActive: true },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!link) throw new Error("Invalid referral code");

        const sponsor = await User.findByPk(link.sponsorId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!sponsor) throw new Error("Sponsor not found");

        const pos = String(link.position || "").toUpperCase();
        if (!["LEFT", "RIGHT"].includes(pos))
          throw new Error("Invalid referral position");

        user.sponsorId = sponsor.id;
        await user.save({ transaction: t });

        await ensureNode(sponsor.id, t);

        const placedParent = await findPlacementParent({
          sponsorUserId: sponsor.id,
          position: pos,
          t,
        });

        const refRow = await Referral.create(
          {
            sponsorId: sponsor.id,
            referredUserId: user.id,
            position: pos,
            joinBonusPaid: false,
          },
          { transaction: t }
        );

        const myNode = await BinaryNode.findOne({
          where: { userId: user.id },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        myNode.parentId = placedParent.userId;
        myNode.position = pos;
        await myNode.save({ transaction: t });

        if (pos === "LEFT") placedParent.leftChildId = user.id;
        else placedParent.rightChildId = user.id;
        await placedParent.save({ transaction: t });

        if (!refRow.joinBonusPaid) {
          const JOIN_BONUS = (await getSettingNumber("JOIN_BONUS", t)) || 5000;
          const txn = await creditWallet({
            userId: sponsor.id,
            amount: JOIN_BONUS,
            reason: "REFERRAL_JOIN_BONUS",
            meta: {
              referredUserId: user.id,
              referredName: user.name,
              placedUnderUserId: placedParent.userId,
              placedPosition: pos,
            },
            t,
          });

          if (txn?.meta?.pending !== true) {
            refRow.joinBonusPaid = true;
            await refRow.save({ transaction: t });
          }
        }

        await updateUplineCountsAndBonuses({
          startParentUserId: placedParent.userId,
          placedPosition: pos,
          newlyJoinedUserId: user.id,
          t,
        });
      }

      await t.commit();

      const token = signToken(user.id);
      return res.json({
        msg: "Registered",
        token,
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          userID: user.userID,
          email: user.email,
          phone: user.phone,
          userType: user.userType,
          profilePic: user.profilePic,
          referralCode: user.referralCode,
          bankAccountNumber: user.bankAccountNumber,
          ifscCode: user.ifscCode,
          accountHolderName: user.accountHolderName,
          panNumber: user.panNumber,
          upiId: user.upiId,
        },
      });
    } catch (err) {
      await t.rollback();
      return res.status(400).json({ msg: err.message });
    }
  });
});


// ========================= LOGIN =========================
// router.post("/login", async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     if (!email || !password)
//       return res.status(400).json({ msg: "email,password required" });

//     const user = await User.findOne({ where: { email } });
//     if (!user) return res.status(400).json({ msg: "Invalid credentials" });

//     const ok = await bcrypt.compare(password, user.password);
//     if (!ok) return res.status(400).json({ msg: "Invalid credentials" });

//     const token = signToken(user.id);
//     return res.json({
//       msg: "Logged in",
//       token,
//       user: {
//         id: user.id,
//         name: user.name,
//         role: user.role,
//         email: user.email,
//         phone: user.phone,
//         referralCode: user.referralCode,
//       },
//     });
//   } catch (err) {
//     return res.status(500).json({ msg: err.message });
//   }
// });


// ✅ LOGIN WITH userID OR email
// Body: { login: "BW000123" OR "test@gmail.com", password: "123456" }

// import { Op } from "sequelize"; // ✅ add at top of file once

router.post("/login", async (req, res) => {
  try {
    const { userID, password } = req.body;

    if (!userID || !password) {
      return res.status(400).json({ msg: "userID and password required" });
    }

    const input = String(userID).trim();

    const user = await User.findOne({
      where: {
        [Op.or]: [{ userID: input }, { email: input }],
      },
    });

    if (!user) {
      return res.status(400).json({ msg: "Invalid userIDor password" });
    }

    // const ok = await bcrypt.compare(password, user.password);
    // if (!ok) {
    //   return res.status(400).json({ msg: "Invalid userID or password" });
    // }

    const token = signToken(user.id);

    return res.json({
      msg: "Logged in",
      token,
      user: {
        id: user.id,
        userID: user.userID,
        name: user.name,
        role: user.role,
        email: user.email,
        phone: user.phone,
        userType: user.userType,
        profilePic: user.profilePic,
        referralCode: user.referralCode,
      },
    });
  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
});




export default router;