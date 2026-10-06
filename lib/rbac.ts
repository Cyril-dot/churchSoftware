export type Role = 'admin' | 'manager' | 'cashier';

export interface Capability {
  sell: boolean;
  viewOwnSales: boolean;
  viewAllSales: boolean;
  viewCost: boolean;
  voidSale: boolean;
  manageInventory: boolean;
  adjustStock: boolean;
  managePurchases: boolean;
  manageDeposits: boolean;
  viewReports: boolean;
  manageUsers: boolean;
  manageSettings: boolean;
  viewAudit: boolean;
}

const CAPABILITIES: Record<Role, Capability> = {
  cashier: {
    sell: true, viewOwnSales: true, viewAllSales: false, viewCost: false,
    voidSale: false, manageInventory: false, adjustStock: false,
    managePurchases: false, manageDeposits: false, viewReports: false, manageUsers: false,
    manageSettings: false, viewAudit: false,
  },
  manager: {
    sell: true, viewOwnSales: true, viewAllSales: true, viewCost: true,
    voidSale: true, manageInventory: true, adjustStock: true,
    managePurchases: true, manageDeposits: true, viewReports: true, manageUsers: false,
    manageSettings: false, viewAudit: false,
  },
  admin: {
    sell: true, viewOwnSales: true, viewAllSales: true, viewCost: true,
    voidSale: true, manageInventory: true, adjustStock: true,
    managePurchases: true, manageDeposits: true, viewReports: true, manageUsers: true,
    manageSettings: true, viewAudit: true,
  },
};

export function can(role: Role, capability: keyof Capability): boolean {
  return CAPABILITIES[role]?.[capability] ?? false;
}

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  capability: keyof Capability | null; // null = visible to all authenticated
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: 'home', capability: null },
  { href: '/sell', label: 'Sell', icon: 'point_of_sale', capability: 'sell' },
  { href: '/sales', label: 'Sales', icon: 'receipt_long', capability: 'viewOwnSales' },
  { href: '/inventory', label: 'Items', icon: 'inventory_2', capability: 'manageInventory' },
  { href: '/purchases', label: 'Purchases', icon: 'shopping_bag', capability: 'managePurchases' },
  { href: '/deposits', label: 'Deposits', icon: 'account_balance', capability: 'manageDeposits' },
  { href: '/reports', label: 'Reports', icon: 'bar_chart', capability: 'viewReports' },
  { href: '/users', label: 'Users', icon: 'group', capability: 'manageUsers' },
  { href: '/settings', label: 'Settings', icon: 'settings', capability: 'manageSettings' },
  { href: '/guide', label: 'Guide', icon: 'menu_book', capability: null },
];

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.capability === null || can(role, item.capability));
}
