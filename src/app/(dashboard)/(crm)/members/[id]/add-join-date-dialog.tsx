'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarPlus, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { updateMember } from '@/app/actions/members'

const inputCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors'

// Shown only when a member has no join date on file at all (e.g. synced from
// the Google Form intake sheet before that column was filled in — see
// form-intake-sync.ts, which deliberately leaves it blank rather than
// guessing the sync date). No default value is pre-filled here either, for
// the same reason — staff must pick the real date, not accept a guess.
export default function AddJoinDateDialog({ memberId }: { memberId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [joinDate, setJoinDate] = useState('')

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) setJoinDate('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!joinDate) return

    startTransition(async () => {
      const formData = new FormData()
      formData.set('join_date', joinDate)
      const result = await updateMember(memberId, formData)

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success('Join date added')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <CalendarPlus className="w-3 h-3" />
        Add join date
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <CalendarPlus className="w-4 h-4 text-primary" />
              Add Join Date
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Join Date<span className="text-red-400 ml-0.5">*</span>
              </label>
              <input
                type="date"
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
                required
                className={inputCls}
              />
            </div>

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm border border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !joinDate}
                className="inline-flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {isPending ? (<><Loader2 className="w-4 h-4 animate-spin" />Saving…</>) : 'Save'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
