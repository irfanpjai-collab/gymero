import { getCachedCoaches, getCachedPtPlans } from '@/lib/cached-queries'
import CoachesClient from './coaches-client'

export default async function CoachesPage() {
  const [coaches, ptPlans] = await Promise.all([getCachedCoaches(), getCachedPtPlans()])
  return <CoachesClient initialCoaches={coaches} ptPlans={ptPlans} />
}
