/** A project group as recorded on a profile: its name and how many people its sheet lists. */
export interface ProjectGroup {
  name: string
  size: number
}

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
  /**
   * Every project group the member is listed in on the Drive group sheets,
   * largest first; [] when none. Admin-facing; set only by the
   * sync-member-groups function.
   */
  project_groups: ProjectGroup[]
  created_at: string
  updated_at: string
}
