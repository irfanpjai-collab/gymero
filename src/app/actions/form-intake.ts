'use server'

import { requireRole } from '@/lib/auth'
import { runFormIntakeSync, type FormIntakeSyncResult } from '@/lib/form-intake-sync'

// Manual trigger for the same sync the nightly cron runs (see
// src/app/api/cron/sync-form-intake/route.ts) — lets staff pull in new/edited
// form submissions on demand instead of waiting for the 4am run.
export async function syncFormIntakeNow(): Promise<FormIntakeSyncResult> {
  await requireRole(['admin', 'receptionist'])
  return runFormIntakeSync()
}
