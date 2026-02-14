// import express from "express";
// import auth from "../middleware/auth.js";
// import User from "../models/User.js";
// import BinaryNode from "../models/BinaryNode.js";
// import isAdmin from "../middleware/isAdmin.js";
// import { Op } from "sequelize";


// const router = express.Router();

// /**
//  * ✅ Ensures BinaryNode row exists for any user
//  * Also keeps snapshot fields in sync (userPkId + userType)
//  */

// async function collectSubtreeUserIds(startUserId) {
//   if (!startUserId) return [];

//   const out = [];
//   const queue = [startUserId];
//   const visited = new Set();

//   while (queue.length) {
//     const userId = queue.shift();
//     if (!userId || visited.has(userId)) continue;

//     visited.add(userId);
//     out.push(userId);

//     const node = await BinaryNode.findOne({
//       where: { userId },
//       attributes: ["leftChildId", "rightChildId"],
//     });

//     if (node?.leftChildId) queue.push(node.leftChildId);
//     if (node?.rightChildId) queue.push(node.rightChildId);
//   }

//   return out;
// }

// // Count by userType based on Users table values (latest)
// function countByUserType(users) {
//   const stats = {
//     TOTAL: 0,
//     ENTREPRENEUR: 0,
//     TRAINEE_ENTREPRENEUR: 0,
//     OTHER: 0,
//   };

//   for (const u of users) {
//     stats.TOTAL += 1;
//     const t = String(u?.userType || "").toUpperCase();

//     if (t === "ENTREPRENEUR") stats.ENTREPRENEUR += 1;
//     else if (t === "TRAINEE_ENTREPRENEUR") stats.TRAINEE_ENTREPRENEUR += 1;
//     else stats.OTHER += 1;
//   }

//   return stats;
// }
// async function ensureNode(userId, t = null) {
//   if (!userId) return null;

//   const opts = t ? { transaction: t } : {};

//   // fetch latest user (source of truth)
//   const u = await User.findByPk(userId, {
//     attributes: ["id", "userID", "userType", "createdAt"],
//     ...opts,
//   });

//   // if user not found, still avoid crash
//   const latestUserPkId = u?.userID || String(userId);
//   const latestUserType = u?.userType || null;
//   const latestJoining = u?.createdAt || new Date();

//   let node = await BinaryNode.findOne({ where: { userId }, ...opts });

//   if (!node) {
//     node = await BinaryNode.create(
//       {
//         userId,
//         // ✅ snapshot
//         userPkId: latestUserPkId,
//         userType: latestUserType,
//         joiningDate: latestJoining,

//         parentId: null,
//         position: null,
//         leftChildId: null,
//         rightChildId: null,
//         // queues default values handled by model
//       },
//       opts
//     );
//     return node;
//   }

//   // ✅ Sync snapshot when user changes (your main issue)
//   const needUpdate =
//     String(node.userPkId || "") !== String(latestUserPkId) ||
//     String(node.userType || "") !== String(latestUserType || "");

//   if (needUpdate) {
//     await node.update(
//       {
//         userPkId: latestUserPkId,
//         userType: latestUserType,
//         // joiningDate usually should not change once set, so we keep it as is
//       },
//       opts
//     );
//   }

//   return node;
// }

// /**
//  * ✅ Build tree using numeric IDs internally
//  * returns numeric id + userID + name + referralCode + userType + joiningDate
//  */
// async function buildTree(rootUserId, depth) {
//   const maxDepth = Math.max(1, Math.min(Number(depth || 4), 10));

//   // ensure root exists
//   await ensureNode(rootUserId);

//   const map = new Map(); // userId -> { node, user }
//   const levelMap = new Map(); // userId -> level
//   let frontier = [rootUserId];
//   levelMap.set(rootUserId, 0);

//   for (let lvl = 0; lvl <= maxDepth; lvl++) {
//     if (!frontier.length) break;

//     // ✅ make sure all nodes exist for this frontier (important for old users)
//     for (const uid of frontier) {
//       await ensureNode(uid);
//     }

//     // ✅ BinaryNode rows for this frontier
//     const nodes = await BinaryNode.findAll({
//       where: { userId: frontier },
//       attributes: [
//         "userId",
//         "userPkId",
//         "userType",
//         "joiningDate",
//         "leftChildId",
//         "rightChildId",
//         "parentId",
//         "position",
//       ],
//     });

//     const ids = nodes.map((n) => n.userId);

//     // ✅ User rows for this frontier (latest userType comes from Users table)
//     const users = await User.findAll({
//       where: { id: ids },
//       attributes: ["id", "userID", "name", "referralCode", "userType", "createdAt"],
//     });

//     const uMap = new Map(users.map((u) => [u.id, u]));

//     for (const n of nodes) {
//       map.set(n.userId, { node: n, user: uMap.get(n.userId) });
//     }

