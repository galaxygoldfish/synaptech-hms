import type { ActionGroup } from '../types';

export const actionGroups: ActionGroup[] = [
  {
    category: 'Inventory',
    items: [
      { id: 'manage-inventory', label: 'Manage hardware inventory', icon: 'inventory', category: 'Inventory' },
      { id: 'add-item',         label: 'Add a new item',             icon: 'add',       category: 'Inventory' },
      { id: 'get-labels',       label: 'Get hardware labels',        icon: 'label',     category: 'Inventory' },
    ],
  },
  {
    category: 'Hardware loans',
    items: [
      { id: 'checkout-hardware', label: 'Check out hardware',    icon: 'checkout', category: 'Hardware loans' },
      { id: 'return-hardware',   label: 'Return hardware',       icon: 'return',   category: 'Hardware loans' },
      { id: 'view-loans',        label: 'View hardware loans',   icon: 'list',     category: 'Hardware loans' },
    ],
  },
  {
    category: 'Members',
    items: [
      { id: 'view-members',   label: 'View registered users',       icon: 'members', category: 'Members' },
    ],
  },
  {
    category: 'Notifications',
    items: [
      { id: 'configure-member-emails', label: 'Member-facing emails', icon: 'mail-member', category: 'Notifications' },
      { id: 'configure-admin-emails',  label: 'Admin-facing emails',  icon: 'mail-admin',  category: 'Notifications' },
      { id: 'automated-email-log',     label: 'Sent email log',       icon: 'mail-log',    category: 'Notifications' },
    ],
  },
];
