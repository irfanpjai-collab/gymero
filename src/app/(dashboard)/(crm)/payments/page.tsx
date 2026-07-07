import { getCachedPaymentsList, getCachedMonthlyRevenue, getCachedPaymentsSummary } from '@/lib/cached-queries'
import { revalidatePaymentsData } from '@/app/actions/payments'
import TableRealtimeRefresh from '@/components/shared/TableRealtimeRefresh'
import PaymentsClient from './payments-client'

export default async function PaymentsPage() {
  const [payments, monthlyRevenue, summary] = await Promise.all([
    getCachedPaymentsList(),
    getCachedMonthlyRevenue(),
    getCachedPaymentsSummary(),
  ])
  return (
    <>
      <TableRealtimeRefresh channelName="payments_page_live" tables={['payments']} onChange={revalidatePaymentsData} />
      <PaymentsClient initialPayments={payments} initialMonthlyRevenue={monthlyRevenue} initialSummary={summary} />
    </>
  )
}
