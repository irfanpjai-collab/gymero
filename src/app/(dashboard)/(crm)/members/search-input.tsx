'use client'

import { useState, useRef } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search } from 'lucide-react'

// Filters live as you type instead of requiring Enter — the old version was a
// plain <form method="GET"> that only ever navigated on submit. Debounced so
// fast typing doesn't fire a navigation per keystroke; router.replace (not
// push) so each keystroke doesn't pollute browser back-history.
export default function MembersSearchInput({ initialSearch }: { initialSearch?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(initialSearch ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(newValue: string) {
    setValue(newValue)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (newValue.trim()) params.set('search', newValue.trim())
      else params.delete('search')
      params.delete('page') // new search results — start back at page 1
      router.replace(`${pathname}?${params.toString()}`)
    }, 300)
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search by name, mobile, or member ID..."
        className="w-full pl-10 pr-4 py-2.5 bg-card border border-border hover:border-border-bright focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors"
      />
    </div>
  )
}
