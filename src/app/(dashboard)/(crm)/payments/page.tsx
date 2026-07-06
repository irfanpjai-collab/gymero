import { getPayments, getMonthlyRevenue, getPaymentsSummary } from '@/app/actions/payments'
import PaymentsClient from './payments-client'

export default async function PaymentsPage() {
  const [payments, monthlyRevenue, summary] = await Promise.all([
    getPayments(),
    getMonthlyRevenue(),
    getPaymentsSummary(),
  ])
  return <PaymentsClient initialPayments={payments} initialMonthlyRevenue={monthlyRevenue} initialSummary={summary} />
}
