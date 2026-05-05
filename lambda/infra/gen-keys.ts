// Generate three fresh Base Sepolia keypairs — one per agent identity.
//
// Output goes to lambda/.secrets/agent-keys.json (gitignored).
// Public addresses are printed so the user can faucet ETH + USDC to each.
//
// Run with:  bun run infra/gen-keys.ts

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

type Identity = "orchestrator" | "risk-agent" | "compliance-agent";
const identities: Identity[] = ["orchestrator", "risk-agent", "compliance-agent"];

const secretsDir = join(import.meta.dir, "..", ".secrets");
const outFile = join(secretsDir, "agent-keys.json");

if (existsSync(outFile)) {
  console.error(
    `\n  ⚠  ${outFile} already exists. Refusing to overwrite — that would burn funded wallets.`,
  );
  console.error(`  → Delete the file manually if you really want fresh keys.\n`);
  process.exit(1);
}

mkdirSync(secretsDir, { recursive: true });

const out: Record<Identity, { address: string; privateKey: string }> = {} as never;

for (const id of identities) {
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  out[id] = { address: account.address, privateKey: pk };
}

writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log("\n  ✓ Wrote", outFile);
console.log("\n  Public addresses (fund these on Base Sepolia):\n");
for (const id of identities) {
  console.log(`    ${id.padEnd(20)} ${out[id].address}`);
}
console.log("\n  Faucets:");
console.log(`    ETH (gas): https://www.alchemy.com/faucets/base-sepolia`);
console.log(`    USDC:      https://faucet.circle.com  (pick Base Sepolia)\n`);
