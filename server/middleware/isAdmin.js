export default function isAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN" && req.user?.role !== "MASTER") {
    return res.status(403).json({ msg: "Admin only" });
  }
  next();
}