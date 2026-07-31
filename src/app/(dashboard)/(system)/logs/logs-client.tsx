'use client'

import { useState, useTransition } from 'react'
import { Search, RefreshCw, Loader2, ClipboardList } from 'lucide-react'
import { getAuditLog, type AuditLogEntry, type AuditLogFilters } from '@/app/actions/audit-log'
import { formatDateTime } from '@/lib/utils'

const inputCls =
  'w-full px-3 py-2.5 bg-background border border-border hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors'

const selectCls =
  'px-3 py-2.5 bg-background border border-border hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-xl text-sm text-foreground transition-colors'

const ACTION_STYLES: Record<string, string> = {
  create: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  update: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  delete: 'text-red-400 bg-red-500/10 border-red-500/20',
}

function entityTypeLabel(entityType: string): string {
  return entityType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function LogsClient({
  initialEntries,
  entityTypes,
}: {
  initialEntries: AuditLogEntry[]
  entityTypes: string[]
}) {
  const [entries, setEntries] = useState(initialEntries)
  const [search, setSearch] = useState('')
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [isPending, startTransition] = useTransition()

  function refresh(overrides: Partial<AuditLogFilters> = {}) {
    const filters: AuditLogFilters = {
      search: overrides.search ?? search,
      entityType: (overrides.entityType ?? entityType) || undefined,
      action: (overrides.action ?? action) as AuditLogFilters['action'] || undefined,
    }
    startTransition(async () => {
      const data = await getAuditLog(filters)
      setEntries(data)
    })
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <ClipboardList className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Activity Log</h1>
            <p className="text-muted-foreground text-xs mt-0.5">
              Every create/update/delete across the app — super admin only
            </p>
          </div>
        </div>
        <button
          onClick={() => refresh()}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-card border border-border hover:bg-muted rounded-xl text-xs text-muted-foreground transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by person or actor…"
            className={`${inputCls} pl-9`}
          />
        </div>
        <select
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); refresh({ entityType: e.target.value }) }}
          className={selectCls}
        >
          <option value="">All types</option>
          {entityTypes.map((t) => (
            <option key={t} value={t}>{entityTypeLabel(t)}</option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); refresh({ action: e.target.value as AuditLogFilters['action'] }) }}
          className={selectCls}
        >
          <option value="">All actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium transition-colors"
        >
          Search
        </button>
      </form>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <ClipboardList className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-muted-foreground text-sm">No log entries match this filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Time</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Actor</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Action</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Entity</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap font-mono text-xs">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-foreground font-medium truncate max-w-[140px]">{e.actorName ?? 'Unknown'}</p>
                      {e.actorRole && <p className="text-muted-foreground/60 text-xs capitalize">{e.actorRole.replace('_', ' ')}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${ACTION_STYLES[e.action] ?? ''}`}>
                        {e.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{entityTypeLabel(e.entityType)}</td>
                    <td className="px-4 py-3 text-foreground truncate max-w-[180px]">{e.entityLabel ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground/70 text-xs font-mono max-w-[280px] truncate" title={e.details ? JSON.stringify(e.details, null, 2) : undefined}>
                      {e.details ? JSON.stringify(e.details) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
