// Reads the local Solana admin keypair (~/.config/solana/id.json) and
// prints the base58-encoded private key. Used by deploy.sh to set the
// SOLANA_ADMIN_PRIVATE_KEY env var on the Lambda function.
//
// Run with:  bun run infra/encode-admin-key.ts
//
// SECURITY: the output is the admin's secret key. Don't pipe to logs or
// commit. deploy.sh consumes it via process substitution.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import bs58 from "bs58";

const path =
  process.env.SOLANA_KEYPAIR_PATH ?? `${homedir()}/.config/solana/id.json`;
const arr = JSON.parse(readFileSync(path, "utf8")) as number[];
const bytes = Uint8Array.from(arr);
const encoded = bs58.encode(bytes);

// Print to stdout for capture by shell. NO trailing newline beyond what
// `echo` adds via shell capture — single line output only.
process.stdout.write(encoded);
