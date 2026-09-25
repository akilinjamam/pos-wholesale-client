import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { fieldErrors } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useSetDealerCreditHold } from '@/hooks/data/useParties';

import type { PartyPayload } from '@shared/types';

/**
 * Put a dealer on credit hold, or lift one — the single most common credit action, so it gets
 * its own small dialog rather than a trip through the full editor.
 *
 * It goes through `PATCH /dealers/:id/credit-hold`, which needs only `dealer:creditHold` — not
 * `dealer:update`, which ACCOUNTS (the role that places holds) deliberately lacks. It sends only
 * the two hold fields, so it cannot disturb a limit someone else edited in the meantime.
 *
 * Placing a hold needs a reason; the server refuses one without, and the review screen exists
 * to revisit holds, which it cannot do for a blank. Lifting one clears the reason server-side.
 */
export interface CreditHoldDialogProps {
  dealer: PartyPayload | null;
  onClose: () => void;
}

export function CreditHoldDialog({ dealer, onClose }: CreditHoldDialogProps) {
  const setHold = useSetDealerCreditHold();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();

  const onHold = Boolean(dealer?.dealer?.creditHold);

  const submit = () => {
    if (!dealer) return;
    if (!onHold && reason.trim() === '') {
      setError('Say why the dealer is on hold');
      return;
    }

    setHold.mutate(
      {
        id: dealer.id,
        body: onHold
          ? { creditHold: false }
          : { creditHold: true, creditHoldReason: reason.trim() },
      },
      {
        onSuccess: onClose,
        onError: (e) => setError(fieldErrors(e)[0]?.message),
      },
    );
  };

  return (
    <Dialog
      open={dealer !== null}
      onClose={setHold.isPending ? () => undefined : onClose}
      title={
        onHold
          ? `Lift the hold on ${dealer?.name ?? ''}?`
          : `Put ${dealer?.name ?? ''} on hold?`
      }
      description={
        onHold
          ? `On hold since ${
              dealer?.dealer?.creditHoldSince
                ? new Date(dealer.dealer.creditHoldSince).toLocaleDateString()
                : 'an unknown date'
            }: “${dealer?.dealer?.creditHoldReason ?? 'no reason recorded'}”. Credit orders will be accepted again.`
          : 'New credit orders for this dealer will be blocked until the hold is lifted. Cash sales are unaffected.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={setHold.isPending}>
            Cancel
          </Button>
          <Button
            variant={onHold ? 'default' : 'destructive'}
            onClick={submit}
            disabled={setHold.isPending}
          >
            {setHold.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {onHold ? 'Lift hold' : 'Put on hold'}
          </Button>
        </>
      }
    >
      {!onHold && (
        <Field label="Reason" required error={error}>
          {(props) => (
            <Input
              {...props}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(undefined);
              }}
              placeholder="Cheque bounced on 12 Sep"
              autoFocus
            />
          )}
        </Field>
      )}
      {onHold && error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </Dialog>
  );
}
