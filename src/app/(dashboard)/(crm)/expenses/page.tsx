import { getExpenses } from '@/app/actions/expenses'
import ExpensesClient from './expenses-client'

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default async function ExpensesPage() {
  const currentMonth = getCurrentMonth()
  const expenses = await getExpenses(currentMonth)
  return <ExpensesClient initialExpenses={expenses} initialMonth={currentMonth} />
}
