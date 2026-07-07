import { getCachedCoaches, getCachedPtPlans } from '@/lib/cached-queries'
import { revalidateCoachesData } from '@/app/actions/coaches'
import TableRealtimeRefresh from '@/components/shared/TableRealtimeRefresh'
import CoachesClient from './coaches-client'

export default async function CoachesPage() {
  const [coaches, ptPlans] = await Promise.all([getCachedCoaches(), getCachedPtPlans()])
  return (
    <>
      <TableRealtimeRefresh channelName="coaches_page_live" tables={['coaches', 'pt_plans']} onChange={revalidateCoachesData} />
      <CoachesClient initialCoaches={coaches} ptPlans={ptPlans} />
    </>
  )
}
