/**
 * Mock compliance data for demo purposes.
 * Real compliance providers (ComplyAdvantage, Refinitiv) hit real lists;
 * we mock for demo speed.
 */

export const SANCTIONED_ENTITIES = [
  "EvilCorp Ltd",
  "Sanction Holdings",
  "OFAC Test Entity",
];

export const AML_WATCHLIST = ["Suspicious Trading Co", "Cash Mule Inc"];

export const PEP_NAMES = ["John Test PEP", "Politically Exposed Sample"];

export const ADVERSE_MEDIA_KEYWORDS = [
  "fraud allegations",
  "money laundering",
  "regulatory action",
  "ponzi",
];

export const HIGH_RISK_JURISDICTIONS = [
  "NG",
  "PK",
  "AF",
  "MM",
  "VE",
  "IR",
  "RU",
  "BY",
  "SY",
  "CU",
  "KP",
];
