(async () => {
  await import("./server/server.js");
})().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
