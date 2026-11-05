export interface Profile {
  id: string
  first_name: string
  last_name: string
  phone: string
  student_id: string
  uw_email: string
  address: string
  discord: string
  role: 'member' | 'admin'
  /** Project group from the Drive group sheets, or null for none. Admin-facing; set only by the sync-member-groups function. */
  project_group: string | null
  /** How many people that group's sheet lists — 1 when not in a group. */
  project_group_size: number
  created_at: string
  updated_at: string
}
