import { forwardRef } from 'react';
import Barcode from 'react-barcode';

import { money } from '../Sale/saleHelpers';

import { fmtDateTime, METHOD_LABELS, printableWidth } from './printHelpers';

import type { ReactNode } from 'react';
import type {
  OrgPayload,
  PaymentDocPayload,
  PosSaleResult,
  PosSessionPayload,
  SalesReturnPayload,
} from '@shared/types';

/**
 * The counter's printouts. Plain black-on-white, no colour, no shadows: a thermal head prints
 * dots, and anything grey comes out as noise. Money is right-aligned in tabular figures so columns
 * of amounts line up on the roll.
 */

/** Keeps a printable document in the DOM (react-to-print needs it) but off the screen. */
export function OffScreen({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden="true" style={{ position: 'fixed', left: -10_000, top: 0 }}>
      {children}
    </div>
  );
}

// ─── Thermal building blocks ────────────────────────────────────────────────────────────

const Roll = forwardRef<HTMLDivElement, { paper: '80' | '58'; children: ReactNode }>(
  function Roll({ paper, children }, ref) {
    return (
      <div
        ref={ref}
        style={{
          width: `${printableWidth(paper)}mm`,
          padding: '2mm 4mm',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: paper === '80' ? '11px' : '10px',
          lineHeight: 1.35,
          color: '#000',
          background: '#fff',
        }}
      >
        {children}
      </div>
    );
  },
);

const Rule = () => <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />;

function Row({ left, right, bold }: { left: ReactNode; right: ReactNode; bold?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        fontWeight: bold ? 700 : 400,
      }}
    >
      <span style={{ minWidth: 0 }}>{left}</span>
      <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{right}</span>
    </div>
  );
}

function OrgHeader({ org, location }: { org: OrgPayload | undefined; location?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.3em', fontWeight: 700 }}>{org?.name ?? ''}</div>
      {org?.address && <div>{org.address}</div>}
      {org?.phone && <div>Tel {org.phone}</div>}
      {org?.bin && <div>BIN {org.bin}</div>}
      {location && <div>{location}</div>}
    </div>
  );
}

function DocBarcode({ value, paper }: { value: string; paper: '80' | '58' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
      <Barcode
        value={value}
        height={34}
        width={paper === '80' ? 1.3 : 1}
        fontSize={10}
        margin={0}
        displayValue
      />
    </div>
  );
}

const paymentLines = (payments: PaymentDocPayload[]) =>
  payments.map((p) => (
    <Row key={p.id} left={METHOD_LABELS[p.method] ?? p.method} right={money(p.amountMinor)} />
  ));

// ─── Sale receipt ───────────────────────────────────────────────────────────────────────

/**
 * The customer's receipt. Its barcode is the invoice number, so a return starts by scanning it.
 * The change printed is only known at the moment of sale — a reprint shows what was received.
 */
export const ThermalReceipt = forwardRef<
  HTMLDivElement,
  {
    sale: PosSaleResult;
    org: OrgPayload | undefined;
    paper: '80' | '58';
    footer: string;
    reprint?: boolean;
  }
>(function ThermalReceipt({ sale, org, paper, footer, reprint }, ref) {
  const inv = sale.invoice;
  return (
    <Roll ref={ref} paper={paper}>
      <OrgHeader org={org} location={inv.locationName} />
      <Rule />
      <Row
        left={<strong>{inv.docNo}</strong>}
        right={fmtDateTime(inv.postedAt ?? inv.invoiceDate)}
      />
      {inv.salespersonName && <div>Cashier: {inv.salespersonName}</div>}
      {inv.customerName && (
        <div>
          Customer: {inv.customerName}
          {inv.customerPhone ? ` · ${inv.customerPhone}` : ''}
        </div>
      )}
      {reprint && <div style={{ fontWeight: 700 }}>** REPRINT **</div>}
      <Rule />
      {inv.lines.map((l) => (
        <div key={l.id} style={{ marginBottom: 3 }}>
          <div>{l.description}</div>
          {l.serials.length > 0 && <div>SN {l.serials.join(', ')}</div>}
          <Row
            left={`  ${l.uomQty} ${l.uomCode} × ${money(l.unitPriceMinor)}`}
            right={money(l.uomQty * l.unitPriceMinor)}
          />
          {l.discountMinor > 0 && (
            <Row left="  discount" right={`−${money(l.discountMinor)}`} />
          )}
        </div>
      ))}
      <Rule />
      <Row left="Subtotal" right={money(inv.subtotalMinor)} />
      {inv.discountMinor > 0 && <Row left="Discount" right={`−${money(inv.discountMinor)}`} />}
      <Row left="TOTAL" right={money(inv.grandTotalMinor)} bold />
      <Rule />
      {paymentLines(sale.payments)}
      {!reprint && sale.changeMinor > 0 && (
        <Row left="Change" right={money(sale.changeMinor)} bold />
      )}
      {inv.balanceMinor > 0 && <Row left="On account" right={money(inv.balanceMinor)} bold />}
      <Rule />
      {inv.docNo && <DocBarcode value={inv.docNo} paper={paper} />}
      <div style={{ textAlign: 'center', marginTop: 4 }}>{footer}</div>
    </Roll>
  );
});

