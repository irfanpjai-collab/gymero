import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays, isPast, isToday, addDays } from 'date-fns'

/** Default grace period in days — members can rejoin without admission fee within this window */
export const DEFAULT_GRACE_PERIOD_DAYS = 180

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd MMM yyyy')
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

export function getMembershipStatus(
  expiryDate: string,
  gracePeriodDays: number = DEFAULT_GRACE_PERIOD_DAYS
): 'active' | 'expiring_soon' | 'grace_period' | 'expired' {
  const expiry = new Date(expiryDate)
  if (isPast(expiry) && !isToday(expiry)) {
    const daysSinceExpiry = differenceInDays(new Date(), expiry)
    if (daysSinceExpiry <= gracePeriodDays) return 'grace_period'
    return 'expired'
  }
  if (differenceInDays(expiry, new Date()) <= 7) return 'expiring_soon'
  return 'active'
}

export function getDaysUntilExpiry(expiryDate: string): number {
  return differenceInDays(new Date(expiryDate), new Date())
}

export function getDaysSinceExpiry(expiryDate: string): number {
  return differenceInDays(new Date(), new Date(expiryDate))
}

export function isWithinGracePeriod(
  expiryDate: string,
  gracePeriodDays: number = DEFAULT_GRACE_PERIOD_DAYS
): boolean {
  const expiry = new Date(expiryDate)
  if (!isPast(expiry) || isToday(expiry)) return false
  return differenceInDays(new Date(), expiry) <= gracePeriodDays
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'active': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    case 'expiring_soon': return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    case 'grace_period': return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
    case 'expired': return 'text-red-400 bg-red-500/10 border-red-500/20'
    case 'converted': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    case 'new': return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
    case 'contacted': return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    case 'lost': return 'text-red-400 bg-red-500/10 border-red-500/20'
    default: return 'text-muted-foreground bg-muted border-border'
  }
}

export function getTodayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function getExpiryDateFromPlan(startDate: string, durationMonths: number): string {
  const start = new Date(startDate)
  start.setMonth(start.getMonth() + durationMonths)
  return format(start, 'yyyy-MM-dd')
}

export function isDueToday(expiryDate: string): boolean {
  return isToday(new Date(expiryDate))
}

export function isDueIn3Days(expiryDate: string): boolean {
  const days = getDaysUntilExpiry(expiryDate)
  return days >= 0 && days <= 3
}

export function getNextMemberId(existingIds: number[]): number {
  if (existingIds.length === 0) return 100
  return Math.max(...existingIds) + 1
}

export function formatPhoneForWhatsApp(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('91')) return cleaned
  if (cleaned.startsWith('0')) return '91' + cleaned.slice(1)
  return '91' + cleaned
}
