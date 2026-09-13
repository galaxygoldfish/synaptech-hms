import '../styles.css'
import { ManageEmails } from '../components/admin-dashboard/ManageEmails'

export default function AdminManageAdminEmailsPage() {
  return <ManageEmails heading="Manage admin-facing emails" listPath="/adminHome/emails/admin" category="admin" />
}
