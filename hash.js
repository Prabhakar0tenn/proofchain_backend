const crypto = require("crypto");

function generateHash(studentName, course) {
  const data = `${studentName}-${course}-${Date.now()}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

module.exports = generateHash;
