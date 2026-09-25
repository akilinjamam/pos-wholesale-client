import { deleteData, getData, getPage, patchData, postData } from '@/api/client';

import { PARTY_ROLE_PATHS } from '@shared/party';

import type { PartyRole } from '@shared/enums';
import type {
  CreateCustomerInput,
  CreateDealerInput,
  CreateSupplierInput,
  DealerCreditHoldInput,
  DealerCreditLimitInput,
  EnrolDealerInput,
  EnrolSupplierInput,
} from '@shared/party';
import type { Paginated, PartyCandidate, PartyPayload } from '@shared/types';

/**
 * Parties are one collection on the server but three mounts — `/dealers`, `/customers`,
 * `/suppliers` — each gated on its own permission. These functions take the role and build the
 * path from `PARTY_ROLE_PATHS`, the same table the server's router is named from, so a role and
 * its URL cannot disagree.
 */

export type ListPartiesParams = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  isActive?: boolean;
  tag?: string;
  alsoRole?: PartyRole;
  // Dealer list only — the server ignores them elsewhere.
  creditHold?: boolean;
  salespersonUserId?: string;
  priceTierId?: string;
  territory?: string;
};

/** Whatever the role's create schema accepts. The role section must match the role. */
export type CreatePartyBody = CreateDealerInput | CreateCustomerInput | CreateSupplierInput;
export type UpdatePartyBody = Partial<CreatePartyBody>;
export type EnrolPartyBody = EnrolDealerInput | EnrolSupplierInput | Record<string, never>;

const base = (role: PartyRole) => `/${PARTY_ROLE_PATHS[role]}`;

export function listParties(
  role: PartyRole,
  params: ListPartiesParams,
): Promise<Paginated<PartyPayload>> {
  return getPage<PartyPayload>(base(role), params);
}

export function getParty(role: PartyRole, id: string): Promise<PartyPayload> {
  return getData<PartyPayload>(`${base(role)}/${id}`);
}

/** Parties already on file that do not hold `role` yet — the duplicate check before create. */
export function findPartyCandidates(role: PartyRole, q: string): Promise<PartyCandidate[]> {
  return getData<PartyCandidate[]>(`${base(role)}/candidates`, { q }, { silent: true });
}

export function createParty(role: PartyRole, body: CreatePartyBody): Promise<PartyPayload> {
  return postData<PartyPayload>(base(role), body);
}

export function updateParty(
  role: PartyRole,
  id: string,
  body: UpdatePartyBody,
): Promise<PartyPayload> {
  return patchData<PartyPayload>(`${base(role)}/${id}`, body);
}

/** Give an existing party this role, rather than creating a second record with a second ledger. */
export function enrolParty(
  role: PartyRole,
  id: string,
  body: EnrolPartyBody = {},
): Promise<PartyPayload> {
  return postData<PartyPayload>(`${base(role)}/${id}/enrol`, body);
}

/**
 * Removes the role — and the party, once it holds no other. Refused while there is a balance.
 * Customers have no delete route at all; they are deactivated.
 */
export function removePartyRole(role: PartyRole, id: string): Promise<void> {
  return deleteData<void>(`${base(role)}/${id}`);
}

// ─── Dealer credit decisions ────────────────────────────────────────────────────────────
//
// Their own routes and grants, so ACCOUNTS — which holds `dealer:setCreditLimit` and
// `dealer:creditHold` but not `dealer:update` — can make them without the full editor.

export function setDealerCreditLimit(
  id: string,
  body: DealerCreditLimitInput,
): Promise<PartyPayload> {
  return patchData<PartyPayload>(`/dealers/${id}/credit-limit`, body);
}

/** Placing a hold needs a reason; lifting one clears it server-side. */
export function setDealerCreditHold(
  id: string,
  body: DealerCreditHoldInput,
): Promise<PartyPayload> {
  return patchData<PartyPayload>(`/dealers/${id}/credit-hold`, body);
}
