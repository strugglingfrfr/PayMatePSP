// One-shot demo seeder: submits a KYB application via the live API and
// stops BEFORE admin approval. Result: a PSP that sits in the admin queue
// with a real Bedrock score, waiting for the "Approve" button to be tapped
// live on stage.

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const API = "https://wdex0emoga.execute-api.us-east-1.amazonaws.com";

const psp = Keypair.generate();
const walletAddress = psp.publicKey.toBase58();
const secretBase58 = bs58.encode(psp.secretKey);
console.log("\n  fresh PSP:", walletAddress);
console.log("  secret  :", secretBase58, "\n");

// Solid mid-tier PSP — should score A or AA so it's clearly approvable
// but not so trivial that the AI looks rubber-stamp.
const kybData = {
  companyName: "Lagos Remit Co",
  jurisdiction: "NG",
  dateOfIncorporation: "2021-06-22",
  yearsInOperation: 5,
  businessType: "RSP" as const,
  monthlyTransactionVolume: 1_800_000,
  primaryCorridor: "NG-GB",
  settlementPartners: "Access Bank, Wise",
  settlementCycle: "T+1" as const,
  annualRevenue: 8_400_000,
  netIncome: 1_200_000,
  totalEquity: 3_100_000,
  debtRatio: 0.41,
  amlPolicyInPlace: true,
  sanctionsScreeningProvider: "Refinitiv World-Check",
  lastRegulatoryAuditDate: "2025-08-15",
};

console.log("  → submitting KYB…");
const submit = await fetch(`${API}/kyb/submit`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ walletAddress, kybData }),
});
const submitJson = await submit.json();
if (!submitJson.ok) {
  console.error("  submit failed:", submitJson);
  process.exit(1);
}
console.log(
  `  ✓ KYR ${submitJson.data.kyrScore?.rating} ${submitJson.data.kyrScore?.totalScore}/100`,
);

console.log("\n=== PENDING PSP READY (awaiting admin approval) ===");
console.log("  wallet :", walletAddress);
console.log("  secret :", secretBase58);
console.log("  rating :", submitJson.data.kyrScore?.rating);
console.log("  status : scored — awaiting admin approval");
console.log("\n  In admin role: this will appear with an 'Approve' button.");
console.log("  Tap it live on stage to trigger set_credit_limit on-chain.\n");
