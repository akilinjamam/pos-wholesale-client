import { BarChart3, Table2 } from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { money } from '@/features/dealers/creditMath';

import type { DashboardPayload } from '@shared/types';

type Trend = NonNullable<DashboardPayload['sales']>['trend'];

/**
 * Net sales per day for the last 30 days, wholesale and counter stacked (Day 38).
 *
 * Wholesale is always series 1 and counter series 2 — the colour follows the channel, never its
 * rank. Thin bars with a 2px surface gap between the stacked parts, a recessive grid, one y-axis
 * in taka. Hover shows the day's split and total; the table view carries the same numbers for
 * anyone who cannot use the colours or the chart.
 */
const SERIES = [
  { key: 'wholesaleMinor', label: 'Wholesale', color: 'var(--chart-1)' },
  { key: 'counterMinor', label: 'Counter', color: 'var(--chart-2)' },
] as const;

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const compact = (minor: number) => {
  const taka = minor / 100;
  if (taka >= 100_000) return `৳${(taka / 100_000).toFixed(taka >= 1_000_000 ? 0 : 1)}L`;
  if (taka >= 1_000) return `৳${(taka / 1_000).toFixed(taka >= 10_000 ? 0 : 1)}k`;
  return `৳${taka.toFixed(0)}`;
};

export function SalesTrendChart({ trend }: { trend: Trend }) {
  const [asTable, setAsTable] = useState(false);
  const total = trend.reduce((t, d) => t + d.wholesaleMinor + d.counterMinor, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex gap-4 text-sm" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: s.color }}
                aria-hidden="true"
              />
              {s.label}
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
        >
          {asTable ? <BarChart3 aria-hidden="true" /> : <Table2 aria-hidden="true" />}
          {asTable ? 'Chart' : 'Table'}
        </Button>
      </div>

      {total === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No sales in the last 30 days.
        </p>
      ) : asTable ? (
        <div className="max-h-72 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead className="text-right">Wholesale</TableHead>
                <TableHead className="text-right">Counter</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...trend].reverse().map((d) => (
                <TableRow key={d.day}>
                  <TableCell>{shortDay(d.day)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(d.wholesaleMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(d.counterMinor)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {money(d.wholesaleMinor + d.counterMinor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div
          className="h-64"
          role="img"
          aria-label={`Net sales per day, last 30 days: ${money(total)} in all`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={trend}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              barCategoryGap="25%"
            >
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="0" />
              <XAxis
                dataKey="day"
                tickFormatter={shortDay}
                interval={4}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <YAxis
                tickFormatter={compact}
                width={52}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.6 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]!.payload as Trend[number];
                  return (
                    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                      <p className="mb-1 font-medium text-foreground">
                        {shortDay(String(label))}
                      </p>
                      {SERIES.map((s) => (
                        <p
                          key={s.key}
                          className="flex items-center justify-between gap-4 text-muted-foreground"
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-sm"
                              style={{ background: s.color }}
                            />
                            {s.label}
                          </span>
                          <span className="tabular-nums text-foreground">
                            {money(d[s.key])}
                          </span>
                        </p>
                      ))}
                      <p className="mt-1 flex justify-between gap-4 border-t pt-1 font-medium text-foreground">
                        <span>Total</span>
                        <span className="tabular-nums">
                          {money(d.wholesaleMinor + d.counterMinor)}
                        </span>
                      </p>
                    </div>
                  );
                }}
              />
              {SERIES.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId="net"
                  fill={s.color}
                  // The 2px gap between stacked parts is a stroke in the card's own colour.
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                  radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={18}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
