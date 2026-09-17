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

/**
 * THE module registry.
 *
 * One typed source drives the sidebar, each module's landing-page cards, and (from Day 3) the
 * route guards. Because the guard reads the same `permission` as the menu, a screen cannot
 * appear in a menu it is not permitted for — which is precisely the bug in the retail app,
 * where menus are ungated and every item is clickable by everyone.
 *
 * `permission` values become `Permission` (from @shared/permissions) on Day 2; they are plain
 * strings today only because the catalog does not exist yet.
 */
export interface ModuleScreen {
  label: string;
  path: string;
  permission: string;
  description: string;
  /** Cleared as each screen lands, day by day. */
  comingSoon?: boolean;
}

export interface ModuleDef {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  permission: string;
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
    permission: 'dashboard:read',
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
        comingSoon: true,
      },
      {
        label: 'Price lists',
        path: '/catalog/price-lists',
        permission: 'priceList:read',
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
        permission: 'payment:create',
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
    permission: 'report:read',
    landsOnDay: 37,
    screens: [],
  },
  {
    key: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: Settings,
    permission: 'settings:read',
    landsOnDay: 4,
    screens: [
      {
        label: 'Users & roles',
        path: '/settings/users',
        permission: 'user:read',
        description: 'Accounts and the permission matrix',
        comingSoon: true,
      },
      {
        label: 'Locations',
        path: '/settings/locations',
        permission: 'location:read',
        description: 'Warehouses, counters and damage stores',
        comingSoon: true,
      },
    ],
  },
];
