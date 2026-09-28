import { Select } from '@/components/ui/select';
import { useMyLocations } from '@/hooks/data/useLocations';

/**
 * A location picker limited to **the caller's own** locations — the server would refuse any
 * other (`requireLocation`), so offering them would only produce a 403.
 */
export function LocationFilter({
  value,
  onChange,
  allLabel = 'All my locations',
  includeAll = true,
  excludeTransit = false,
  className = 'w-48',
  label = 'Location',
}: {
  value: string;
  onChange: (id: string) => void;
  allLabel?: string;
  includeAll?: boolean;
  excludeTransit?: boolean;
  className?: string;
  label?: string;
}) {
  const { data: locations } = useMyLocations();
  const options = (locations ?? []).filter(
    (l) => l.isActive && (!excludeTransit || l.type !== 'TRANSIT'),
  );

  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      aria-label={label}
    >
      {includeAll && <option value="">{allLabel}</option>}
      {!includeAll && !value && <option value="">Choose…</option>}
      {options.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name} ({l.code})
        </option>
      ))}
    </Select>
  );
}
