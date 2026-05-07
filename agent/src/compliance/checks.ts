import type { ComplianceResult, KybData } from "../lib/types";
import {
  SANCTIONED_ENTITIES,
  AML_WATCHLIST,
  PEP_NAMES,
  ADVERSE_MEDIA_KEYWORDS,
} from "../lib/compliance-data";

/**
 * Run compliance checks against mock sanctions/AML/PEP/adverse-media lists.
 *
 * For demo purposes — real compliance providers (ComplyAdvantage, Refinitiv)
 * hit real lists with proper fuzzy matching and confidence scoring.
 */
export function runComplianceChecks(kyb: KybData): ComplianceResult {
  const companyLower = kyb.companyName.toLowerCase();

  // Sanctions check
  const sanctionsHits = SANCTIONED_ENTITIES.filter((entity) =>
    companyLower.includes(entity.toLowerCase()),
  );
  const sanctionsClear = sanctionsHits.length === 0;

  // AML watchlist check
  const amlFlags = AML_WATCHLIST.filter((entity) =>
    companyLower.includes(entity.toLowerCase()),
  );

  // PEP (Politically Exposed Persons) check
  // In a real system this would check directors/UBOs against PEP databases
  const pepMatches = PEP_NAMES.filter((name) =>
    companyLower.includes(name.toLowerCase()),
  );

  // Adverse media keyword check
  const adverseMedia = ADVERSE_MEDIA_KEYWORDS.filter((keyword) =>
    companyLower.includes(keyword.toLowerCase()),
  );

  // Determine overall status
  const hasHits =
    !sanctionsClear ||
    amlFlags.length > 0 ||
    pepMatches.length > 0 ||
    adverseMedia.length > 0;

  const overallStatus = hasHits ? "FLAGGED" : "CLEAR";

  // Mock confidence: high if no hits (easy decision), lower if hits (needs review)
  const confidence = hasHits ? 0.7 : 0.95;

  return {
    sanctionsClear,
    amlFlags,
    pepMatches,
    adverseMedia,
    overallStatus,
    confidence,
  };
}
