const db = require("./db");


const os = require("os");

function getIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && iface.address !== "127.0.0.1" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

const closeLiveStream = async (streamId) => {
  await db.query(
    "UPDATE live_streams SET is_live = ?, ended_at = NOW() WHERE id = ?",
    [false, streamId]
  );
}
module.exports = {
  getIPAddress,
  closeLiveStream,
};