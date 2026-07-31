import { ShieldAlert } from 'lucide-react'
import { requireSuperAdmin } from '@/lib/auth'
import { getAuditLog, getAuditLogEntityTypes } from '@/app/actions/audit-log'
import LogsClient from './logs-client'

// Gated at the page level (not just hidden in the sidebar) — requireSuperAdmin
// throws for anyone else, so a regular admin navigating here directly by URL
// sees a clear "restricted" message instead of an empty table (getAuditLog
// itself also enforces this via the same check, but a page-level denial reads
// better than silently rendering zero rows).
export default async function LogsPage() {
  try {
    await requireSuperAdmin()
  } catch {
    return (
      <div className="max-w-md mx-auto flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground mb-1">Restricted to super admins</h2>
          <p className="text-muted-foreground text-sm">The activity log is only visible to super admin accounts.</p>
        </div>
      </div>
    )
  }

  const [entries, entityTypes] = await Promise.all([
    getAuditLog(),
    getAuditLogEntityTypes(),
  ])

  return <LogsClient initialEntries={entries} entityTypes={entityTypes} />
}
