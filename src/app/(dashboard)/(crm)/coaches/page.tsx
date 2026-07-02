import { getCoaches } from '@/app/actions/coaches'
import CoachesClient from './coaches-client'

export default async function CoachesPage() {
  const coaches = await getCoaches()
  return <CoachesClient initialCoaches={coaches} />
}
