/**
 * Pure decision logic for the /voice confirm screen: given an ExtractResult
 * and whether the user has since hand-edited a field, decide which fields
 * still deserve a "please check this" visual flag.
 *
 * Kept separate from extract-helpers.ts (which shapes the server's
 * ExtractResult) because this is a client-only concern — once the user edits
 * a flagged field themselves, the flag should clear even though the original
 * ExtractResult's confidence/partyMatched/amountDisagreement never changes.
 */

import { CONFIDENCE_REVIEW_THRESHOLD, type ExtractResult } from "./extract-helpers";

export interface FieldReviewFlags {
  /** True if the party row should show the "new contact" review banner. */
  party: boolean;
  /** True if the amount should show a review banner (disagreement or low
   * confidence with no specific disagreement). */
  amount: boolean;
}

export interface EditedState {
  /** True once the user has manually changed the party away from the
   * extraction's initial value. */
  partyEdited: boolean;
  /** True once the user has manually changed the amount away from the
   * extraction's initial value. */
  amountEdited: boolean;
}

/**
 * Computes which fields should still show a review flag. A field the user
 * has already hand-edited is considered resolved regardless of the original
 * extraction's confidence/disagreement, since the user has explicitly looked
 * at and corrected it.
 */
export function computeFieldReviewFlags(
  result: Pick<ExtractResult, "partyMatched" | "amountDisagreement" | "confidence">,
  edited: EditedState
): FieldReviewFlags {
  const party = !edited.partyEdited && !result.partyMatched;

  const amountLowConfidence = result.confidence < CONFIDENCE_REVIEW_THRESHOLD;
  const amount = !edited.amountEdited && (Boolean(result.amountDisagreement) || amountLowConfidence);

  return { party, amount };
}