// ─── Return slip ────────────────────────────────────────────────────────────────────────

export const ReturnSlip = forwardRef<
  HTMLDivElement,
  { ret: SalesReturnPayload; org: OrgPayload | undefined; paper: '80' | '58' }
>(function ReturnSlip({ ret, org, paper }, ref) {
  const how =
    ret.settlement === 'CASH_REFUND'
      ? `Cash refunded (${ret.refundDocNo})`
      : ret.settlement === 'CREDIT_NOTE'
        ? `Credited to account (${ret.creditNoteDocNo})`
        : 'Exchange credit — spend it on the next sale';
  return (
    <Roll ref={ref} paper={paper}>
      <OrgHeader org={org} />
      <Rule />
      <div style={{ textAlign: 'center', fontWeight: 700 }}>RETURN</div>
      <Row left={<strong>{ret.docNo}</strong>} right={fmtDateTime(ret.postedAt)} />
      <div>Against {ret.invoiceDocNo}</div>
      {ret.customerName && <div>Customer: {ret.customerName}</div>}
      <Rule />
      {ret.lines.map((l) => (
        <div key={l.invoiceLineId} style={{ marginBottom: 3 }}>
          <div>{l.description}</div>
          {l.serials.length > 0 && <div>SN {l.serials.join(', ')}</div>}
          <Row
            left={`  ${l.qtyBase} × ${money(l.unitPriceMinor)}${l.condition === 'DAMAGED' ? ' (damaged)' : ''}`}
            right={money(l.lineTotalMinor)}
          />
        </div>
      ))}
      <Rule />
      <Row left="RETURNED" right={money(ret.grandTotalMinor)} bold />
      <div>{how}</div>
      <Rule />
      <DocBarcode value={ret.docNo} paper={paper} />
    </Roll>
  );
});

// ─── Z-report ───────────────────────────────────────────────────────────────────────────

/**
 * The shift's closing report: what was sold, what came back, how it was paid, and the drawer —
 * float + cash in − cash out = expected, against what was counted note by note.
 */
export const ZReport = forwardRef<
  HTMLDivElement,
  { s: PosSessionPayload; org: OrgPayload | undefined; paper: '80' | '58' }
>(function ZReport({ s, org, paper }, ref) {
  const t = s.totals;
  const counted = s.denominations.filter((d) => d.count > 0);
  return (
    <Roll ref={ref} paper={paper}>
      <OrgHeader org={org} location={s.locationName} />
      <Rule />
      <div style={{ textAlign: 'center', fontWeight: 700 }}>
        {s.status === 'CLOSED' ? 'Z-REPORT' : 'X-REPORT (shift still open)'}
      </div>
      <div>
        Till {s.terminalCode} · {s.openedByName}
      </div>
      <div>Opened {fmtDateTime(s.openedAt)}</div>
      {s.closedAt && (
        <div>
          Closed {fmtDateTime(s.closedAt)}
          {s.closedByName && s.closedByName !== s.openedByName ? ` by ${s.closedByName}` : ''}
        </div>
      )}
      <Rule />
      <Row left={`Sales (${t.salesCount})`} right={money(t.grossMinor)} />
      <Row left="Discounts" right={`−${money(t.discountMinor)}`} />
      <Row left={`Returns (${t.returnsCount ?? 0})`} right={`−${money(t.returnsMinor)}`} />
      <Row left="NET SALES" right={money(t.netMinor)} bold />
      <Rule />
      <div style={{ fontWeight: 700 }}>Taken by method</div>
      {t.byMethod.map((m) => (
        <Row
          key={m.method}
          left={METHOD_LABELS[m.method] ?? m.method}
          right={money(m.amountMinor)}
        />
      ))}
      <Rule />
      <div style={{ fontWeight: 700 }}>Cash drawer</div>
      <Row left="Opening float" right={money(s.openingFloatMinor)} />
      <Row left="+ Cash taken" right={money(t.cashInMinor ?? 0)} />
      <Row left="− Cash refunded" right={money(t.cashOutMinor ?? 0)} />
      <Row left="EXPECTED" right={money(s.expectedCashMinor)} bold />
      {s.countedCashMinor !== null && (
        <>
          <Rule />
          {counted.map((d) => (
            <Row
              key={d.note}
              left={`  ৳${d.note} × ${d.count}`}
              right={money(d.note * 100 * d.count)}
            />
          ))}
          <Row left="COUNTED" right={money(s.countedCashMinor)} bold />
          <Row
            left={
              (s.varianceMinor ?? 0) < 0
                ? 'SHORT'
                : (s.varianceMinor ?? 0) > 0
                  ? 'OVER'
                  : 'VARIANCE'
            }
            right={money(Math.abs(s.varianceMinor ?? 0))}
            bold
          />
        </>
      )}
      {s.closeNote && <div>Note: {s.closeNote}</div>}
      <Rule />
      <div style={{ marginTop: 18 }}>Cashier ______________________</div>
      <div style={{ marginTop: 18 }}>Manager ______________________</div>
    </Roll>
  );
});

