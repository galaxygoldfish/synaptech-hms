import type { MemberActionItem } from '../components/user-dashboard/types'

export const memberActions: MemberActionItem[] = [
  { id: 'browse-inventory', label: 'Browse our inventory', icon: 'browse' },
  { id: 'my-hardware-loans', label: 'My hardware loans', mobileLabel: 'My loan history', icon: 'loans' },
  { id: 'view-documentation', label: 'View documentation', icon: 'documentation', href: 'https://docs.google.com/document/d/1r8u324aK0K5jw2Q6le5pIwE5hPt6mjpNVcoFqHxvX7A/edit?usp=sharing' },
  { id: 'get-help-support', label: 'Get help & support', icon: 'support', href: 'https://discord.gg/zNKCN5233Y' },
]
