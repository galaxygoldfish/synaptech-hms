import '../styles.css'
import { ManageEmails } from '../components/admin-dashboard/ManageEmails'

export default function AdminManageUserEmailsPage() {
  return <ManageEmails heading="Manage user-facing emails" listPath="/adminHome/emails/user" category="user" />
}
