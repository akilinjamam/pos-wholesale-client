import { BookOpen } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { DealerPicker } from '@/components/common/DealerPicker';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { useParty } from '@/hooks/data/useParties';

import { StatementView } from './StatementView';

/**
 * `/receivables/statement?partyId=` — a dealer's statement. The dealer lives in the URL so the
 * collection sheet, the dealer profile and a bookmark can all link straight to one account.
 *
 * `/purchase/statement` is the same page for a supplier (Day 35). Their balance runs the other
 * way — a bill is a credit — so what we owe them shows as "Cr".
 */
export function StatementPage({ role = 'DEALER' }: { role?: 'DEALER' | 'SUPPLIER' }) {
  const [params, setParams] = useSearchParams();
  const partyId = params.get('partyId');
  const { data: party } = useParty(role, partyId ?? undefined);
  const noun = role === 'SUPPLIER' ? 'supplier' : 'dealer';

  return (
    <div className="space-y-5">
      <PageHeader
        title={role === 'SUPPLIER' ? 'Supplier statement' : 'Statement'}
        icon={BookOpen}
        description={
          role === 'SUPPLIER'
            ? 'A supplier’s account for a period. A balance marked Cr is what we owe them.'
            : "A dealer's account for a period, with the balance after every entry."
        }
      />
      <div className="max-w-md">
        <DealerPicker
          role={role}
          value={partyId ? (party ?? null) : null}
          onChange={(d) => setParams(d ? { partyId: d.id } : {}, { replace: true })}
          emptyLabel={`Choose a ${noun}…`}
        />
      </div>
      {partyId ? (
        <StatementView key={partyId} partyId={partyId} />
      ) : (
        <EmptyState icon={BookOpen} title={`Choose a ${noun} to see their statement`} />
      )}
    </div>
  );
}
