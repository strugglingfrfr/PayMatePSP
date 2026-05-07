// Wallet context — wraps Solana Mobile Wallet Adapter.
//
// On Android (Seeker) MWA opens the user's wallet (Phantom / Solflare / etc).
// In Expo Go and on iOS, MWA is unavailable — we expose a `connectMock(pubkey)`
// path so dev work isn't blocked. The mock signs nothing; only used for UI work.
//
// Critical detail: MWA's `transact()` opens a fresh session every time. To
// avoid making the user re-approve their wallet on every signing, we capture
// the `auth_token` returned from the initial `authorize()` call and pass it
// to `reauthorize()` on subsequent transact sessions. This is what makes
// signing feel like "just sign", not "connect again then sign".

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

// Identity must match between authorize and reauthorize. MWA validates the
// token against the dapp identity that minted it. Keep this constant.
export const DAPP_IDENTITY = {
  name: "PayMate",
  uri: "https://github.com/strugglingfrfr/PayMatePSP",
};

const STATE_KEY = "paymate.wallet";
const TOKEN_KEY = "paymate.authToken";

// Module-level setter exposed for non-React modules (onchain.ts) that
// need to read the current auth_token. Reading from AsyncStorage works
// too but adds an unavoidable async hop inside transact() callbacks.
let _authToken: string | null = null;
export const getAuthToken = () => _authToken;

type WalletState = {
  publicKey: string | null;
  isMock: boolean;
};

type Ctx = WalletState & {
  connect: () => Promise<void>;
  connectMock: (pubkey: string) => Promise<void>;
  disconnect: () => Promise<void>;
};

const WalletContext = createContext<Ctx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({ publicKey: null, isMock: false });

  const persist = useCallback(async (s: WalletState, authToken?: string | null) => {
    setState(s);
    if (s.publicKey) {
      await AsyncStorage.setItem(STATE_KEY, JSON.stringify(s));
      if (authToken) {
        _authToken = authToken;
        await AsyncStorage.setItem(TOKEN_KEY, authToken);
      }
    } else {
      _authToken = null;
      await AsyncStorage.multiRemove([STATE_KEY, TOKEN_KEY]);
    }
  }, []);

  // Real MWA connect (Android only, Solana Mobile Stack).
  const connect = useCallback(async () => {
    if (Platform.OS !== "android") {
      throw new Error(
        "Wallet connect requires Android with a Solana wallet (Phantom, Solflare, Coinbase Wallet) installed.",
      );
    }
    // Lazy-import so iOS/web bundles don't pull native modules.
    const { transact } = await import(
      "@solana-mobile/mobile-wallet-adapter-protocol-web3js"
    );
    const result = await transact(async (wallet) => {
      const auth = await wallet.authorize({
        chain: "solana:devnet",
        identity: DAPP_IDENTITY,
      });
      return auth;
    });
    const rawAddress = result.accounts[0]?.address;
    if (!rawAddress) throw new Error("No accounts returned from wallet");
    // MWA returns addresses as base64. The rest of our code expects the
    // canonical base58 form (it's what PublicKey() can parse, what Solscan
    // shows, what the program PDAs are derived from). Convert here, once.
    const pubkeyBytes = Buffer.from(rawAddress, "base64");
    const base58 = new PublicKey(pubkeyBytes).toBase58();
    await persist({ publicKey: base58, isMock: false }, result.auth_token);
  }, [persist]);

  // Dev fallback when MWA isn't available — accept a pasted pubkey.
  const connectMock = useCallback(
    async (pubkey: string) => {
      await persist({ publicKey: pubkey, isMock: true });
    },
    [persist],
  );

  const disconnect = useCallback(async () => {
    await persist({ publicKey: null, isMock: false });
  }, [persist]);

  return (
    <WalletContext.Provider value={{ ...state, connect, connectMock, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be inside WalletProvider");
  return ctx;
}

export function shortAddr(addr: string | null, chars = 4): string {
  if (!addr) return "—";
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}
