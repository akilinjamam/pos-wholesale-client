import { forwardRef } from 'react';

import { fmtDate, fmtDateTime } from '@/features/counter/print/printHelpers';
import { money } from '@/features/dealers/creditMath';

import { balanceText, docLabel } from '../format';

import type { ReactNode } from 'react';
import type {
  AgeingReport,
  CollectionSheet,
  OrgPayload,
  ReceiptResult,
  StatementPayload,
} from '@shared/types';

/**
 * Receivables printouts (Day 29), A4, black on white: the dealer statement, the collector's
 * sheet, and the money receipt. "PDF export" is the browser's Save-as-PDF from the print dialog —
 * the same document as the paper copy, named for the dealer and period.
 */

const page = {
  width: '186mm',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 11,
  color: '#000',
  background: '#fff',
} as const;
const cell = {
  padding: '5px 6px',
  borderBottom: '1px solid #ccc',
  verticalAlign: 'top',
} as const;
const num = {
  ...cell,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
} as const;
const head = { ...cell, textAlign: 'left', background: '#f2f2f2', fontWeight: 600 } as const;
const headNum = { ...head, textAlign: 'right' } as const;

const day = (iso: string) => fmtDate(iso);

function Header({
  org,
  title,
  right,
}: {
  org: OrgPayload | undefined;
  title: string;
  right: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 14,
      }}
    >
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{org?.legalName || org?.name}</div>
        {org?.address && <div>{org.address}</div>}
        <div>{[org?.phone, org?.email].filter(Boolean).join(' · ')}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1 }}>{title}</div>
        {right}
      </div>
    </div>
  );
}

// ─── Statement ──────────────────────────────────────────────────────────────────────────

export const StatementDoc = forwardRef<
  HTMLDivElement,
  { s: StatementPayload; org: OrgPayload | undefined }
