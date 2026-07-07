import { formatDate, formatCurrency } from '@/lib/utils'
import { logWhatsAppMessage } from '@/app/actions/whatsapp'
import type { Payment } from '@/types'

// Deliberately not a stored image/PDF — WhatsApp messages are plain text
// anyway (it won't render HTML), and every field a receipt needs is already
// on the payment/member/membership rows themselves, so there's nothing to
// persist separately. Generated fresh each time "Send Receipt" is clicked.
export function buildReceiptMessage(payment: Payment): string {
  const lines: string[] = []
  lines.push('*Green Power Gym*')
  lines.push('Payment Receipt')
  lines.push('')
  if (payment.receipt_number) lines.push(`Receipt No: ${payment.receipt_number}`)
  lines.push(`Date: ${formatDate(payment.payment_date)}`)
  lines.push('')
  if (payment.member) lines.push(`Member: ${payment.member.full_name} (#${payment.member.member_id})`)

  if (payment.payment_type === 'admission') {
    lines.push('Payment for: Admission Fee')
  } else if (payment.payment_type === 'personal_training' && payment.pt_membership?.plan) {
    const p = payment.pt_membership.plan
    lines.push(`Payment for: ${p.name} (${p.duration_months}mo Personal Training)`)
  } else if (payment.membership?.plan) {
    const p = payment.membership.plan
    lines.push(`Payment for: ${p.name} (${p.duration_months}mo Membership)`)
  } else {
    lines.push('Payment for: Membership')
  }

  lines.push(`Amount: ${formatCurrency(payment.amount)}`)
  lines.push(`Method: ${payment.payment_method === 'upi' ? 'UPI' : payment.payment_method === 'bank_transfer' ? 'Bank Transfer' : 'Cash'}`)

  const expiryDate = payment.membership?.expiry_date ?? payment.pt_membership?.expiry_date
  if (expiryDate) {
    lines.push('')
    lines.push(`Valid until: ${formatDate(expiryDate)}`)
  }

  lines.push('')
  lines.push('Thank you for your payment!')

  return lines.join('\n')
}

// Shared by SendReceiptButton and any flow that wants to offer sending a
// receipt right after the payment that created it (e.g. RenewDialog) — only
// ever called from client-side event handlers, never during render/SSR.
export function sendReceiptViaWhatsApp(payment: Payment): boolean {
  const phone = payment.member?.mobile
  if (!phone) return false

  const message = buildReceiptMessage(payment)
  const cleanedPhone = '91' + phone.replace(/\D/g, '').replace(/^0/, '')
  const url = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`
  window.open(url, '_blank')
  logWhatsAppMessage(payment.member_id, phone, message, 'receipt').catch(console.error)
  return true
}
