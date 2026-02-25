

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
import { createDefaultReferralLinks } from "./referrals.js";

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

      // ✅ AUTO GENERATE BOTH LINKS FOR EVERY USER
      await createDefaultReferralLinks(user.id, t);

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