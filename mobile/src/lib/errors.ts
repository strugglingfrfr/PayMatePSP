// Friendly error message normalization. MWA / Solana RPC errors come back
// with long Java stack traces and protocol noise that look unprofessional
// to end users. Map them to short, human messages.

export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  // User cancelled in wallet
  if (lower.includes("user rejected") || lower.includes("user declined") || lower.includes("cancelled")) {
    return "You cancelled the transaction in the wallet.";
  }
  // Wallet simulation failed → most common cause is on-chain state mismatch
  if (lower.includes("simulation failed") || lower.includes("simulation error")) {
    return "The transaction couldn't be simulated. Check the wallet has enough SOL for fees and USDC for the amount, then try again.";
  }
  // Wallet timeout / connection lost
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "The wallet took too long to respond. Try again.";
  }
  // No wallet found / MWA not available
  if (lower.includes("no wallet") || lower.includes("mwa") || lower.includes("mobile wallet adapter")) {
    return "No compatible wallet found. Install Phantom or Solflare from the Play Store.";
  }
  // RPC errors (Solana node)
  if (lower.includes("rpc") || lower.includes("0x")) {
    return "Network error talking to Solana. Try again in a moment.";
  }
  // Insufficient funds — common with imported wallets
  if (lower.includes("insufficient")) {
    return "Insufficient balance to cover the transaction.";
  }
  // Trim anything still long (raw stack traces, JSON dumps)
  if (raw.length > 160) {
    return raw.slice(0, 160).replace(/[\n\r]+/g, " ").trim() + "…";
  }
  return raw;
}
