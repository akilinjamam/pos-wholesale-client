import { getData, patchData } from '@/api/client';

import type { OrgPayload, OrgSettings } from '@shared/types';

/** V1 is single-tenant: "the org" is the caller's own, taken from their token. No id. */
/**
 * Silent: screens fetch the company profile in the background for their print letterhead, and a
 * role without `org:read` (a store keeper on a challan) would otherwise get a "no permission" toast
 * about something they never clicked — beside the refusal they did need to read.
 */
export function fetchOrg(): Promise<OrgPayload> {
  return getData<OrgPayload>('/org', undefined, { silent: true });
}

export type UpdateOrgBody = Partial<
  Pick<
    OrgPayload,
    | 'name'
    | 'legalName'
    | 'bin'
    | 'vatRegNo'
    | 'tin'
    | 'phone'
    | 'email'
    | 'address'
    | 'logoUrl'
    | 'currency'
    | 'timeZone'
    | 'fiscalYearStartMonth'
  >
>;

export function updateOrg(body: UpdateOrgBody): Promise<OrgPayload> {
  return patchData<OrgPayload>('/org', body);
}

/**
 * The business-rule flags, on their own endpoint and behind `settings:manage`.
 *
 * Separate from the profile PATCH because these change *posting behaviour* — whether a
 * dispatch raises an invoice, whether stock may go negative, whether a credit limit stops an
 * order — and the audit trail should read "changed allowNegativeStock", not "updated company".
 */
export type UpdateOrgSettingsBody = Partial<OrgSettings>;

export function updateOrgSettings(body: UpdateOrgSettingsBody): Promise<OrgPayload> {
  return patchData<OrgPayload>('/org/settings', body);
}
