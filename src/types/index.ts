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
  created_at: string
  updated_at: string
}
