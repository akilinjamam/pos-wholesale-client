import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { fieldErrors } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { env } from '@/config/env';
import { useSetDealerCreditLimit } from '@/hooks/data/useParties';

import { formatMoney, fromMinor, toMinor } from '@shared/money';

import type { PartyPayload } from '@shared/types';

/**
 * Change a dealer's credit limit and payment terms, through `PATCH /dealers/:id/credit-limit`.
 *
 * That route needs `dealer:setCreditLimit` only, so ACCOUNTS can use it without `dealer:update`.
 * The balance is shown beside the new limit because the question being answered is never
 * "what number?" but "how much more may they owe?".
 */
export interface CreditLimitDialogProps {
  dealer: PartyPayload | null;
  onClose: () => void;
}

export function CreditLimitDialog({ dealer, onClose }: CreditLimitDialogProps) {
  const setLimit = useSetDealerCreditLimit();
  const terms = dealer?.dealer;

  // Seeded once per open — the caller remounts this with a fresh `key` per dealer.
  const [limit, setLimitValue] = useState(
    terms ? String(fromMinor(terms.creditLimitMinor)) : '0',
  );
  const [days, setDays] = useState(terms ? String(terms.paymentTermsDays) : '0');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const money = (minor: number) => formatMoney(minor, { symbol: env.currencySymbol });
  const limitNumber = Number(limit);
  const headroom =
    dealer && Number.isFinite(limitNumber) && limit !== ''
      ? toMinor(limitNumber) - dealer.currentBalanceMinor
      : null;

  const submit = () => {
    if (!dealer) return;
    const next: Record<string, string> = {};
    if (limit === '' || !Number.isFinite(limitNumber) || limitNumber < 0) {
      next.creditLimitMinor = 'Enter an amount of 0 or more';
    }
    const daysNumber = Number(days);
    if (days === '' || !Number.isInteger(daysNumber) || daysNumber < 0 || daysNumber > 365) {
      next.paymentTermsDays = 'Whole days, 0 to 365';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLimit.mutate(
      {
        id: dealer.id,
        body: { creditLimitMinor: toMinor(limitNumber), paymentTermsDays: daysNumber },
      },
      {
        onSuccess: onClose,
        onError: (e) =>
          setErrors(
            Object.fromEntries(
              fieldErrors(e).map((f) => [f.path.replace(/^dealer\./, ''), f.message]),
            ),
          ),
      },
    );
  };

  return (
    <Dialog
      open={dealer !== null}
      onClose={setLimit.isPending ? () => undefined : onClose}
      title={`Credit terms — ${dealer?.name ?? ''}`}
      description={
        dealer
          ? `Current balance ${money(dealer.currentBalanceMinor)}. The limit caps the balance plus open orders.`
          : undefined
      }
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={setLimit.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={setLimit.isPending}>
            {setLimit.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Save terms
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label={`Credit limit (${env.currency})`}
          error={errors.creditLimitMinor}
          hint={
            headroom === null
              ? '0 means cash only.'
              : headroom >= 0
                ? `Leaves ${money(headroom)} of headroom at today's balance.`
                : `Already ${money(-headroom)} over this limit at today's balance.`
          }
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              step="0.01"
              min={0}
              value={limit}
              onChange={(e) => setLimitValue(e.target.value)}
              autoFocus
            />
          )}
        </Field>
        <Field
          label="Payment terms (days)"
          error={errors.paymentTermsDays}
          hint="Due date = invoice date + terms."
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              min={0}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
