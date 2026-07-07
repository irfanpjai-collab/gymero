import { getCachedPaymentsList, getCachedMonthlyRevenue, getCachedPaymentsSummary } from '@/lib/cached-queries'
import PaymentsClient from './payments-client'

export default async function PaymentsPage() {
  const [payments, monthlyRevenue, summary] = await Promise.all([
    getCachedPaymentsList(),
    getCachedMonthlyRevenue(),
    getCachedPaymentsSummary(),
  ])
  return <PaymentsClient initialPayments={payments} initialMonthlyRevenue={monthlyRevenue} initialSummary={summary} />
}
