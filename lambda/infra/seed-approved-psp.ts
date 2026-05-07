// One-shot demo seeder: generates a fresh PSP wallet, submits a clean KYB
// application via the live API, then admin-approves it. Result: a wallet
// that shows up in the admin queue as Approved with on-chain credit limit
// already set. Useful for "I want to demo a finished PSP" scenarios.

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const API = "https://wdex0emoga.execute-api.us-east-1.amazonaws.com";

const psp = Keypair.generate();
const walletAddress = psp.publicKey.toBase58();
const secretBase58 = bs58.encode(psp.secretKey);
console.log("\n  fresh PSP:", walletAddress);
console.log("  secret  :", secretBase58, "\n");

// Clean GB PSP — should score AAA.
const kybData = {
  companyName: "Mercury Settlements Ltd",
  jurisdiction: "GB",
  dateOfIncorporation: "2019-03-12",
  yearsInOperation: 7,
  businessType: "PSP" as const,
  monthlyTransactionVolume: 4_500_000,
  primaryCorridor: "GB-NG",
  settlementPartners: "Barclays, Stanbic IBTC",
  settlementCycle: "T+1" as const,
  annualRevenue: 22_000_000,
  netIncome: 4_100_000,
  totalEquity: 9_800_000,
  debtRatio: 0.28,
  amlPolicyInPlace: true,
  sanctionsScreeningProvider: "ComplyAdvantage",
  lastRegulatoryAuditDate: "2025-11-08",
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

console.log("  → admin approving…");
const approve = await fetch(`${API}/admin/approve`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ walletAddress }),
});
const approveJson = await approve.json();
if (!approveJson.ok) {
  console.error("  approve failed:", approveJson);
  process.exit(1);
}
console.log(
  `  ✓ approved — credit limit ${approveJson.data.creditLimit / 1e6} USDC, rate ${approveJson.data.personalRateBps} bps/day`,
);
console.log(
  `  ✓ on-chain tx: https://solscan.io/tx/${approveJson.data.txSignature}?cluster=devnet\n`,
);

console.log("=== DEMO PSP READY ===");
console.log("  wallet :", walletAddress);
console.log("  secret :", secretBase58);
console.log("  status : approved\n");
