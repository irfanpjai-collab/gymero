import { getPlans } from '@/app/actions/memberships'
import MembershipsClient from './memberships-client'

export default async function MembershipsPage() {
  const plans = await getPlans()
  return <MembershipsClient initialPlans={plans} />
}
