import { getPayments, getMonthlyRevenue } from '@/app/actions/payments'
import PaymentsClient from './payments-client'

export default async function PaymentsPage() {
  const [payments, monthlyRevenue] = await Promise.all([getPayments(), getMonthlyRevenue()])
  return <PaymentsClient initialPayments={payments} initialMonthlyRevenue={monthlyRevenue} />
}
