// Loaded by Metro as a polyfill BEFORE any user module. Sets globalThis.Buffer
// so transitive deps (@solana/spl-token-metadata etc.) can use it at module init.
//
// Plain JS (not TS) because Metro polyfills are concatenated into the bundle
// raw, before any TS transform pipeline. Keep this file dependency-free.

(function setupBuffer() {
  if (typeof globalThis.Buffer !== "undefined") return;

  // Try the Node-style buffer package (bundled in for RN web).
  try {
    var BufferImpl = require("buffer").Buffer;
    globalThis.Buffer = BufferImpl;
  } catch (e) {
    // ignore — fallback to whatever's available
  }
})();

if (typeof globalThis.process === "undefined") {
  globalThis.process = { env: {} };
}
