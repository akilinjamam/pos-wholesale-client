import {
  BadgeDollarSign,
  Boxes,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { Permission } from '@shared/permissions';

/**
 * THE module registry.
 *
 * One typed source drives the sidebar, each module's landing-page cards, and (from Day 3) the
 * route guards. Because the guard reads the same `permission` as the menu, a screen cannot
 * appear in a menu it is not permitted for — which is precisely the bug in the retail app,
 * where menus are ungated and every item is clickable by everyone.
 *
 * `permission` is the `Permission` union from @shared/permissions, so a module pointing at a
 * capability that does not exist is a compile error rather than a menu entry that silently
 * never appears for anyone.
 *
 * `null` means "no permission required" — the dashboard, which every signed-in user sees.
 */
export interface ModuleScreen {
  label: string;
  path: string;
  permission: Permission;
  description: string;
  /** Cleared as each screen lands, day by day. */
  comingSoon?: boolean;
}

export interface ModuleDef {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  permission: Permission | null;
  /** The day from WORK-PLAN-DAYS.md on which this module's first screen lands. */
  landsOnDay: number;
  screens: ModuleScreen[];
}

export const MODULES: ModuleDef[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    path: '/',
    icon: LayoutDashboard,
    permission: null,
    landsOnDay: 1,
    screens: [],
  },
  {
    key: 'catalog',
    label: 'Catalog',
    path: '/catalog',
    icon: Package,
    permission: 'product:read',
    landsOnDay: 5,
    screens: [
      {
        label: 'Products',
        path: '/catalog/products',
        permission: 'product:read',
        description: 'Frames, sunglasses, lenses, accessories and machines',
      },
      {
        label: 'Brands & categories',
        path: '/catalog/organisation',
        permission: 'product:read',
        description: 'The labels and the tree products are filed under',
      },
      {
        label: 'Price lists',
        path: '/catalog/price-lists',
        permission: 'price:read',
        description: 'Tier and dealer pricing with quantity breaks',
        comingSoon: true,
      },
    ],
  },
  {
    key: 'dealers',
    label: 'Dealers',
    path: '/dealers',
    icon: Users,
    permission: 'dealer:read',
    landsOnDay: 10,
    screens: [
      {
        label: 'Dealers',
        path: '/dealers/list',
        permission: 'dealer:read',
        description: 'Accounts, credit limits, balances and ageing',
        comingSoon: true,
      },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    path: '/sales',
    icon: ShoppingCart,
    permission: 'order:read',
    landsOnDay: 23,
    screens: [
      {
        label: 'Orders',
        path: '/sales/orders',
        permission: 'order:read',
        description: 'Bulk orders from draft through to delivery',
        comingSoon: true,
      },
    ],
  },
  {
    key: 'dispatch',
    label: 'Dispatch',
    path: '/dispatch',
    icon: Truck,
    permission: 'dispatch:read',
    landsOnDay: 25,
    screens: [
      {
        label: 'Challans',
        path: '/dispatch/challans',
        permission: 'dispatch:read',
        description: 'Pick, pack, ship and confirm delivery',
        comingSoon: true,
      },
    ],
  },
  {
    key: 'counter',
    label: 'Counter',
    path: '/counter',
    icon: Store,
    permission: 'pos:sell',
    landsOnDay: 19,
    screens: [
      {
        label: 'Sale',
        path: '/counter/sale',
        permission: 'pos:sell',
        description: 'Walk-in cash-and-carry point of sale',
        comingSoon: true,
      },
    ],
  },
  {
    key: 'billing',
    label: 'Billing',
    path: '/billing',
    icon: FileText,
    permission: 'invoice:read',
    landsOnDay: 20,
    screens: [
      {
        label: 'Invoices',
        path: '/billing/invoices',
        permission: 'invoice:read',
        description: 'Wholesale and counter invoices',
        comingSoon: true,
      },
    ],
  },
  {
    key: 'receivables',
    label: 'Receivables',
    path: '/receivables',
    icon: BadgeDollarSign,
    permission: 'payment:read',
    landsOnDay: 29,
    screens: [
      {
        label: 'Receipts',
        path: '/receivables/receipts',
        permission: 'payment:receipt',
        description: 'Collections allocated against open invoices',
        comingSoon: true,
      },
      {
        label: 'Ageing',
        path: '/receivables/ageing',
        permission: 'payment:read',
        description: 'Who owes what, and how overdue it is',
        comingSoon: true,
      },
    ],
  },
  {
    key: 'purchase',
    label: 'Purchase',
    path: '/purchase',
    icon: ClipboardList,
    permission: 'po:read',
    landsOnDay: 34,
    screens: [
      {
        label: 'Purchase orders',
        path: '/purchase/orders',
        permission: 'po:read',
        description: 'Buying from manufacturers and importers',
        comingSoon: true,
      },
      {
        label: 'Goods receipt',
        path: '/purchase/grn',
        permission: 'grn:create',
        description: 'Receive stock with lot, expiry and serial capture',
        comingSoon: true,
      },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    path: '/inventory',
    icon: Boxes,
    permission: 'stock:read',
    landsOnDay: 16,
    screens: [
      {
        label: 'Stock on hand',
        path: '/inventory/stock',
        permission: 'stock:read',
        description: 'By warehouse, with reserved and available split',
        comingSoon: true,
      },
      {
        label: 'Stock ledger',
        path: '/inventory/ledger',
        permission: 'stock:read',
        description: 'Every movement, and why each number is what it is',
        comingSoon: true,
      },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    path: '/reports',
    icon: Receipt,
    permission: 'report:sales',
    landsOnDay: 37,
    screens: [],
  },
  {
    key: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: Settings,
    // `null`, not `user:read`. The module itself is a landing page that lists whichever of its
    // screens the caller may open, and the screens carry their own permissions — so an
    // ACCOUNTS user who holds `org:read` but not `user:read` still reaches the company profile.
    // Gating the module on one of its children's permissions would hide the other three.
    permission: null,
    landsOnDay: 4,
    screens: [
      {
        label: 'Users',
        path: '/settings/users',
        permission: 'user:read',
        description: 'Accounts, roles, location access and password resets',
      },
      {
        label: 'Roles',
        path: '/settings/roles',
        permission: 'role:read',
        description: 'What each role may do — the permission matrix',
      },
      {
        label: 'Locations',
        path: '/settings/locations',
        permission: 'location:read',
        description: 'Warehouses, counters, transit and damage stores',
      },
      {
        label: 'Company',
        path: '/settings/company',
        permission: 'org:read',
        description: 'Company profile, currency, and the business rules',
      },
    ],
  },
];

// ─── Lookups ────────────────────────────────────────────────────────────────────────────

/** Every screen across every module, flattened — the router builds its routes from this. */
export const ALL_SCREENS: readonly ModuleScreen[] = MODULES.flatMap((m) => m.screens);

/**
 * The module a path belongs to, longest prefix first.
 *
 * Prefix rather than equality, so `/settings/users` resolves to Settings — which is what the
 * topbar breadcrumb and the sidebar's active state both need. Sorting by length keeps `/` (the
 * dashboard) from swallowing everything.
 */
export function moduleForPath(pathname: string): ModuleDef | undefined {
  return [...MODULES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((m) => (m.path === '/' ? pathname === '/' : pathname.startsWith(m.path)));
}

export function screenForPath(pathname: string): ModuleScreen | undefined {
  return ALL_SCREENS.find((s) => s.path === pathname);
}
