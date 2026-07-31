'use client'

import { Phone, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { logWhatsAppMessage } from '@/app/actions/whatsapp'

// Same wa.me deep-link pattern as SendReceiptButton/receipt.ts — no separate
// WhatsApp API integration, staff review and hit send from WhatsApp itself.
// Call is a plain tel: link (needs no JS at all); WhatsApp is a button since
// it also logs the send to whatsapp_logs for the WhatsApp page's history.
export default function ContactButtons({
  memberId,
  mobile,
  message,
  messageType,
}: {
  memberId: string
  mobile: string
  message: string
  messageType: 'due_today' | 'due_in_3_days' | 'expired' | 'custom'
}) {
  function handleWhatsApp() {
    const cleanedPhone = '91' + mobile.replace(/\D/g, '').replace(/^0/, '')
    const url = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
    logWhatsAppMessage(memberId, mobile, message, messageType).catch(console.error)
    toast.success('Message opened in WhatsApp')
  }

  return (
    <div className="inline-flex items-center gap-1.5 flex-shrink-0">
      <a
        href={`tel:${mobile}`}
        title={`Call ${mobile}`}
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-colors"
      >
        <Phone className="w-3.5 h-3.5" />
      </a>
      <button
        type="button"
        onClick={handleWhatsApp}
        title="Send WhatsApp message"
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors"
      >
        <MessageCircle className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
