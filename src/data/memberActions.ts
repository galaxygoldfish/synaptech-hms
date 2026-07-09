import type { MemberActionItem } from '../components/user-dashboard/types'

export const memberActions: MemberActionItem[] = [
  { id: 'browse-inventory', label: 'Browse our inventory', icon: 'browse' },
  { id: 'my-hardware-loans', label: 'My hardware loans', mobileLabel: 'My loan history', icon: 'loans' },
  { id: 'view-documentation', label: 'View documentation', icon: 'documentation' },
  { id: 'get-help-support', label: 'Get help & support', icon: 'support' },
]
