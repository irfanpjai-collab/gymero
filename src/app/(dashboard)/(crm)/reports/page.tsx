import { getReportsOverview, revalidateReportsData } from '@/app/actions/reports'
import { getCachedGracePeriodDays } from '@/lib/cached-queries'
import TableRealtimeRefresh from '@/components/shared/TableRealtimeRefresh'
import ReportsClient from './reports-client'

export default async function ReportsPage() {
  const [data, gracePeriodDays] = await Promise.all([
    getReportsOverview(),
    getCachedGracePeriodDays(),
  ])
  return (
    <>
      <TableRealtimeRefresh
        channelName="reports_page_live"
        tables={['members', 'memberships', 'payments', 'staff_salaries', 'expenses']}
        onChange={revalidateReportsData}
      />
      <ReportsClient
        initialMembers={data.members}
        initialPayments={data.payments}
        initialTotalSalaryPaid={data.totalSalaryPaid}
        initialTotalExpensesPaid={data.totalExpensesPaid}
        initialMonthlyRevenue={data.monthlyRevenue}
        gracePeriodDays={gracePeriodDays}
      />
    </>
  )
}
