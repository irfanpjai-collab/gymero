'use client'

import { MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { buildReceiptMessage } from '@/lib/receipt'
import { logWhatsAppMessage } from '@/app/actions/whatsapp'
import type { Payment } from '@/types'

// Opens a wa.me deep link with the receipt pre-filled, same pattern as the
// due-date reminders on the WhatsApp page — no separate API integration,
// staff review and hit send from WhatsApp itself.
export default function SendReceiptButton({ payment }: { payment: Payment }) {
  const phone = payment.member?.mobile
  if (!phone) return null

  function handleSend() {
    const message = buildReceiptMessage(payment)
    const cleanedPhone = '91' + phone!.replace(/\D/g, '').replace(/^0/, '')
    const url = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
    logWhatsAppMessage(payment.member_id, phone!, message, 'receipt').catch(console.error)
    toast.success('Receipt opened in WhatsApp')
  }

  return (
    <button
      type="button"
      onClick={handleSend}
      title="Send receipt via WhatsApp"
      className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
    >
      <MessageCircle className="w-3.5 h-3.5" />
      Receipt
    </button>
  )
}
