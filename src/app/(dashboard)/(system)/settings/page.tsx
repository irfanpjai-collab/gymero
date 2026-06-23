'use client'

import { useState, useEffect, useCallback } from 'react'
import { Settings, CreditCard, Users, Save, Building, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getPlans, createPlan, updatePlan } from '@/app/actions/memberships'
import { createStaffUser } from '@/app/actions/staff'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { MembershipPlan, UserRole } from '@/types'
import { createClient } from '@/lib/supabase/client'

const TABS = ['General', 'Plans', 'Users'] as const
type TabType = typeof TABS[number]

interface GymSettings { 
  name: string; 
  address: string; 
  phone: string; 
  whatsappApiUrl: string; 
  whatsappToken: string;
  admissionFee: number;
  gracePeriodDays: number;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<TabType>('General')
  const [settings, setSettings] = useState<GymSettings>({
    name: 'Fitness Gym', 
    address: '', 
    phone: '', 
    whatsappApiUrl: '', 
    whatsappToken: '',
    admissionFee: 1000,
    gracePeriodDays: 180,
  })
  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [users, setUsers] = useState<{ id: string; name: string; email: string; role: string }[]>([])
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null)
  const [editPlanId, setEditPlanId] = useState<string | null>(null)
  const [editPlanValues, setEditPlanValues] = useState<Partial<MembershipPlan>>({})
  const [newPlan, setNewPlan] = useState({ name: '', duration_months: 1, fee: 0, description: '' })
  const [showAddPlan, setShowAddPlan] = useState(false)
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUser, setNewUser] = useState<{ name: string; email: string; password: string; role: UserRole }>({
    name: '', email: '', password: '', role: 'receptionist',
  })
  const [saving, setSaving] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)

  const fetchUsers = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('user_profiles').select('*')
    if (data) setUsers(data)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('gym_settings')
    if (saved) {
      const parsed = JSON.parse(saved)
      setSettings(s => ({
        ...s,
        ...parsed,
        admissionFee: parsed.admissionFee !== undefined ? Number(parsed.admissionFee) : 1000,
        gracePeriodDays: parsed.gracePeriodDays !== undefined ? Number(parsed.gracePeriodDays) : 180,
      }))
    }
    getPlans().then(setPlans)
    fetchUsers()

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single()
      if (profile) setCurrentRole(profile.role as UserRole)
    })
  }, [fetchUsers])

  async function handleAddUser() {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error('Fill in all fields')
      return
    }
    setCreatingUser(true)
    const result = await createStaffUser(newUser)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('User created')
      setShowAddUser(false)
      setNewUser({ name: '', email: '', password: '', role: 'receptionist' })
      fetchUsers()
    }
    setCreatingUser(false)
  }

  function saveSettings() {
    localStorage.setItem('gym_settings', JSON.stringify(settings))
    toast.success('Settings saved')
  }

  async function handleUpdatePlan(id: string) {
    setSaving(true)
    const result = await updatePlan(id, editPlanValues)
    if (result.error) { toast.error(result.error) } else {
      toast.success('Plan updated')
      setEditPlanId(null)
      getPlans().then(setPlans)
    }
    setSaving(false)
  }

  async function handleAddPlan() {
    setSaving(true)
    const result = await createPlan(newPlan)
    if (result.error) { toast.error(result.error) } else {
      toast.success('Plan created')
      setShowAddPlan(false)
      setNewPlan({ name: '', duration_months: 1, fee: 0, description: '' })
      getPlans().then(setPlans)
    }
    setSaving(false)
  }

  const roleColors: Record<string, string> = { admin: 'text-purple-400 bg-purple-500/10 border-purple-500/20', receptionist: 'text-blue-400 bg-blue-500/10 border-blue-500/20', coach: 'text-amber-400 bg-amber-500/10 border-amber-500/20' }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Configure your gym ERP system</p>
      </div>

      <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'General' && (
        <div className="max-w-2xl bg-card rounded-2xl border border-border p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <Building className="w-5 h-5 text-primary" />
            <h2 className="text-foreground font-semibold">Gym Information</h2>
          </div>
          <div>
            <Label>Gym Name</Label>
            <Input value={settings.name} onChange={e => setSettings(s => ({...s, name: e.target.value}))} className="mt-1" />
          </div>
          <div>
            <Label>Address</Label>
            <Input value={settings.address} onChange={e => setSettings(s => ({...s, address: e.target.value}))} className="mt-1" placeholder="Full gym address" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={settings.phone} onChange={e => setSettings(s => ({...s, phone: e.target.value}))} className="mt-1" placeholder="Gym phone number" />
          </div>
          <div className="border-t border-border pt-5">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-4 h-4 text-primary" />
              <h3 className="text-foreground font-medium text-sm">Admission & Grace Period Settings</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Default Admission Fee (₹)</Label>
                <Input type="number" min={0} value={settings.admissionFee} onChange={e => setSettings(s => ({...s, admissionFee: Number(e.target.value)}))} className="mt-1" />
              </div>
              <div>
                <Label>Grace Period (days)</Label>
                <Input type="number" min={0} value={settings.gracePeriodDays} onChange={e => setSettings(s => ({...s, gracePeriodDays: Number(e.target.value)}))} className="mt-1" />
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-5">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-4 h-4 text-primary" />
              <h3 className="text-foreground font-medium text-sm">WhatsApp API (Optional)</h3>
            </div>
            <div className="space-y-3">
              <div>
                <Label>WhatsApp API URL</Label>
                <Input value={settings.whatsappApiUrl} onChange={e => setSettings(s => ({...s, whatsappApiUrl: e.target.value}))} className="mt-1" placeholder="https://api.whatsapp.com/..." />
              </div>
              <div>
                <Label>API Token</Label>
                <Input type="password" value={settings.whatsappToken} onChange={e => setSettings(s => ({...s, whatsappToken: e.target.value}))} className="mt-1" placeholder="Your API token" />
              </div>
            </div>
          </div>
          <Button onClick={saveSettings} className="w-full"><Save className="w-4 h-4" /> Save Settings</Button>
        </div>
      )}

      {tab === 'Plans' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-foreground font-semibold">Membership Plans</h2>
            <Button size="sm" onClick={() => setShowAddPlan(v => !v)}>Add Plan</Button>
          </div>
          {showAddPlan && (
            <div className="bg-card rounded-2xl border border-primary/30 p-5 space-y-4">
              <h3 className="text-foreground font-medium text-sm">New Plan</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Name</Label><Input value={newPlan.name} onChange={e => setNewPlan(p => ({...p, name: e.target.value}))} className="mt-1" /></div>
                <div><Label>Duration (months)</Label><Input type="number" min={1} value={newPlan.duration_months} onChange={e => setNewPlan(p => ({...p, duration_months: Number(e.target.value)}))} className="mt-1" /></div>
                <div><Label>Fee (₹)</Label><Input type="number" min={0} value={newPlan.fee} onChange={e => setNewPlan(p => ({...p, fee: Number(e.target.value)}))} className="mt-1" /></div>
                <div><Label>Description</Label><Input value={newPlan.description} onChange={e => setNewPlan(p => ({...p, description: e.target.value}))} className="mt-1" /></div>
              </div>
              <Button onClick={handleAddPlan} disabled={saving || !newPlan.name}>Create Plan</Button>
            </div>
          )}
          <div className="space-y-3">
            {plans.map(plan => (
              <div key={plan.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
                {editPlanId === plan.id ? (
                  <div className="flex-1 grid grid-cols-3 gap-3">
                    <Input value={editPlanValues.name ?? plan.name} onChange={e => setEditPlanValues(v => ({...v, name: e.target.value}))} placeholder="Name" className="h-8 text-sm" />
                    <Input type="number" value={editPlanValues.fee ?? plan.fee} onChange={e => setEditPlanValues(v => ({...v, fee: Number(e.target.value)}))} placeholder="Fee" className="h-8 text-sm" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleUpdatePlan(plan.id)} disabled={saving}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditPlanId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="text-foreground font-medium">{plan.name}</div>
                      <div className="text-muted-foreground text-sm">{plan.duration_months} month{plan.duration_months > 1 ? 's' : ''} · ₹{plan.fee.toLocaleString('en-IN')}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => { setEditPlanId(plan.id); setEditPlanValues({ name: plan.name, fee: plan.fee }) }}>Edit</Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'Users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-foreground font-semibold">System Users</h2>
            {currentRole === 'admin' && (
              <Button size="sm" onClick={() => setShowAddUser(v => !v)}>+ Add User</Button>
            )}
          </div>

          {showAddUser && currentRole === 'admin' && (
            <div className="bg-card rounded-2xl border border-primary/30 p-5 space-y-4">
              <h3 className="text-foreground font-medium text-sm">New Staff Account</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Full Name</Label>
                  <Input value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))} className="mt-1" placeholder="John Smith" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} className="mt-1" placeholder="staff@fitness.gym" />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} className="mt-1" placeholder="Min. 6 characters" />
                </div>
                <div>
                  <Label>Role</Label>
                  <select
                    value={newUser.role}
                    onChange={e => setNewUser(u => ({ ...u, role: e.target.value as UserRole }))}
                    className="mt-1 w-full h-9 px-3 bg-background border border-border rounded-md text-sm text-foreground"
                  >
                    <option value="admin">Admin</option>
                    <option value="receptionist">Receptionist</option>
                    <option value="coach">Coach</option>
                  </select>
                </div>
              </div>
              <Button onClick={handleAddUser} disabled={creatingUser}>
                {creatingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Create Account
              </Button>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {users.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <Users className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-muted-foreground text-sm">No users found</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Name', 'Email', 'Role'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 text-foreground font-medium">{u.name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${roleColors[u.role] ?? 'text-[#6b8f6b]'}`}>{u.role}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
