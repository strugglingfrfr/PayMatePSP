import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;
const wallets = {
  orchestrator: "0xFe534070D02364939e14738e7472327b7d2159c8",
  "risk-agent": "0xa724E1e8bFA7fcA30c1a7E2Ea2047A4Da7aC779d",
  "compliance-agent": "0xDA3d796AeB6e1E1B4d55fb09544B30E036802AE5",
} as const;
const client = createPublicClient({ chain: baseSepolia, transport: http() });
for (const [name, addr] of Object.entries(wallets)) {
  const bal = (await client.readContract({ address: USDC, abi: ABI, functionName: "balanceOf", args: [addr as `0x${string}`] })) as bigint;
  const eth = await client.getBalance({ address: addr as `0x${string}` });
  console.log(`  ${name.padEnd(20)} USDC: ${formatUnits(bal, 6).padEnd(8)} ETH: ${formatUnits(eth, 18)}`);
}
