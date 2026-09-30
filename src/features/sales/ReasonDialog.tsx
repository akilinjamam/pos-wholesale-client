import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

/**
 * Ask why — before a credit override, an approval, a rejection or a cancellation.
 *
 * The server refuses these without a reason (three characters at least), and the reason goes on
 * the order's timeline for good. So the dialog asks for it rather than letting the request fail,
 * and keeps the button disabled until there is something worth recording.
 */
export interface ReasonDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  /** Cancelling a draft needs no reason; everything else does. */
  optional?: boolean;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

const MIN = 3;

export function ReasonDialog({
  title,
  description,
  confirmLabel,
  optional = false,
  destructive = false,
  pending = false,
  onConfirm,
  onClose,
}: ReasonDialogProps) {
  const [reason, setReason] = useState('');
  const ok = optional
    ? reason.trim().length === 0 || reason.trim().length >= MIN
    : reason.trim().length >= MIN;

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={description}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Back
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={!ok || pending}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label={optional ? 'Reason (optional)' : 'Reason'} required={!optional}>
        {(props) => (
          <Textarea
            {...props}
            data-autofocus
            rows={3}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && ok && !pending) {
                onConfirm(reason.trim());
              }
            }}
            placeholder="Recorded on the order's timeline"
          />
        )}
      </Field>
    </Dialog>
  );
}
