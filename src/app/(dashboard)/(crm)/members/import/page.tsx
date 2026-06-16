'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Download, Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { importMembers } from '@/app/actions/members'
import type { ImportMemberRow } from '@/types'
import { Button } from '@/components/ui/button'

const TEMPLATE_COLUMNS = ['Member ID', 'Full Name', 'Mobile', 'Join Date', 'Plan Name', 'Expiry Date', 'Amount Paid', 'Notes']

function downloadTemplate() {
  const sampleData = [
    { 'Member ID': 100, 'Full Name': 'John Doe', 'Mobile': '9876543210', 'Join Date': '2024-01-01', 'Plan Name': 'Monthly', 'Expiry Date': '2024-02-01', 'Amount Paid': 1000, 'Notes': '' },
    { 'Member ID': 274, 'Full Name': 'Jane Smith', 'Mobile': '9876543211', 'Join Date': '2024-02-15', 'Plan Name': 'Quarterly', 'Expiry Date': '2024-05-15', 'Amount Paid': 2700, 'Notes': 'Existing member' },
  ]
  const ws = XLSX.utils.json_to_sheet(sampleData)
  const colWidths = [12, 20, 14, 14, 14, 14, 14, 20]
  ws['!cols'] = colWidths.map(w => ({ wch: w }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Members')
  XLSX.writeFile(wb, 'fitness-gym-import-template.xlsx')
}

function parseRow(row: Record<string, unknown>): ImportMemberRow | null {
  const name = String(row['Full Name'] ?? row['full_name'] ?? '').trim()
  const mobile = String(row['Mobile'] ?? row['mobile'] ?? '').trim()
  if (!name || !mobile) return null
  return {
    member_id: row['Member ID'] ? Number(row['Member ID']) : undefined,
    full_name: name,
    mobile,
    join_date: row['Join Date'] ? String(row['Join Date']) : undefined,
    plan_name: row['Plan Name'] ? String(row['Plan Name']).trim() : undefined,
    expiry_date: row['Expiry Date'] ? String(row['Expiry Date']) : undefined,
    amount_paid: row['Amount Paid'] ? Number(row['Amount Paid']) : undefined,
    notes: row['Notes'] ? String(row['Notes']) : undefined,
  }
}

export default function ImportPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ImportMemberRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null)
  const [pending, startTransition] = useTransition()

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result
        const wb = XLSX.read(data, { type: 'binary', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(ws, { raw: false }) as Record<string, unknown>[]
        const parsed: ImportMemberRow[] = []
        const errors: string[] = []
        json.forEach((row, i) => {
          const result = parseRow(row)
          if (result) {
            parsed.push(result)
          } else {
            errors.push(`Row ${i + 2}: Missing name or mobile`)
          }
        })
        setRows(parsed)
        setParseErrors(errors)
        setStep('preview')
      } catch {
        toast.error('Failed to parse file. Please use the template.')
      }
    }
    reader.readAsBinaryString(file)
  }

  function handleImport() {
    startTransition(async () => {
      const res = await importMembers(rows)
      setResult(res)
      setStep('done')
      if (res.imported > 0) toast.success(`${res.imported} members imported`)
    })
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/members" className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Import Members</h1>
          <p className="text-muted-foreground text-sm">Import existing members from Excel or CSV</p>
        </div>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-3 mb-2">
        {[{n: 1, label: 'Download Template'}, {n: 2, label: 'Upload File'}, {n: 3, label: 'Preview & Import'}].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${step === 'done' || (step === 'preview' && s.n <= 2) || (step === 'upload' && s.n <= 1) ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground'}`}>
              {s.n}
            </div>
            <span className="text-muted-foreground text-sm">{s.label}</span>
            {i < 2 && <div className="w-8 h-px bg-border" />}
          </div>
        ))}
      </div>

      {/* Step 1: Download Template */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Download className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-foreground font-semibold">Step 1: Download Template</h2>
            <p className="text-muted-foreground text-sm">Download and fill in the Excel template</p>
          </div>
        </div>
        <div className="bg-muted/30 rounded-xl p-4 mb-4">
          <p className="text-muted-foreground text-xs font-medium mb-2">Template columns:</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_COLUMNS.map(col => (
              <span key={col} className="text-xs bg-card border border-border text-muted-foreground px-2 py-1 rounded-lg">{col}</span>
            ))}
          </div>
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          <FileSpreadsheet className="w-4 h-4" /> Download Template
        </Button>
      </div>

      {/* Step 2: Upload */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-foreground font-semibold">Step 2: Upload Your File</h2>
            <p className="text-muted-foreground text-sm">Upload your filled Excel (.xlsx) or CSV file</p>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" onChange={handleFile} className="hidden" />
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-8 text-center transition-colors group"
        >
          <Upload className="w-8 h-8 text-muted-foreground/60 group-hover:text-primary mx-auto mb-2 transition-colors" />
          <p className="text-muted-foreground font-medium">{fileName || 'Click to select file'}</p>
          <p className="text-muted-foreground/50 text-sm mt-1">Supports .xlsx, .xls, .csv</p>
        </button>
      </div>

      {/* Step 3: Preview */}
      {step !== 'upload' && step !== 'done' && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-foreground font-semibold">Preview ({rows.length} rows)</h2>
              {parseErrors.length > 0 && <p className="text-red-400 text-sm mt-0.5">{parseErrors.length} row(s) skipped</p>}
            </div>
            <Button onClick={handleImport} disabled={pending || rows.length === 0}>
              {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : `Import ${rows.length} Members`}
            </Button>
          </div>
          {parseErrors.length > 0 && (
            <div className="px-5 py-3 bg-red-500/5 border-b border-border">
              {parseErrors.map((e, i) => <p key={i} className="text-red-400 text-xs">{e}</p>)}
            </div>
          )}
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  {['ID', 'Name', 'Mobile', 'Join Date', 'Plan', 'Expiry', 'Amount'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 text-muted-foreground">{row.member_id ?? 'Auto'}</td>
                    <td className="px-4 py-2.5 text-foreground font-medium">{row.full_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.mobile}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.join_date ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.plan_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.expiry_date ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.amount_paid ? `₹${row.amount_paid}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Done */}
      {step === 'done' && result && (
        <div className={`rounded-2xl border p-6 ${result.errors.length === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-card border-border'}`}>
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle className="w-6 h-6 text-emerald-400" />
            <h2 className="text-foreground font-semibold">Import Complete</h2>
          </div>
          <p className="text-emerald-400 font-medium">{result.imported} members imported successfully</p>
          {result.errors.length > 0 && (
            <div className="mt-3">
              <p className="text-red-400 text-sm font-medium mb-1">{result.errors.length} errors:</p>
              {result.errors.map((e, i) => <p key={i} className="text-red-400 text-xs">{e}</p>)}
            </div>
          )}
          <div className="flex gap-3 mt-5">
            <Button onClick={() => router.push('/members')}>View Members</Button>
            <Button variant="outline" onClick={() => { setStep('upload'); setRows([]); setFileName(''); setResult(null) }}>Import More</Button>
          </div>
        </div>
      )}
    </div>
  )
}
