'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

interface MemberRow {
  member_id: number
  full_name: string
  mobile: string
  email: string | null
  gender: string
  join_date: string
  admission_fee: number | null
  notes: string | null
}

interface MembershipRow {
  start_date: string
  expiry_date: string
  amount: number
  status: string
  member: { member_id: number; full_name: string } | null
}

interface PaymentRow {
  payment_date: string
  receipt_number: string | null
  amount: number
  payment_method: string
  payment_type: string | null
  notes: string | null
  member: { member_id: number; full_name: string } | null
}

interface CoachRow {
  coach_id: string
  name: string
  mobile: string
  email: string | null
  specialization: string | null
  is_active: boolean
}

interface SalaryRow {
  staff_name: string
  staff_type: string
  month: string
  base_salary: number
  bonus: number
  deductions: number
  net_salary: number
  status: string
  paid_at: string | null
}

interface WhatsappRow {
  phone: string
  message_type: string
  sent_at: string
  status: string
  member: { member_id: number; full_name: string } | null
}

interface AttendanceRow {
  punched_at: string
  punch_type: number
  member: { member_id: number; full_name: string } | null
}

interface PlanRow {
  name: string
  duration_months: number
  fee: number
  description: string | null
  is_active: boolean
}

export interface DocumentCenterData {
  members:         MemberRow[]
  memberships:     MembershipRow[]
  payments:        PaymentRow[]
  coaches:         CoachRow[]
  staffSalaries:   SalaryRow[]
  whatsappLogs:    WhatsappRow[]
  attendanceLogs:  AttendanceRow[]
  membershipPlans: PlanRow[]
}

// Date-filtered tables use [startDate, endDate] inclusive. Coaches and plans are
// small reference lists — always exported in full regardless of the range.
export async function getDocumentCenterData(
  startDate: string,
  endDate: string
): Promise<{ data?: DocumentCenterData; error?: string }> {
  try {
    await requireRole(['admin'])
    const supabase = await createClient()

    const endExclusive = new Date(endDate)
    endExclusive.setDate(endExclusive.getDate() + 1)
    const endExclusiveStr = endExclusive.toISOString().slice(0, 10)

    const [
      membersRes,
      membershipsRes,
      paymentsRes,
      coachesRes,
      salariesRes,
      whatsappRes,
      attendanceRes,
      plansRes,
    ] = await Promise.all([
      supabase
        .from('members')
        .select('member_id, full_name, mobile, email, gender, join_date, admission_fee, notes')
        .gte('join_date', startDate)
        .lt('join_date', endExclusiveStr)
        .order('member_id'),
      supabase
        .from('memberships')
        .select('start_date, expiry_date, amount, status, member:members!memberships_member_id_fkey(member_id, full_name)')
        .gte('start_date', startDate)
        .lt('start_date', endExclusiveStr)
        .order('start_date', { ascending: false }),
      supabase
        .from('payments')
        .select('payment_date, receipt_number, amount, payment_method, payment_type, notes, member:members!payments_member_id_fkey(member_id, full_name)')
        .gte('payment_date', startDate)
        .lt('payment_date', endExclusiveStr)
        .order('payment_date', { ascending: false }),
      supabase
        .from('coaches')
        .select('coach_id, name, mobile, email, specialization, is_active')
        .order('name'),
      supabase
        .from('staff_salaries')
        .select('staff_name, staff_type, month, base_salary, bonus, deductions, net_salary, status, paid_at')
        .gte('month', startDate)
        .lt('month', endExclusiveStr)
        .order('month', { ascending: false }),
      supabase
        .from('whatsapp_logs')
        .select('phone, message_type, sent_at, status, member:members!whatsapp_logs_member_id_fkey(member_id, full_name)')
        .gte('sent_at', startDate)
        .lt('sent_at', endExclusiveStr)
        .order('sent_at', { ascending: false }),
      supabase
        .from('attendance_logs')
        .select('punched_at, punch_type, member:members!attendance_logs_member_id_fkey(member_id, full_name)')
        .gte('punched_at', startDate)
        .lt('punched_at', endExclusiveStr)
        .order('punched_at', { ascending: false }),
      supabase
        .from('membership_plans')
        .select('name, duration_months, fee, description, is_active')
        .order('duration_months'),
    ])

    const errors = [membersRes, membershipsRes, paymentsRes, coachesRes, salariesRes, whatsappRes, attendanceRes, plansRes]
      .map(r => r.error?.message)
      .filter((m): m is string => !!m)
    if (errors.length) throw new Error(errors.join('; '))

    return {
      data: {
        members:         (membersRes.data ?? []) as unknown as MemberRow[],
        memberships:     (membershipsRes.data ?? []) as unknown as MembershipRow[],
        payments:        (paymentsRes.data ?? []) as unknown as PaymentRow[],
        coaches:         (coachesRes.data ?? []) as unknown as CoachRow[],
        staffSalaries:   (salariesRes.data ?? []) as unknown as SalaryRow[],
        whatsappLogs:    (whatsappRes.data ?? []) as unknown as WhatsappRow[],
        attendanceLogs:  (attendanceRes.data ?? []) as unknown as AttendanceRow[],
        membershipPlans: (plansRes.data ?? []) as unknown as PlanRow[],
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}
