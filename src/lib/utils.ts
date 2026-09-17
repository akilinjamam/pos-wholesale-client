import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, with later Tailwind utilities winning over earlier conflicting ones.
 * The shadcn/ui convention — every component takes a `className` and merges it through here.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
