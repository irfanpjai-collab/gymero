'use client'

import { MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { sendReceiptViaWhatsApp } from '@/lib/receipt'
import type { Payment } from '@/types'

// Opens a wa.me deep link with the receipt pre-filled, same pattern as the
// due-date reminders on the WhatsApp page — no separate API integration,
// staff review and hit send from WhatsApp itself.
export default function SendReceiptButton({ payment }: { payment: Payment }) {
  if (!payment.member?.mobile) return null

  function handleSend() {
    if (sendReceiptViaWhatsApp(payment)) {
      toast.success('Receipt opened in WhatsApp')
    }
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
