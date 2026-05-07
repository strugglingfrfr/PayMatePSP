// One-off USDC redistribution helper. Used after a faucet-misroute.
// Sends USDC from compliance-agent → orchestrator + risk-agent on Base Sepolia.
//
// Run with:  bun run infra/transfer-usdc.ts

import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  encodeFunctionData,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Circle's official USDC on Base Sepolia. 6 decimals.
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

const ERC20_TRANSFER = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type Keys = {
  orchestrator: { address: `0x${string}`; privateKey: `0x${string}` };
  "risk-agent": { address: `0x${string}`; privateKey: `0x${string}` };
  "compliance-agent": { address: `0x${string}`; privateKey: `0x${string}` };
};

const keys = JSON.parse(
  readFileSync(join(import.meta.dir, "..", ".secrets", "agent-keys.json"), "utf8"),
) as Keys;

const sender = privateKeyToAccount(keys["compliance-agent"].privateKey);

const wallet = createWalletClient({
  account: sender,
  chain: baseSepolia,
  transport: http(),
});
const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

const startBal = (await publicClient.readContract({
  address: USDC_BASE_SEPOLIA,
  abi: ERC20_TRANSFER,
  functionName: "balanceOf",
  args: [sender.address],
})) as bigint;

console.log(`\n  compliance-agent balance: ${formatUnits(startBal, 6)} USDC`);

if (startBal < parseUnits("9", 6)) {
  console.error(`  ❌ need at least 9 USDC to redistribute, found ${formatUnits(startBal, 6)}`);
  process.exit(1);
}

const sends: Array<[string, `0x${string}`, bigint]> = [
  ["orchestrator", keys.orchestrator.address, parseUnits("5", 6)],
  ["risk-agent", keys["risk-agent"].address, parseUnits("4", 6)],
];

for (const [label, to, amount] of sends) {
  console.log(`\n  → sending ${formatUnits(amount, 6)} USDC to ${label} (${to})`);
  const hash = await wallet.sendTransaction({
    to: USDC_BASE_SEPOLIA,
    data: encodeFunctionData({
      abi: ERC20_TRANSFER,
      functionName: "transfer",
      args: [to, amount],
    }),
  });
  console.log(`    tx: https://sepolia.basescan.org/tx/${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`    ✓ confirmed`);
}

const finalBal = (await publicClient.readContract({
  address: USDC_BASE_SEPOLIA,
  abi: ERC20_TRANSFER,
  functionName: "balanceOf",
  args: [sender.address],
})) as bigint;

console.log(
  `\n  Final balances:`,
  `\n    compliance-agent: ${formatUnits(finalBal, 6)} USDC (kept as buffer)`,
);
for (const [label, addr] of [
  ["orchestrator", keys.orchestrator.address],
  ["risk-agent", keys["risk-agent"].address],
]) {
  const bal = (await publicClient.readContract({
    address: USDC_BASE_SEPOLIA,
    abi: ERC20_TRANSFER,
    functionName: "balanceOf",
    args: [addr as `0x${string}`],
  })) as bigint;
  console.log(`    ${label.padEnd(16)}: ${formatUnits(bal, 6)} USDC`);
}
console.log("");