// ─── A4 invoice ─────────────────────────────────────────────────────────────────────────

/** The same sale on A4 — for a dealer or a customer who needs a proper invoice for their books. */
export const A4Invoice = forwardRef<
  HTMLDivElement,
  { sale: PosSaleResult; org: OrgPayload | undefined }
>(function A4Invoice({ sale, org }, ref) {
  const inv = sale.invoice;
  const cell = { padding: '6px 8px', borderBottom: '1px solid #ccc' } as const;
  const num = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as const;
  return (
    <div
      ref={ref}
      style={{
        width: '186mm',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
        color: '#000',
        background: '#fff',
      }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{org?.legalName || org?.name}</div>
          {org?.address && <div>{org.address}</div>}
          <div>{[org?.phone, org?.email].filter(Boolean).join(' · ')}</div>
          <div>
            {[org?.bin && `BIN ${org.bin}`, org?.tin && `TIN ${org.tin}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>INVOICE</div>
          <div style={{ fontWeight: 600 }}>{inv.docNo}</div>
          <div>{fmtDateTime(inv.postedAt ?? inv.invoiceDate)}</div>
          {inv.docNo && (
            <Barcode
              value={inv.docNo}
              height={30}
              width={1.2}
              fontSize={0}
              margin={4}
              displayValue={false}
            />
          )}
        </div>
      </div>

      <div
        style={{ display: 'flex', justifyContent: 'space-between', margin: '18px 0', gap: 24 }}
      >
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#555' }}>Bill to</div>
          <div style={{ fontWeight: 600 }}>{inv.customerName ?? 'Walk-in customer'}</div>
          {inv.customerAddress && <div>{inv.customerAddress}</div>}
          {inv.customerPhone && <div>{inv.customerPhone}</div>}
          {inv.customerBin && <div>BIN {inv.customerBin}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div>Counter: {inv.locationName}</div>
          {inv.salespersonName && <div>Served by: {inv.salespersonName}</div>}
          {inv.dueDate && <div>Due: {fmtDateTime(inv.dueDate)}</div>}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f2f2f2' }}>
            <th style={{ ...cell, textAlign: 'left' }}>#</th>
            <th style={{ ...cell, textAlign: 'left' }}>Item</th>
            <th style={num}>Qty</th>
            <th style={num}>Unit price</th>
            <th style={num}>Discount</th>
            <th style={num}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={l.id}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>
                {l.description}
                {l.serials.length > 0 && (
                  <div style={{ fontSize: 10 }}>SN {l.serials.join(', ')}</div>
                )}
              </td>
              <td style={num}>
                {l.uomQty} {l.uomCode}
              </td>
              <td style={num}>{money(l.unitPriceMinor)}</td>
              <td style={num}>{l.discountMinor ? money(l.discountMinor) : '—'}</td>
              <td style={num}>{money(l.lineTotalMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <table style={{ width: '70mm', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={cell}>Subtotal</td>
              <td style={num}>{money(inv.subtotalMinor)}</td>
            </tr>
            {inv.discountMinor > 0 && (
              <tr>
                <td style={cell}>Discount</td>
                <td style={num}>−{money(inv.discountMinor)}</td>
              </tr>
            )}
            <tr style={{ fontWeight: 700 }}>
              <td style={cell}>Total</td>
              <td style={num}>{money(inv.grandTotalMinor)}</td>
            </tr>
            {sale.payments.map((p) => (
              <tr key={p.id}>
                <td style={cell}>
                  Paid — {METHOD_LABELS[p.method] ?? p.method} ({p.docNo})
                </td>
                <td style={num}>{money(p.amountMinor)}</td>
              </tr>
            ))}
            {inv.creditedMinor > 0 && (
              <tr>
                <td style={cell}>Returned</td>
                <td style={num}>−{money(inv.creditedMinor)}</td>
              </tr>
            )}
            <tr style={{ fontWeight: 700 }}>
              <td style={cell}>Balance due</td>
              <td style={num}>{money(inv.balanceMinor)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 60 }}>
        <div
          style={{
            borderTop: '1px solid #000',
            width: '55mm',
            textAlign: 'center',
            paddingTop: 4,
          }}
        >
          Customer signature
        </div>
        <div
          style={{
            borderTop: '1px solid #000',
            width: '55mm',
            textAlign: 'center',
            paddingTop: 4,
          }}
        >
          Authorised signature
        </div>
      </div>
    </div>
  );
});
