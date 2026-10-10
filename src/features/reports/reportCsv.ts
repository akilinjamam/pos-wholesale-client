/** A byte-order mark, so Excel opens ৳ and Bangla names as UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/** CSV download for any report table — the same columns the screen shows. */
export function downloadCsv(
  filename: string,
  header: string[],
  rows: (string | number | null)[][],
) {
  const cell = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  const blob = new Blob([`${BOM}${text}\n`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const pad = (n: number) => String(n).padStart(2, '0');
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const monthStart = () => `${today().slice(0, 8)}01`;

/** The period (and location) in words, for a printed report's subtitle. */
export const periodText = (from: string, to: string, location?: string) =>
  `${from} to ${to}${location ? ` · ${location}` : ''}`;
