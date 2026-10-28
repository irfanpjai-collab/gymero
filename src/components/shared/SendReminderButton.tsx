'use client'

import { MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { expiredMembershipMessage, formatPhoneForWhatsApp } from '@/lib/utils'
import { logWhatsAppMessage } from '@/app/actions/whatsapp'

// Opens a wa.me deep link with a renewal reminder pre-filled, same pattern as
// SendReceiptButton and the due-date reminders on the WhatsApp page — no
// separate API integration, staff review and hit send from WhatsApp itself.
export default function SendReminderButton({
  memberId,
  fullName,
  mobile,
  expiryDate,
}: {
  memberId: string
  fullName: string
  mobile: string | null
  expiryDate: string | null
}) {
  if (!mobile) return null

  function handleSend() {
    const message = expiredMembershipMessage(fullName, expiryDate)
    const phone = formatPhoneForWhatsApp(mobile!)
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
    logWhatsAppMessage(memberId, mobile!, message, 'expired').catch(console.error)
    toast.success('Reminder opened in WhatsApp')
  }

  return (
    <button
      type="button"
      onClick={handleSend}
      title="Send renewal reminder via WhatsApp"
      className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
    >
      <MessageCircle className="w-3.5 h-3.5" />
      Send Reminder
    </button>
  )
}
