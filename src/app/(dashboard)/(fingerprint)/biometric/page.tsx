import { getBiometricPageData } from '@/app/actions/adms'
import BiometricClient from './biometric-client'

// Server-rendered so the most-visited page during walk-ins doesn't guarantee
// a loading-spinner flash on every navigation — BiometricClient used to fetch
// everything itself in a mount-time useEffect. Today's data only; the client
// component still fetches directly (bypassing this page) when staff pick a
// different date or trigger a manual refresh.
export default async function BiometricPage() {
  const initialData = await getBiometricPageData()
  return <BiometricClient initialData={initialData} />
}