//     // next frontier (children)
//     const next = [];
//     for (const n of nodes) {
//       const curLevel = levelMap.get(n.userId) ?? lvl;
//       if (curLevel >= maxDepth) continue;

//       if (n.leftChildId && !levelMap.has(n.leftChildId)) {
//         levelMap.set(n.leftChildId, curLevel + 1);
//         next.push(n.leftChildId);
//       }
//       if (n.rightChildId && !levelMap.has(n.rightChildId)) {
//         levelMap.set(n.rightChildId, curLevel + 1);
//         next.push(n.rightChildId);
//       }
//     }

//     // ✅ ensure children nodes exist (so leftUserID/rightUserID works)
//     for (const childId of next) {
//       await ensureNode(childId);
//     }

//     frontier = next;
//   }

//   const toJson = (userId, curDepth) => {
//     const entry = map.get(userId);

//     if (!entry) {
//       // fallback if something missing
//       return {
//         id: userId,
//         userID: null,
//         userPkId: null,
//         name: "—",
//         referralCode: null,
//         userType: null,
//         joiningDate: null,

//         leftId: null,
//         rightId: null,
//         leftUserID: null,
//         rightUserID: null,

//         missing: true,
//         left: null,
//         right: null,
//       };
//     }

//     const u = entry.user; // latest from Users table
//     const n = entry.node; // snapshot from BinaryNodes

//     const leftEntry = n.leftChildId ? map.get(n.leftChildId) : null;
//     const rightEntry = n.rightChildId ? map.get(n.rightChildId) : null;

//     const out = {
//       // ✅ numeric DB id
//       id: u?.id ?? userId,

//       // ✅ SUN id (from Users)
//       userID: u?.userID ?? null,

//       // ✅ snapshot
//       userPkId: n.userPkId ?? u?.userID ?? null,

//       name: u?.name ?? "—",
//       referralCode: u?.referralCode ?? null,

//       // ✅ IMPORTANT: always show latest userType from Users table
//       userType: u?.userType ?? n.userType ?? null,

//       // joining date: prefer snapshot, else Users.createdAt
//       joiningDate: n.joiningDate ?? u?.createdAt ?? null,

//       // children numeric ids
//       leftId: n.leftChildId ?? null,
//       rightId: n.rightChildId ?? null,

//       // children SUN ids
//       leftUserID: leftEntry?.user?.userID ?? null,
//       rightUserID: rightEntry?.user?.userID ?? null,

//       left: null,
//       right: null,
//     };

//     if (curDepth >= maxDepth) return out;

//     out.left = n.leftChildId ? toJson(n.leftChildId, curDepth + 1) : null;
//     out.right = n.rightChildId ? toJson(n.rightChildId, curDepth + 1) : null;

//     return out;
//   };

//   return toJson(rootUserId, 0);
// }

// /**
//  * ✅ GET /api/binary/tree?depth=4
//  */
// router.get("/tree", auth, async (req, res) => {
//   try {
//     const depth = Number(req.query.depth || 4);
//     const rootUserId = req.user.id;

//     const tree = await buildTree(rootUserId, depth);

//     return res.json({
//       rootUserId,
//       depth: Math.max(1, Math.min(depth, 10)),
//       tree,
//     });
//   } catch (err) {
//     console.error("BINARY TREE ERROR =>", err);
//     return res.status(500).json({ msg: err.message });
//   }
// });
// router.get("/stats", auth, async (req, res) => {
//   try {
//     const rootUserId = req.user.id;

//     const rootNode = await BinaryNode.findOne({
//       where: { userId: rootUserId },
//       attributes: ["userId", "leftChildId", "rightChildId"],
//     });
//     if (!rootNode) return res.status(404).json({ msg: "Binary tree not initialized" });

//     // collect left/right subtree userIds
//     const [leftUserIds, rightUserIds] = await Promise.all([
//       collectSubtreeUserIds(rootNode.leftChildId),
//       collectSubtreeUserIds(rootNode.rightChildId),
//     ]);

//     const leftSet = Array.from(new Set(leftUserIds));
//     const rightSet = Array.from(new Set(rightUserIds));

//     // overall unique to avoid double count (just in case)
//     const overallSet = Array.from(new Set([...leftSet, ...rightSet]));

//     // fetch users (latest userType)
//     const users = await User.findAll({
//       where: { id: overallSet },
//       attributes: ["id", "userID", "userType", "name"],
//     });

//     const uMap = new Map(users.map((u) => [u.id, u]));

//     const leftUsers = leftSet.map((id) => uMap.get(id)).filter(Boolean);
//     const rightUsers = rightSet.map((id) => uMap.get(id)).filter(Boolean);
//     const overallUsers = overallSet.map((id) => uMap.get(id)).filter(Boolean);

