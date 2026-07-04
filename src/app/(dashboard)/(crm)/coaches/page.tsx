import { getCoaches } from '@/app/actions/coaches'
import { getPtPlans } from '@/app/actions/pt'
import CoachesClient from './coaches-client'

export default async function CoachesPage() {
  const [coaches, ptPlans] = await Promise.all([getCoaches(), getPtPlans()])
  return <CoachesClient initialCoaches={coaches} ptPlans={ptPlans} />
}
