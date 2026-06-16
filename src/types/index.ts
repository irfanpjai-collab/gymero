export type UserRole = 'admin' | 'receptionist' | 'coach'

export interface UserProfile {
  id: string
  user_id: string
  name: string
  email: string
  role: UserRole
  created_at: string
}

export interface Member {
  id: string
  member_id: number
  full_name: string
  mobile: string
  email?: string
  address?: string
  gender: 'male' | 'female' | 'other'
  join_date: string
  admission_fee?: number
  notes?: string
  created_at: string
  active_membership?: Membership
}

export interface MembershipPlan {
  id: string
  name: string
  duration_months: number
  fee: number
  description?: string
  is_active: boolean
}

export interface Membership {
  id: string
  member_id: string
  plan_id: string
  start_date: string
  expiry_date: string
  amount: number
  status: 'active' | 'expired' | 'cancelled'
  created_at: string
  member?: Member
  plan?: MembershipPlan
}

export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer'

export interface Payment {
  id: string
  member_id: string
  membership_id?: string
  amount: number
  payment_method: PaymentMethod
  payment_date: string
  payment_type?: 'membership' | 'admission'
  notes?: string
  receipt_number?: string
  created_at: string
  member?: Member
  membership?: Membership
}

export interface Coach {
  id: string
  coach_id: string
  name: string
  mobile: string
  email?: string
  specialization?: string
  is_active: boolean
  created_at: string
}


export interface WhatsAppLog {
  id: string
  member_id: string
  phone: string
  message: string
  message_type: 'due_today' | 'due_in_3_days' | 'expired' | 'custom'
  sent_at: string
  status: 'sent' | 'failed' | 'pending'
  member?: Member
}

export interface DashboardStats {
  totalMembers: number
  activeMembers: number
  expiredMembers: number
  gracePeriodMembers: number
  expiringThisWeek: number
  revenueThisMonth: number
  admissionFeeThisMonth: number
  dueToday: number
}

// ── Biometric Device (ESSL K90 Pro / ZKTeco) ────────────────

export interface BiometricStatus {
  connected: boolean
  serial?:   string
  host?:     string
  error?:    string
}

export interface BiometricUser {
  uid:       number
  user_id:   string
  name:      string
  privilege: number   // 0=user, 14=admin
}

export interface BiometricAttendance {
  user_id:   string
  timestamp: string
  status:    number
  punch:     number   // 0=check-in  1=check-out  4=OT-in  5=OT-out
  user_name?: string  // resolved client-side from BiometricUser list
}

export interface BiometricSyncResult {
  synced:   number
  skipped:  number
  total:    number
  message:  string
}

export interface BiometricAccessRow {
  device_uid:         number
  device_user_id:     string
  device_name:        string
  group_id:           string           // "0" = blocked  "1" = allowed
  crm_member_id:      string | null
  crm_name:           string | null
  membership_status:  string | null    // "active" | "expired" | "none" | null
  expiry_date:        string | null
  access:             'allowed' | 'blocked' | 'unmanaged'
}

export interface BiometricAccessSyncResult {
  blocked:    string[]
  unblocked:  string[]
  already_ok: number
  unmatched:  number
  errors:     string[]
  ran_at:     string
}

export interface BiometricPushStatus {
  crm_id:     string
  crm_name:   string
  mobile:     string
  on_device:  boolean
  device_uid: number | null
}

export interface BiometricPushResult {
  pushed:  number
  failed:  number
  results: { crm_id: string; name: string; success: boolean; uid?: number; error?: string }[]
}

// ─────────────────────────────────────────────────────────────

export interface ImportMemberRow {
  member_id?: number
  full_name: string
  mobile: string
  join_date?: string
  plan_name?: string
  expiry_date?: string
  amount_paid?: number
  admission_fee?: number
  balance?: number
  notes?: string
}
