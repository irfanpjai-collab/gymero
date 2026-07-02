import { getSalaries } from '@/app/actions/salary'
import SalaryClient from './salary-client'

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default async function SalaryPage() {
  const currentMonth = getCurrentMonth()
  const salaries = await getSalaries(currentMonth)
  return <SalaryClient initialSalaries={salaries} initialMonth={currentMonth} />
}
