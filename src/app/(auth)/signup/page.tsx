import Link from 'next/link'

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/[0.04] blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="flex items-center justify-center w-52">
            <img
              src="/logo.png"
              alt="Green Power Fitness Center"
              className="w-full h-auto object-contain"
            />
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-7 shadow-lg shadow-black/40 text-center">
          <h2 className="text-lg font-bold text-foreground mb-2">Signups are disabled</h2>
          <p className="text-muted-foreground text-sm mb-6">
            New staff accounts are created by your gym administrator. Please contact them to get access.
          </p>
          <Link
            href="/login"
            className="inline-flex w-full justify-center py-2.5 bg-primary hover:bg-primary/95 text-primary-foreground rounded-xl font-bold transition-all shadow-md shadow-primary/10 hover:shadow-primary/20 text-sm"
          >
            Back to sign in
          </Link>
        </div>

        <div className="mt-4 text-center">
          <p className="text-muted-foreground/30 text-xs">Fitness ERP &copy; {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  )
}
