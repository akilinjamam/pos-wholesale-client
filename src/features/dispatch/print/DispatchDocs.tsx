import { forwardRef } from 'react';
import Barcode from 'react-barcode';

import { fmtDateTime } from '@/features/counter/print/printHelpers';

import { qtyText } from '../challanDraft';

import type { ReactNode } from 'react';
import type { DispatchLinePayload, DispatchPayload, OrgPayload } from '@shared/types';

/**
 * The dispatch desk's A4 printouts (Day 25). Black on white, like the counter's: they are
 * photocopied, faxed and signed in biro.
 *
 *   PickSheet   for the storekeeper walking the shelves — what, how many, in packs as they sit on
 *               the shelf, with blanks for the lot and serials they take and a tick column.
 *   ChallanDoc  travels with the goods — what left, how, in how many boxes, and where the dealer's
 *               person signs. **No prices**: the driver and the person at the door have no business
 *               seeing them, and the invoice says them anyway.
 *
 * Both show the challan's lines only — a partial dispatch prints what is in *this* consignment,
 * never the whole order.
 */

const page = {
  width: '186mm',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 12,
  color: '#000',
  background: '#fff',
} as const;
const cell = {
  padding: '6px 8px',
  borderBottom: '1px solid #ccc',
  verticalAlign: 'top',
} as const;
const num = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as const;
const head = { ...cell, textAlign: 'left', background: '#f2f2f2' } as const;

function Letterhead({
  org,
  title,
  docNo,
  date,
  children,
}: {
  org: OrgPayload | undefined;
  title: string;
  docNo: string;
  date: string | null;
  children?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{org?.legalName || org?.name}</div>
        {org?.address && <div>{org.address}</div>}
        <div>{[org?.phone, org?.email].filter(Boolean).join(' · ')}</div>
        {org?.bin && <div>BIN {org.bin}</div>}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>{title}</div>
        <div style={{ fontWeight: 600 }}>{docNo}</div>
        {date && <div>{fmtDateTime(date)}</div>}
        {children}
      </div>
    </div>
  );
}

function SignLine({ label }: { label: string }) {
  return (
    <div
      style={{ borderTop: '1px solid #000', width: '55mm', textAlign: 'center', paddingTop: 4 }}
    >
      {label}
    </div>
  );
}

function tracking(l: DispatchLinePayload): ReactNode {
  if (l.serials.length > 0) return `SN ${l.serials.join(', ')}`;
  if (l.lotNo) return `Lot ${l.lotNo}`;
  return null;
}

// ─── Pick sheet ─────────────────────────────────────────────────────────────────────────

export const PickSheet = forwardRef<
  HTMLDivElement,
  { d: DispatchPayload; org: OrgPayload | undefined; shipTo: string | null }
>(function PickSheet({ d, org, shipTo }, ref) {
  return (
    <div ref={ref} style={page}>
      <Letterhead
        org={org}
        title="PICK LIST"
        docNo={`Order ${d.orderDocNo ?? '—'}`}
        date={d.createdAt}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '16px 0' }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#555' }}>For</div>
          <div style={{ fontWeight: 600 }}>{d.dealerName}</div>
          {shipTo && <div>{shipTo}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div>Pick from: {d.locationName}</div>
          <div>{d.lines.length} line(s)</div>
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={head}>#</th>
            <th style={head}>SKU</th>
            <th style={head}>Item</th>
            <th style={{ ...head, textAlign: 'right' }}>Pick</th>
            <th style={head}>Lot / serials taken</th>
            <th style={{ ...head, textAlign: 'center' }}>✓</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={l.id}>
              <td style={cell}>{i + 1}</td>
              <td style={{ ...cell, fontFamily: 'ui-monospace, monospace' }}>{l.sku}</td>
              <td style={cell}>{l.productName}</td>
              <td style={num}>
                <strong>{qtyText(l)}</strong>
                {qtyText(l) !== `${l.qtyBase} ${l.baseUom}` && (
                  <div style={{ fontSize: 10 }}>
                    = {l.qtyBase} {l.baseUom}
                  </div>
                )}
              </td>
              <td style={{ ...cell, minWidth: '45mm' }}>
                {tracking(l) ??
                  (l.trackingMode === 'SERIAL'
                    ? `${l.qtyBase} serial(s): ____________________`
                    : l.trackingMode === 'LOT'
                      ? 'Lot: ____________'
                      : '')}
              </td>
              <td style={{ ...cell, textAlign: 'center' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    border: '1px solid #000',
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.note && <div style={{ marginTop: 12 }}>Note: {d.note}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 50 }}>
        <SignLine label="Picked by" />
        <SignLine label="Checked by" />
      </div>
    </div>
  );
});

