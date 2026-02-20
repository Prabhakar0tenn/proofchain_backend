const mongoose = require("mongoose");

const CertificateSchema = new mongoose.Schema({
  studentName: {
    type: String,
    required: true,
  },
  course: {
    type: String,
    required: true,
  },
  certificateHash: {
    type: String,
    required: true,
    unique: true,
  },
  txId: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Certificate", CertificateSchema);
