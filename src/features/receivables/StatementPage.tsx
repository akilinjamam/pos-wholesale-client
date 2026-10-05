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
 */
export function StatementPage() {
  const [params, setParams] = useSearchParams();
  const partyId = params.get('partyId');
  const { data: dealer } = useParty('DEALER', partyId ?? undefined);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Statement"
        icon={BookOpen}
        description="A dealer's account for a period, with the balance after every entry."
      />
      <div className="max-w-md">
        <DealerPicker
          value={partyId ? (dealer ?? null) : null}
          onChange={(d) => setParams(d ? { partyId: d.id } : {}, { replace: true })}
          emptyLabel="Choose a dealer…"
        />
      </div>
      {partyId ? (
        <StatementView key={partyId} partyId={partyId} />
      ) : (
        <EmptyState icon={BookOpen} title="Choose a dealer to see their statement" />
      )}
    </div>
  );
}
