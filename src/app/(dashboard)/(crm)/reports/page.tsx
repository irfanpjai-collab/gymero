import { getReportsOverview } from '@/app/actions/reports'
import ReportsClient from './reports-client'

export default async function ReportsPage() {
  const data = await getReportsOverview()
  return (
    <ReportsClient
      initialMembers={data.members}
      initialPayments={data.payments}
      initialTotalSalaryPaid={data.totalSalaryPaid}
      initialTotalExpensesPaid={data.totalExpensesPaid}
      initialMonthlyRevenue={data.monthlyRevenue}
    />
  )
}