//     return res.json({
//       rootUserId,
//       left: countByUserType(leftUsers),
//       right: countByUserType(rightUsers),
//       overall: countByUserType(overallUsers),

//       // optional: show ids count
//       meta: {
//         leftCount: leftUsers.length,
//         rightCount: rightUsers.length,
//         overallCount: overallUsers.length,
//       },
//     });
//   } catch (err) {
//     console.error("TREE STATS ERROR =>", err);
//     return res.status(500).json({ msg: "Failed to get stats", err: err.message });
//   }
// });

// export default router;
// routes/binary.js
import express from "express";
import auth from "../middleware/auth.js";
import isAdmin from "../middleware/isAdmin.js";
import { Op } from "sequelize";

import User from "../models/User.js";
import BinaryNode from "../models/BinaryNode.js";

const router = express.Router();

/* ========================= HELPERS ========================= */

// ✅ Ensures BinaryNode exists AND keeps snapshot fields in sync (userPkId + userType)
async function ensureNode(userId, t = null) {
  if (!userId) return null;

  const opts = t ? { transaction: t } : {};

  // latest user snapshot
  const u = await User.findByPk(userId, {
    attributes: ["id", "userID", "userType", "createdAt"],
    ...opts,
  });

  const latestUserPkId = u?.userID || String(userId);
  const latestUserType = u?.userType || null;
  const latestJoining = u?.createdAt || new Date();

  let node = await BinaryNode.findOne({ where: { userId }, ...opts });

  if (!node) {
    node = await BinaryNode.create(
      {
        userId,
        userPkId: latestUserPkId,
        userType: latestUserType,
        joiningDate: latestJoining,

        parentId: null,
        position: null,
        leftChildId: null,
        rightChildId: null,
      },
      opts
    );
    return node;
  }

  const needUpdate =
    String(node.userPkId || "") !== String(latestUserPkId) ||
    String(node.userType || "") !== String(latestUserType || "");

  if (needUpdate) {
    await node.update(
      {
        userPkId: latestUserPkId,
        userType: latestUserType,
        // joiningDate usually fixed; keep as is
      },
      opts
    );
  }

  return node;
}

// ✅ Full subtree BFS (NO depth)
async function buildTree(rootUserId) {
  await ensureNode(rootUserId);

  const map = new Map(); // userId -> { node, user }
  const visited = new Set();
  const queue = [rootUserId];

  while (queue.length) {
    const uid = queue.shift();
    if (!uid || visited.has(uid)) continue;
    visited.add(uid);

    await ensureNode(uid);

    const node = await BinaryNode.findOne({
      where: { userId: uid },
      attributes: [
        "userId",
        "userPkId",
        "userType",
        "joiningDate",
        "leftChildId",
        "rightChildId",
        "parentId",
        "position",
      ],
    });
    if (!node) continue;

    const user = await User.findByPk(uid, {
      attributes: ["id", "userID", "name", "referralCode", "userType", "createdAt"],
    });

    map.set(uid, { node, user });

    if (node.leftChildId) queue.push(node.leftChildId);
    if (node.rightChildId) queue.push(node.rightChildId);
  }

  const toJson = (userId) => {
    const entry = map.get(userId);

    if (!entry) {
      return {
        id: userId,
        userID: null,
        userPkId: null,
        name: "—",
        referralCode: null,
        userType: null,
        joiningDate: null,

        leftId: null,
        rightId: null,
        leftUserID: null,
        rightUserID: null,

        missing: true,
        left: null,
        right: null,
      };
    }

    const u = entry.user;
    const n = entry.node;

    const leftEntry = n.leftChildId ? map.get(n.leftChildId) : null;
    const rightEntry = n.rightChildId ? map.get(n.rightChildId) : null;

    return {
      id: u?.id ?? userId,
      userID: u?.userID ?? null,
      userPkId: n.userPkId ?? u?.userID ?? null,

      name: u?.name ?? "—",
      referralCode: u?.referralCode ?? null,

      // ✅ always latest from Users
      userType: u?.userType ?? n.userType ?? null,
      joiningDate: n.joiningDate ?? u?.createdAt ?? null,

      leftId: n.leftChildId ?? null,
      rightId: n.rightChildId ?? null,

      leftUserID: leftEntry?.user?.userID ?? null,
      rightUserID: rightEntry?.user?.userID ?? null,

      left: n.leftChildId ? toJson(n.leftChildId) : null,
      right: n.rightChildId ? toJson(n.rightChildId) : null,
    };
  };

  return toJson(rootUserId);
}

