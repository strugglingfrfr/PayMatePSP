# UI bugs to fix (batch-rebuild)

These are display-only issues in the mobile app. The on-chain state is
correct in every case — only the UI is misreading or not refreshing.
Group them, fix together, kick a single APK rebuild.

## LP — Deposit screen

**Symptom:** "Total Deposited" shows `$0.00` after a successful 5 USDC
deposit. On-chain LP PDA correctly shows `depositedAmount = 5 USDC`.

**Likely cause:** The deposit screen reads from local state or stale
fetch. Either:
- `fetchLpAccount(owner)` is being called before the tx confirms, then
  the screen never refreshes after success
- Or there's a mismatch between what's displayed and what's fetched

**Fix path:** After `depositUsdc()` resolves, force a refetch of the LP
account state. Add to `mobile/app/(lp)/index.tsx` after
`api.kybSubmit(...)`-style call: `setRefreshKey(k => k+1)` and let the
useEffect dependency re-fetch.

---

## LP — Pool screen

**Symptom:** "Available" shows `$5.00` (green), same as Total Liquidity
`$5.00`. Wording-level confusion: when nothing is drawn, available ==
total, which the UI shows in two prominent stat cards. Looks duplicative.

**Fix path:** When `available == total`, only show one value, OR add
copy: "Pool fully available — no PSPs drawn yet."

---

## LP — Deposit screen, "POOL AVAILABLE" stat

**Symptom:** This card shows `$5.00` and so does the Total Liquidity
stat on the Pool screen. Same number on different stat names is
confusing during a demo.

**Fix path:** Either hide POOL AVAILABLE on the deposit screen (it's
on the Pool screen), or rename to something the LP cares about
("YOUR YIELD HORIZON" or similar).

---

## (To add as user finds them)

- _PSP drawdown UI:_
- _PSP repay UI:_
- _LP withdraw UI:_
- _Admin queue UI:_
- _History tab:_
