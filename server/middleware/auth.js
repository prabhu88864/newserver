import jwt from "jsonwebtoken";
import User from "../models/User.js";

export default async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.split(" ")[1] : null;

  if (!token) return res.status(401).json({ msg: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // { id, iat, exp }

    const user = await User.findByPk(decoded.id, {
      attributes: ["id", "role", "email", "name"],
    });

    if (!user) return res.status(401).json({ msg: "User not found" });

    // ✅ now isAdmin can check role
    req.user = {
      id: user.id,
      role: (user.role || "").toUpperCase(),
      email: user.email,
      name: user.name,
    };

    next();
  } catch (err) {
    console.error("auth error:", err?.message || err);
    return res.status(401).json({ msg: "Invalid token" });
  }
}