import { AlertTriangle, Phone } from 'lucide-react'
import { getFormIntakeIssues, getAvailableMemberIds } from '@/app/actions/form-intake'
import { formatDateTime } from '@/lib/utils'

// Two kinds of row show up here, both from the last form-intake sync: rows
// that couldn't create/update because of a data-entry problem in the sheet
// (most commonly someone typing the wrong Member ID — fix in the sheet and
// re-sync), and duplicate members detected by matching mobile number (fix
// directly in the CRM — re-syncing the sheet won't resolve those). Shown
// only when there's something to look at; disappears on its own once
// resolved, since runFormIntakeSync fully replaces this list every run.
export default async function IntakeIssuesSection() {
  const [issues, availableIds] = await Promise.all([
    getFormIntakeIssues(),
    getAvailableMemberIds(),
  ])

  if (issues.length === 0) return null

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-amber-500/20 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Error Members — {issues.length} issue{issues.length !== 1 ? 's' : ''} to review
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            Sheet rows that couldn&apos;t sync: fix the Member ID in the sheet, then press Sync from Form again.
            Duplicate members (matching mobile number): resolve directly here in the CRM instead.
            {availableIds.length > 0 && (
              <> Available IDs: <span className="font-mono text-foreground">{availableIds.join(', ')}</span></>
            )}
          </p>
        </div>
      </div>

      <div className="divide-y divide-amber-500/10">
        {issues.map((issue) => (
          <div key={issue.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-medium text-foreground min-w-[120px]">{issue.name || 'Unknown name'}</span>
            {issue.mobile && (
              <span className="text-muted-foreground text-xs inline-flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {issue.mobile}
              </span>
            )}
            <span className="text-muted-foreground text-xs font-mono">
              typed: {issue.attemptedMemberId || '—'}
            </span>
            <span className="text-amber-300 text-xs">{issue.reason}</span>
            <span className="text-muted-foreground/60 text-xs ml-auto whitespace-nowrap">
              {formatDateTime(issue.detectedAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
