'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Loader2, ChevronDown, Calendar, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { updateMembershipExpiry } from '@/app/actions/memberships'
import { getStaffForAttribution, type StaffOption } from '@/app/actions/staff'

const inputCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors'

const selectCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-xl text-sm text-foreground transition-colors appearance-none'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function EditExpiryDialog({
  membershipId,
  currentExpiryDate,
}: {
  membershipId: string
  currentExpiryDate: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [newExpiryDate, setNewExpiryDate] = useState(currentExpiryDate)
  const [reason, setReason] = useState('')
  const [editedByUserId, setEditedByUserId] = useState('')

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (v && staff.length === 0) {
      setLoadingStaff(true)
      getStaffForAttribution().then((data) => {
        setStaff(data)
        setLoadingStaff(false)
      })
    }
    if (!v) {
      setNewExpiryDate(currentExpiryDate)
      setReason('')
      setEditedByUserId('')
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim() || !editedByUserId) return

    startTransition(async () => {
      const result = await updateMembershipExpiry(membershipId, {
        new_expiry_date: newExpiryDate,
        reason: reason.trim(),
        edited_by_user_id: editedByUserId,
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success('Expiry date updated')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Edit expiry date"
        className="inline-flex items-center justify-center w-5 h-5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Pencil className="w-3 h-3" />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              Edit Expiry Date
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">
                This directly corrects the current membership record — it doesn&apos;t create a new one like a renewal does. Use this for fixing a mistake, not for extending a membership normally.
              </p>
            </div>

            <Field label="New Expiry Date" required>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  value={newExpiryDate}
                  onChange={(e) => setNewExpiryDate(e.target.value)}
                  required
                  className={`${inputCls} pl-9`}
                />
              </div>
            </Field>

            <Field label="Reason" required>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                placeholder="e.g. wrong plan was selected at renewal"
                className={inputCls}
              />
            </Field>

            <Field label="Edited By" required>
              {loadingStaff ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading staff…
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={editedByUserId}
                    onChange={(e) => setEditedByUserId(e.target.value)}
                    required
                    className={selectCls}
                  >
                    <option value="">Select staff member…</option>
                    {staff.map((s) => (
                      <option key={s.user_id} value={s.user_id}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              )}
            </Field>

            <DialogFooter className="pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm border border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !reason.trim() || !editedByUserId}
                className="inline-flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {isPending ? (<><Loader2 className="w-4 h-4 animate-spin" />Saving…</>) : 'Save Correction'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
