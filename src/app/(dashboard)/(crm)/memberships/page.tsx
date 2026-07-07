import { getCachedPlans } from '@/lib/cached-queries'
import MembershipsClient from './memberships-client'

export default async function MembershipsPage() {
  const plans = await getCachedPlans()
  return <MembershipsClient initialPlans={plans} />
}
