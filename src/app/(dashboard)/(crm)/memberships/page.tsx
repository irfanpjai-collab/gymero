import { getCachedPlans } from '@/lib/cached-queries'
import { revalidateMembershipsData } from '@/app/actions/memberships'
import TableRealtimeRefresh from '@/components/shared/TableRealtimeRefresh'
import MembershipsClient from './memberships-client'

export default async function MembershipsPage() {
  const plans = await getCachedPlans()
  return (
    <>
      <TableRealtimeRefresh channelName="memberships_page_live" tables={['membership_plans']} onChange={revalidateMembershipsData} />
      <MembershipsClient initialPlans={plans} />
    </>
  )
}
