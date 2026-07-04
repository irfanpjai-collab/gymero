import { getReportsOverview } from '@/app/actions/reports'
import { getCachedGracePeriodDays } from '@/lib/cached-queries'
import ReportsClient from './reports-client'

export default async function ReportsPage() {
  const [data, gracePeriodDays] = await Promise.all([
    getReportsOverview(),
    getCachedGracePeriodDays(),
  ])
  return (
    <ReportsClient
      initialMembers={data.members}
      initialPayments={data.payments}
      initialTotalSalaryPaid={data.totalSalaryPaid}
      initialTotalExpensesPaid={data.totalExpensesPaid}
      initialMonthlyRevenue={data.monthlyRevenue}
      gracePeriodDays={gracePeriodDays}
    />
  )
}