>(function StatementDoc({ s, org }, ref) {
  return (
    <div ref={ref} style={page}>
      <Header
        org={org}
        title="STATEMENT OF ACCOUNT"
        right={
          <>
            <div>
              {day(`${s.from}T00:00:00Z`)} – {day(`${s.to}T00:00:00Z`)}
            </div>
            <div style={{ fontSize: 10 }}>Printed {fmtDateTime(s.generatedAt)}</div>
          </>
        }
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#555' }}>Account</div>
          <div style={{ fontWeight: 600 }}>
            {s.party.name} <span style={{ fontWeight: 400 }}>({s.party.code})</span>
          </div>
          {s.party.address && <div>{s.party.address}</div>}
          {s.party.phone && <div>{s.party.phone}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          {s.party.creditLimitMinor != null && (
            <div>Credit limit: {money(s.party.creditLimitMinor)}</div>
          )}
          {s.party.paymentTermsDays != null && (
            <div>Terms: {s.party.paymentTermsDays} days</div>
          )}
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={head}>Date</th>
            <th style={head}>Document</th>
            <th style={head}>Particulars</th>
            <th style={headNum}>Debit</th>
            <th style={headNum}>Credit</th>
            <th style={headNum}>Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cell}>{day(`${s.from}T00:00:00Z`)}</td>
            <td style={cell} colSpan={4}>
              <em>Balance brought forward</em>
            </td>
            <td style={num}>{balanceText(s.openingBalanceMinor)}</td>
          </tr>
          {s.lines.map((l) => (
            <tr key={l.id}>
              <td style={cell}>{day(l.postedAt)}</td>
              <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                {docLabel(l.docType)}
                {l.refDocNo && (
                  <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>
                    {l.refDocNo}
                  </div>
                )}
              </td>
              <td style={cell}>{l.narration}</td>
              <td style={num}>{l.debitMinor ? money(l.debitMinor) : ''}</td>
              <td style={num}>{l.creditMinor ? money(l.creditMinor) : ''}</td>
              <td style={num}>{balanceText(l.runningMinor)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td style={cell} colSpan={3}>
              Balance carried forward
            </td>
            <td style={num}>{money(s.totals.debitMinor)}</td>
            <td style={num}>{money(s.totals.creditMinor)}</td>
            <td style={num}>{balanceText(s.closingBalanceMinor)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 14, fontSize: 10 }}>
        “Cr” is a balance in your favour. Please report any difference within 15 days of
        receiving this statement.
      </div>
    </div>
  );
});

// ─── Collection sheet ───────────────────────────────────────────────────────────────────

export const CollectionDoc = forwardRef<
  HTMLDivElement,
  { sheet: CollectionSheet; org: OrgPayload | undefined; label: string }
>(function CollectionDoc({ sheet, org, label }, ref) {
  return (
    <div ref={ref} style={page}>
      <Header
        org={org}
        title="COLLECTION SHEET"
        right={
          <>
            <div>{day(`${sheet.asOf}T00:00:00Z`)}</div>
            <div>{label}</div>
          </>
        }
      />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={head}>Dealer</th>
            <th style={head}>Invoices</th>
            <th style={headNum}>Due</th>
            <th style={headNum}>Overdue</th>
            <th style={{ ...headNum, width: '24mm' }}>Collected</th>
            <th style={{ ...head, width: '22mm' }}>Signature</th>
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((r) => (
            <tr key={r.partyId}>
              <td style={cell}>
                <div style={{ fontWeight: 600 }}>
                  {r.name} <span style={{ fontWeight: 400 }}>({r.code})</span>
                </div>
                {r.phone && <div>{r.phone}</div>}
                {r.address && <div style={{ fontSize: 10 }}>{r.address}</div>}
                {r.advanceMinor > 0 && (
                  <div style={{ fontSize: 10 }}>On account: {money(r.advanceMinor)}</div>
                )}
              </td>
              <td style={{ ...cell, fontSize: 10 }}>
                {r.invoices.map((i) => (
                  <div key={i.id} style={{ whiteSpace: 'nowrap' }}>
                    {i.docNo} · {money(i.balanceMinor)}
                    {i.daysOverdue !== null && i.daysOverdue > 0 ? ` · ${i.daysOverdue}d` : ''}
                  </div>
                ))}
              </td>
              <td style={num}>{money(r.totalDueMinor)}</td>
              <td style={num}>{r.overdueMinor ? money(r.overdueMinor) : '—'}</td>
              <td style={cell} />
              <td style={cell} />
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td style={cell} colSpan={2}>
              {sheet.totals.dealers} dealer(s)
            </td>
            <td style={num}>{money(sheet.totals.dueMinor)}</td>
            <td style={num}>{money(sheet.totals.overdueMinor)}</td>
            <td style={cell} />
            <td style={cell} />
          </tr>
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40 }}>
        <div
          style={{
            borderTop: '1px solid #000',
            width: '55mm',
            textAlign: 'center',
            paddingTop: 4,
          }}
        >
          Collector
        </div>
        <div
          style={{
            borderTop: '1px solid #000',
            width: '55mm',
            textAlign: 'center',
            paddingTop: 4,
          }}
        >
          Received by accounts
        </div>
      </div>
    </div>
  );
});

// ─── Money receipt ──────────────────────────────────────────────────────────────────────

export const MoneyReceiptDoc = forwardRef<
  HTMLDivElement,
  { r: ReceiptResult; org: OrgPayload | undefined }
>(function MoneyReceiptDoc({ r, org }, ref) {
  const p = r.receipt;
  return (
    <div ref={ref} style={page}>
      <Header
        org={org}
        title="MONEY RECEIPT"
        right={
          <>
            <div style={{ fontWeight: 600 }}>{p.docNo}</div>
            <div>{fmtDateTime(p.paidAt)}</div>
          </>
        }
      />
      <div style={{ fontSize: 13, margin: '10px 0' }}>
        Received with thanks from <strong>{p.partyName}</strong> ({p.partyCode}) the sum of{' '}
        <strong>{money(p.amountMinor)}</strong> by {p.method.toLowerCase()}
        {p.reference ? ` (ref ${p.reference})` : ''}
        {p.mfs ? ` (${p.mfs.provider} ${p.mfs.trxId})` : ''}
        {p.instrument
          ? ` no. ${p.instrument.chequeNo}, ${p.instrument.bankName ?? ''}, dated ${fmtDate(p.instrument.chequeDate)} — subject to realisation`
          : ''}
        .
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={head}>Against</th>
            <th style={headNum}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {p.allocations
            .filter((a) => !a.reversedAt)
            .map((a) => (
              <tr key={`${a.invoiceId}-${a.allocatedAt}`}>
                <td style={cell}>Invoice {a.docNo}</td>
                <td style={num}>{money(a.amountMinor)}</td>
              </tr>
            ))}
          {p.instrument?.status !== 'CLEARED' &&
            p.intendedAllocations.map((a) => (
              <tr key={`intended-${a.invoiceId}`}>
                <td style={cell}>Invoice {a.docNo} — when the cheque clears</td>
                <td style={num}>{money(a.amountMinor)}</td>
              </tr>
            ))}
          {p.unallocatedMinor > 0 && (
            <tr>
              <td style={cell}>On account (advance)</td>
              <td style={num}>{money(p.unallocatedMinor)}</td>
            </tr>
          )}
          <tr style={{ fontWeight: 700 }}>
            <td style={cell}>Total received</td>
            <td style={num}>{money(p.amountMinor)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 50 }}>
        <div
          style={{
            borderTop: '1px solid #000',
            width: '55mm',
            textAlign: 'center',
            paddingTop: 4,
          }}
        >
          Received by
        </div>
      </div>
    </div>
  );
});

// ─── Ageing ─────────────────────────────────────────────────────────────────────────────

export const AgeingDoc = forwardRef<
  HTMLDivElement,
  { r: AgeingReport; org: OrgPayload | undefined; labels: Record<string, string> }
>(function AgeingDoc({ r, org, labels }, ref) {
  return (
    <div ref={ref} style={page}>
      <Header
        org={org}
        title="RECEIVABLES AGEING"
        right={
          <>
            <div>As of {day(`${r.asOf}T00:00:00Z`)}</div>
            <div style={{ fontSize: 10 }}>Printed {fmtDateTime(r.generatedAt)}</div>
          </>
        }
      />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={head}>Dealer</th>
            {r.buckets.map((b) => (
              <th key={b} style={headNum}>
                {labels[b]}
              </th>
            ))}
            <th style={headNum}>Total</th>
          </tr>
        </thead>
        <tbody>
          {r.rows.map((row) => (
            <tr key={row.partyId}>
              <td style={cell}>
                {row.name} <span style={{ fontSize: 10 }}>({row.code})</span>
              </td>
              {r.buckets.map((b) => (
                <td key={b} style={num}>
                  {row.buckets[b] ? money(row.buckets[b]) : ''}
                </td>
              ))}
              <td style={{ ...num, fontWeight: 600 }}>{money(row.totalMinor)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td style={cell}>Total</td>
            {r.buckets.map((b) => (
              <td key={b} style={num}>
                {money(r.totals[b])}
              </td>
            ))}
            <td style={num}>{money(r.totalMinor)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
});