// ─── Delivery challan ───────────────────────────────────────────────────────────────────

const MODE_LABEL = { OWN: 'Own vehicle', COURIER: 'Courier', BUS: 'Bus / coach' } as const;

export const ChallanDoc = forwardRef<
  HTMLDivElement,
  { d: DispatchPayload; org: OrgPayload | undefined; shipTo: string | null }
>(function ChallanDoc({ d, org, shipTo }, ref) {
  const t = d.transport;
  const totalBase = d.lines.reduce((s, l) => s + l.qtyBase, 0);
  return (
    <div ref={ref} style={page}>
      <Letterhead
        org={org}
        title="DELIVERY CHALLAN"
        docNo={d.docNo ?? 'Not yet dispatched'}
        date={d.dispatchedAt}
      >
        <div>Order: {d.orderDocNo}</div>
        {d.invoiceDocNo && <div>Invoice: {d.invoiceDocNo}</div>}
        {d.docNo && (
          <Barcode value={d.docNo} height={30} width={1.2} margin={4} displayValue={false} />
        )}
      </Letterhead>

      <div
        style={{ display: 'flex', justifyContent: 'space-between', margin: '16px 0', gap: 24 }}
      >
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#555' }}>
            Deliver to
          </div>
          <div style={{ fontWeight: 600 }}>{d.dealerName}</div>
          {shipTo && <div>{shipTo}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div>From: {d.locationName}</div>
          {t && (
            <>
              <div>By: {MODE_LABEL[t.mode]}</div>
              {t.vehicleNo && <div>Vehicle: {t.vehicleNo}</div>}
              {t.driverName && (
                <div>
                  Driver: {t.driverName}
                  {t.driverPhone ? ` · ${t.driverPhone}` : ''}
                </div>
              )}
              {t.courierName && <div>Courier: {t.courierName}</div>}
              {t.trackingNo && <div>Tracking: {t.trackingNo}</div>}
            </>
          )}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={head}>#</th>
            <th style={head}>SKU</th>
            <th style={head}>Item</th>
            <th style={{ ...head, textAlign: 'right' }}>Quantity</th>
            <th style={head}>Lot / serials</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={l.id}>
              <td style={cell}>{i + 1}</td>
              <td style={{ ...cell, fontFamily: 'ui-monospace, monospace' }}>{l.sku}</td>
              <td style={cell}>{l.productName}</td>
              <td style={num}>{qtyText(l)}</td>
              <td style={{ ...cell, fontSize: 11 }}>{tracking(l)}</td>
            </tr>
          ))}
          <tr>
            <td style={cell} colSpan={3}>
              <strong>Total</strong>
              {d.packages.length > 0 &&
                ` · ${d.packages.length} box(es)${
                  d.packages.some((p) => p.weightKg)
                    ? `, ${d.packages.reduce((s, p) => s + (p.weightKg ?? 0), 0)} kg`
                    : ''
                }`}
            </td>
            <td style={num}>
              <strong>{totalBase}</strong> base units
            </td>
            <td style={cell} />
          </tr>
        </tbody>
      </table>

      {d.note && <div style={{ marginTop: 12 }}>Note: {d.note}</div>}
      <div style={{ marginTop: 14, fontSize: 11 }}>
        Received the above in good condition. Shortages or damage must be noted here before
        signing.
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 50 }}>
        <SignLine label="Dispatched by" />
        <SignLine label="Driver / courier" />
        <SignLine label="Received by (name, date)" />
      </div>
    </div>
  );
});
