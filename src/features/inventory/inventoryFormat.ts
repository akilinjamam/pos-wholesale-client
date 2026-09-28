import type { StatusTone } from '@/components/common/StatusPill';
import type { StockMovementType } from '@shared/enums';

/** How each movement reads on screen — what a storekeeper would call it. */
export const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  OPENING: 'Opening',
  GRN: 'Goods receipt',
  PURCHASE_RETURN: 'Purchase return',
  SALE: 'Sale',
  SALE_RETURN: 'Sale return',
  TRANSFER_OUT: 'Transfer out',
  TRANSFER_IN: 'Transfer in',
  ADJUSTMENT: 'Adjustment',
  DAMAGE: 'Damage',
  COUNT: 'Count variance',
};

export const MOVEMENT_TONE: Record<StockMovementType, StatusTone> = {
  OPENING: 'info',
  GRN: 'success',
  PURCHASE_RETURN: 'warning',
  SALE: 'neutral',
  SALE_RETURN: 'success',
  TRANSFER_OUT: 'neutral',
  TRANSFER_IN: 'info',
  ADJUSTMENT: 'warning',
  DAMAGE: 'danger',
  COUNT: 'warning',
};

/** `+12` / `−3` — a real minus sign, so negative quantities line up and read as numbers. */
export function signed(n: number): string {
  return n > 0 ? `+${n.toLocaleString()}` : n < 0 ? `−${Math.abs(n).toLocaleString()}` : '0';
}

export const today = () => new Date().toISOString().slice(0, 10);
