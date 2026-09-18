import type { MemberLoanItem, MemberLoanState } from '../../lib/memberLoans'
import styles from './LoanStatusBadge.module.css'

/**
 * The pill that says what a member's loan is doing. Shared by the list and
 * the detail screen so a loan can never describe itself two ways.
 *
 * The colours are the admin list's badge palette (HardwareLoans.module.css),
 * because an admin and a member looking at the same loan should see the same
 * colour for it — with one addition, the pink "Return soon!", which has no
 * admin equivalent: to an admin that loan is simply still out.
 */

const STATE_CLASS: Record<MemberLoanState, string> = {
  checkout_requested: styles.requested,
  cancelled: styles.closed,
  denied: styles.denied,
  active: styles.active,
  return_soon: styles.returnSoon,
  return_requested: styles.returnRequested,
  overdue: styles.overdue,
  returned: styles.closed,
}

/** "6.23.26" — the compact form the wireframes use inside this pill. */
function formatShortDate(iso: string): string {
  const date = new Date(iso)
  return `${date.getMonth() + 1}.${date.getDate()}.${date.getFullYear() % 100}`
}

export function memberLoanStateLabel(state: MemberLoanState, item: MemberLoanItem): string {
  switch (state) {
    // The only label carrying a date: a request has no other dates to show,
    // and how long it has been waiting is the thing a member wants to know.
    case 'checkout_requested':
      return `Checkout requested on ${formatShortDate(item.requestedAt)}`
    case 'cancelled':
      return 'Cancelled'
    case 'denied':
      return 'Not approved'
    case 'active':
      return 'Active'
    case 'return_soon':
      return 'Return soon!'
    case 'return_requested':
      return 'Processing return request'
    case 'overdue':
      return 'Overdue - disciplinary action may be pursued'
    case 'returned':
      return 'Returned'
  }
}

interface LoanStatusBadgeProps {
  state: MemberLoanState
  item: MemberLoanItem
}

export function LoanStatusBadge({ state, item }: LoanStatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${STATE_CLASS[state]}`}>
      {memberLoanStateLabel(state, item)}
    </span>
  )
}
