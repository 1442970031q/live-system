const db = require("./db");


//获取本机ip地址
function getIPAdress() {
  var interfaces = require('os').networkInterfaces();
  for (var devName in interfaces) {
    var iface = interfaces[devName];
    for (var i = 0; i < iface.length; i++) {
      var alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
}

const closeLiveStream = async (streamId) => {
  await db.query(
    "UPDATE live_streams SET is_live = ?, ended_at = NOW() WHERE id = ?",
    [false, streamId]
  );
}
module.exports = {
    getIPAdress,
    closeLiveStream
}