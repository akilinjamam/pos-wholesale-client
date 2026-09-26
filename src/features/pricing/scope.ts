/**
 * Which price list a screen is showing: one tier's, or one dealer's own overrides.
 *
 * Exactly one is set — the same rule the API enforces — so a grid, an import or a bulk adjust
 * can never be pointed at both at once.
 */
export type PriceScope =
  { tierId: string; partyId?: null } | { partyId: string; tierId?: null };
