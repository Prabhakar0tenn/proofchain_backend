require("dotenv").config();

const express = require("express");
const cors = require("cors");
const algosdk = require("algosdk");
const mongoose = require("mongoose");
const generateHash = require("./utils/hash");
const Certificate = require("./models/Certificate");

console.log("🚀 Server starting...");

const app = express();

// CORS configuration
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

// Add logging for requests
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// ----------------------------
// ENV CHECK
// ----------------------------
if (!process.env.MNEMONIC || !process.env.MONGO_URI) {
  console.log("❌ Missing environment variables");
  process.exit(1);
}

console.log("✅ ENV Loaded");

// ----------------------------
// MongoDB Connection
// ----------------------------
let mongoConnected = false;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    mongoConnected = true;
    console.log("✅ MongoDB Connected");
  })
  .catch(err => {
    console.log("❌ MongoDB Error:", err.message);
    process.exit(1);
  });

// ----------------------------
// ALGOD CLIENT
// ----------------------------
const algodClient = new algosdk.Algodv2(
  "",
  "https://testnet-api.algonode.cloud",
  ""
);

// ----------------------------
// CREATOR ACCOUNT
// ----------------------------
let creatorAccount;

try {
  creatorAccount = algosdk.mnemonicToSecretKey(process.env.MNEMONIC);
  console.log("✅ Creator Address:");
  console.log(creatorAccount.addr.toString());
} catch (err) {
  console.log("❌ Failed to decode mnemonic");
  process.exit(1);
}

// ----------------------------
// MINT + STORE ROUTE
// ----------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mongoConnected: mongoConnected,
    creator: creatorAccount?.addr || "not initialized"
  });
});

app.post("/mint", async (req, res) => {
  try {
    const { studentName, course } = req.body;

    if (!studentName || !course) {
      return res.status(400).json({
        success: false,
        message: "Student name and course required"
      });
    }

    console.log("🔥 Mint request received");

    // Generate Hash
    const certificateHash = generateHash(studentName, course);

    // Get blockchain params
    let params;
    try {
      params = await algodClient.getTransactionParams().do();
      console.log("✅ Got blockchain params");
    } catch (algErr) {
      console.log("❌ Algo API Error:", algErr.message);
      return res.status(503).json({
        success: false,
        error: "Unable to connect to Algorand testnet: " + algErr.message
      });
    }

    const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
      sender: creatorAccount.addr,
      total: 1,
      decimals: 0,
      assetName: "ProofChain Certificate",
      unitName: "CERT",
      assetURL: `https://proofchain.app/cert/${certificateHash}`,
      suggestedParams: params,
    });

    const signedTxn = txn.signTxn(creatorAccount.sk);

    const sendTx = await algodClient
      .sendRawTransaction(signedTxn)
      .do();

    console.log("Raw TX Response:", sendTx);

    const txId = sendTx.txId || sendTx.txid;

    if (!txId) {
      throw new Error("Transaction broadcast failed");
    }

    console.log("✅ TX SENT:", txId);

    // Save to MongoDB safely
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: "MongoDB not connected"
      });
    }

    try {
      const newCertificate = await Certificate.create({
        studentName,
        course,
        certificateHash,
        txId: txId
      });
      console.log("✅ Saved to DB:", newCertificate._id);
    } catch (dbErr) {
      console.log("❌ Database save error:", dbErr.message);
      return res.status(500).json({
        success: false,
        error: "Failed to save certificate: " + dbErr.message
      });
    }

    res.json({
      success: true,
      txId,
      certificateHash
    });
  } catch (err) {
    console.log("❌ ERROR:", err.message);
    console.log("Stack:", err.stack);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ----------------------------
// VERIFY ROUTE
// ----------------------------
app.get("/verify/:hash", async (req, res) => {
  try {
    const cert = await Certificate.findOne({
      certificateHash: req.params.hash
    });

    if (!cert) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found"
      });
    }

    res.json({
      success: true,
      certificate: cert
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ----------------------------
// PORT FIX FOR RENDER
// ----------------------------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
