// Polyfills MUST be loaded before any Solana / Anchor code.
// JS evaluates imports depth-first, so importing this file FIRST in
// _layout.tsx guarantees Buffer is on globalThis before transitive
// imports (e.g. @solana/spl-token-metadata) try to use it at module init.

import { Buffer } from "buffer";

// @ts-ignore — assigning Buffer to globalThis is intentional
if (typeof (globalThis as any).Buffer === "undefined") {
  (globalThis as any).Buffer = Buffer;
}

// Some transitive deps (web3.js v2 codecs) check for `process.env`.
// Stub it out for web/RN where it's missing.
if (typeof (globalThis as any).process === "undefined") {
  (globalThis as any).process = { env: {} };
}
