// Role context — which actor the user picked at the splash screen.
// Persists in AsyncStorage so reopening the app drops you in the same role.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Role } from "../../constants/theme";

const KEY = "paymate.role";

type Ctx = {
  role: Role | null;
  setRole: (r: Role | null) => void;
  loaded: boolean;
};

const RoleContext = createContext<Ctx | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === "LP" || v === "PSP" || v === "ADMIN") setRoleState(v);
      setLoaded(true);
    });
  }, []);

  const setRole = useCallback((r: Role | null) => {
    setRoleState(r);
    if (r) AsyncStorage.setItem(KEY, r);
    else AsyncStorage.removeItem(KEY);
  }, []);

  return (
    <RoleContext.Provider value={{ role, setRole, loaded }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be inside RoleProvider");
  return ctx;
}