// ✅ Collect subtree ids (for stats)
async function collectSubtreeUserIds(startUserId) {
  if (!startUserId) return [];

  const out = [];
  const queue = [startUserId];
  const visited = new Set();

  while (queue.length) {
    const userId = queue.shift();
    if (!userId || visited.has(userId)) continue;

    visited.add(userId);
    out.push(userId);

    const node = await BinaryNode.findOne({
      where: { userId },
      attributes: ["leftChildId", "rightChildId"],
    });

    if (node?.leftChildId) queue.push(node.leftChildId);
    if (node?.rightChildId) queue.push(node.rightChildId);
  }

  return out;
}

// ✅ Count by userType
function countByUserType(users) {
  const stats = {
    TOTAL: 0,
    ENTREPRENEUR: 0,
    TRAINEE_ENTREPRENEUR: 0,
    OTHER: 0,
  };

  for (const u of users) {
    stats.TOTAL += 1;
    const t = String(u?.userType || "").toUpperCase();

    if (t === "ENTREPRENEUR") stats.ENTREPRENEUR += 1;
    else if (t === "TRAINEE_ENTREPRENEUR") stats.TRAINEE_ENTREPRENEUR += 1;
    else stats.OTHER += 1;
  }

  return stats;
}

/* ========================= ROUTES ========================= */

/**
 * ✅ USER: GET MY FULL TREE (NO depth)
 * GET /api/binary/tree
 */
router.get("/tree", auth, async (req, res) => {
  try {
    const rootUserId = req.user.id;
    const tree = await buildTree(rootUserId);
    return res.json({ rootUserId, tree });
  } catch (err) {
    console.error("BINARY TREE ERROR =>", err);
    return res.status(500).json({ msg: err.message });
  }
});

/**
 * ✅ USER: LEFT/RIGHT/OVERALL STATS (counts by userType)
 * GET /api/binary/stats
 */
router.get("/stats", auth, async (req, res) => {
  try {
    const rootUserId = req.user.id;

    const rootNode = await BinaryNode.findOne({
      where: { userId: rootUserId },
      attributes: ["userId", "leftChildId", "rightChildId"],
    });

    if (!rootNode) return res.status(404).json({ msg: "Binary tree not initialized" });

    const [leftUserIds, rightUserIds] = await Promise.all([
      collectSubtreeUserIds(rootNode.leftChildId),
      collectSubtreeUserIds(rootNode.rightChildId),
    ]);

    const leftSet = Array.from(new Set(leftUserIds));
    const rightSet = Array.from(new Set(rightUserIds));
    const overallSet = Array.from(new Set([...leftSet, ...rightSet]));

    const users = await User.findAll({
      where: { id: overallSet },
      attributes: ["id", "userID", "userType", "name"],
    });

    const uMap = new Map(users.map((u) => [u.id, u]));
    const leftUsers = leftSet.map((id) => uMap.get(id)).filter(Boolean);
    const rightUsers = rightSet.map((id) => uMap.get(id)).filter(Boolean);
    const overallUsers = overallSet.map((id) => uMap.get(id)).filter(Boolean);

    return res.json({
      rootUserId,
      left: countByUserType(leftUsers),
      right: countByUserType(rightUsers),
      overall: countByUserType(overallUsers),
      meta: {
        leftCount: leftUsers.length,
        rightCount: rightUsers.length,
        overallCount: overallUsers.length,
      },
    });
  } catch (err) {
    console.error("TREE STATS ERROR =>", err);
    return res.status(500).json({ msg: "Failed to get stats", err: err.message });
  }
});

/**
 * ✅ ADMIN: GET USER FULL TREE by userID / name / numericId (NO depth)
 * GET /api/binary/admin/tree?q=SUN000005
 * GET /api/binary/admin/tree?q=prabhu
 * GET /api/binary/admin/tree?q=5
 */
router.get("/admin/tree", auth,  async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ msg: "q is required (userID/name/id)" });

    let user = null;

    // 1) numeric id
    if (/^\d+$/.test(q)) {
      user = await User.findByPk(Number(q), {
        attributes: ["id", "userID", "name", "email", "phone", "userType"],
      });
    }

    // 2) userID exact
    if (!user) {
      user = await User.findOne({
        where: { userID: q },
        attributes: ["id", "userID", "name", "email", "phone", "userType"],
      });
    }

    // 3) name LIKE (latest)
    if (!user) {
      user = await User.findOne({
        where: { name: { [Op.like]: `%${q}%` } },
        order: [["id", "DESC"]],
        attributes: ["id", "userID", "name", "email", "phone", "userType"],
      });
    }

    if (!user) return res.status(404).json({ msg: "User not found" });

    const tree = await buildTree(user.id);

    return res.json({
      searched: q,
      targetUser: {
        id: user.id,
        userID: user.userID,
        name: user.name,
        phone: user.phone,
        email: user.email,
        userType: user.userType,
      },
      tree,
    });
  } catch (err) {
    console.error("ADMIN TREE ERROR =>", err);
    return res.status(500).json({ msg: err.message });
  }
});

export default router;



