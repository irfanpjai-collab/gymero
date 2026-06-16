'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileText,
  Loader2,
  ChevronDown,
} from 'lucide-react'
import { getMember, updateMember } from '@/app/actions/members'
import type { Member } from '@/types'

// ── Reusable field wrapper ────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
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

const inputCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors'

const selectCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-xl text-sm text-foreground transition-colors appearance-none'

// ── Page ─────────────────────────────────────────────────────────────────────

type Params = Promise<{ id: string }>

export default function EditMemberPage({ params }: { params: Params }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  const [id, setId] = useState<string>('')

  useEffect(() => {
    params.then(({ id: memberId }) => {
      setId(memberId)
      getMember(memberId).then((m) => {
        setMember(m)
        setLoading(false)
      })
    })
  }, [params])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!id) return
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await updateMember(id, formData)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Member updated successfully!')
      router.push(`/members/${id}`)
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading member…</span>
      </div>
    )
  }

  if (!member) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href="/members"
            className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-card border border-border hover:bg-muted text-muted-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">Member Not Found</h1>
        </div>
        <p className="text-muted-foreground text-sm">This member does not exist or was deleted.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/members/${id}`}
          className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-card border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Edit Member</h1>
          <p className="text-muted-foreground text-xs mt-0.5">
            #{member.member_id} · {member.full_name}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Member info card */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">Member Information</h2>
          </div>

          {/* Member ID (read-only) + Full Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Member ID">
              <input
                type="text"
                value={`#${member.member_id}`}
                disabled
                className={`${inputCls} opacity-50 cursor-not-allowed`}
              />
            </Field>
            <Field label="Full Name" required>
              <input
                type="text"
                name="full_name"
                required
                defaultValue={member.full_name}
                placeholder="e.g. Rahul Sharma"
                className={inputCls}
              />
            </Field>
          </div>

          {/* Mobile + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Mobile" required>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
                <input
                  type="tel"
                  name="mobile"
                  required
                  defaultValue={member.mobile}
                  placeholder="9876543210"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </Field>
            <Field label="Email">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
                <input
                  type="email"
                  name="email"
                  defaultValue={member.email ?? ''}
                  placeholder="rahul@example.com"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </Field>
          </div>

          {/* Address */}
          <Field label="Address">
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
              <input
                type="text"
                name="address"
                defaultValue={member.address ?? ''}
                placeholder="Street, City"
                className={`${inputCls} pl-9`}
              />
            </div>
          </Field>

          {/* Gender + Date Joined */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Gender" required>
              <div className="relative">
                <select
                  name="gender"
                  required
                  defaultValue={member.gender}
                  className={selectCls}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </Field>
            <Field label="Date Joined" required>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  name="join_date"
                  required
                  defaultValue={member.join_date?.slice(0, 10) ?? ''}
                  className={`${inputCls} pl-9`}
                />
              </div>
            </Field>
          </div>

          {/* Notes */}
          <Field label="Notes">
            <div className="relative">
              <FileText className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
              <textarea
                name="notes"
                rows={3}
                defaultValue={member.notes ?? ''}
                placeholder="Any additional notes..."
                className={`${inputCls} pl-9 resize-none min-h-[80px]`}
              />
            </div>
          </Field>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <Link
            href={`/members/${id}`}
            className="px-5 py-2.5 text-sm border border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
