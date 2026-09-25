import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createParty,
  enrolParty,
  findPartyCandidates,
  getParty,
  listParties,
  removePartyRole,
  setDealerCreditHold,
  setDealerCreditLimit,
  updateParty,
} from '@/api/endpoints/parties';

import { PARTY_ROLE_LABELS } from '@shared/party';

import type {
  CreatePartyBody,
  EnrolPartyBody,
  ListPartiesParams,
  UpdatePartyBody,
} from '@/api/endpoints/parties';
import type { PartyRole } from '@shared/enums';
import type { DealerCreditHoldInput, DealerCreditLimitInput } from '@shared/party';

/**
 * Server state for dealers, customers and suppliers.
 *
 * Keys are rooted at `parties`, not at the role: one party can be a dealer *and* a supplier, and
 * an edit through `/dealers` changes the row the supplier list shows too. Invalidating the whole
 * root after every write is what keeps both lists honest without each mutation having to know
 * which other roles the party holds.
 */
export const partyKeys = {
  all: ['parties'] as const,
  list: (role: PartyRole, params: ListPartiesParams) =>
    [...partyKeys.all, role, 'list', params] as const,
  detail: (role: PartyRole, id: string) => [...partyKeys.all, role, 'detail', id] as const,
  candidates: (role: PartyRole, q: string) =>
    [...partyKeys.all, role, 'candidates', q] as const,
};

export function useParties(role: PartyRole, params: ListPartiesParams) {
  return useQuery({
    queryKey: partyKeys.list(role, params),
    queryFn: () => listParties(role, params),
    placeholderData: keepPreviousData,
  });
}

export function useParty(role: PartyRole, id: string | undefined) {
  return useQuery({
    queryKey: partyKeys.detail(role, id ?? ''),
    queryFn: () => getParty(role, id!),
    enabled: Boolean(id),
  });
}

/** Only searches once there is enough to match on — the server needs two characters too. */
export function usePartyCandidates(role: PartyRole, q: string, enabled: boolean) {
  const term = q.trim();
  return useQuery({
    queryKey: partyKeys.candidates(role, term),
    queryFn: () => findPartyCandidates(role, term),
    enabled: enabled && term.length >= 2,
    staleTime: 30_000,
  });
}

function useInvalidateParties() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: partyKeys.all });
}

export function useCreateParty(role: PartyRole) {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: (body: CreatePartyBody) => createParty(role, body),
    onSuccess: (party) => {
      void invalidate();
      toast.success(`${party.name} added as ${PARTY_ROLE_LABELS[role].one.toLowerCase()}`, {
        description: `Code ${party.code}`,
      });
    },
  });
}

export function useUpdateParty(role: PartyRole) {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePartyBody }) =>
      updateParty(role, id, body),
    onSuccess: (party) => {
      void invalidate();
      toast.success(`${party.name} updated`);
    },
  });
}

export function useEnrolParty(role: PartyRole) {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: EnrolPartyBody }) =>
      enrolParty(role, id, body),
    onSuccess: (party) => {
      void invalidate();
      toast.success(`${party.name} is now also a ${PARTY_ROLE_LABELS[role].one.toLowerCase()}`);
    },
  });
}

export function useRemovePartyRole(role: PartyRole) {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: (id: string) => removePartyRole(role, id),
    onSuccess: () => {
      void invalidate();
      toast.success(`${PARTY_ROLE_LABELS[role].one} removed`);
    },
  });
}

export function useSetDealerCreditLimit() {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DealerCreditLimitInput }) =>
      setDealerCreditLimit(id, body),
    onSuccess: (party) => {
      void invalidate();
      toast.success(`Credit terms updated for ${party.name}`);
    },
  });
}

export function useSetDealerCreditHold() {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DealerCreditHoldInput }) =>
      setDealerCreditHold(id, body),
    onSuccess: (party) => {
      void invalidate();
      toast.success(
        party.dealer?.creditHold
          ? `${party.name} is on credit hold`
          : `Hold lifted for ${party.name}`,
      );
    },
  });
}
