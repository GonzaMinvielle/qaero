'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*, user_roles(role)')
        .order('created_at', { ascending: false })
      setUsers(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const changeRole = async (userId: string, role: string) => {
    await supabase.from('user_roles').upsert({ user_id: userId, role }, { onConflict: 'user_id,role' })
    await supabase.from('user_roles').delete().eq('user_id', userId).neq('role', role)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, user_roles: [{ role }] } : u))
    toast.success('Rol actualizado')
  }

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-[#f8fafc]">Admin — Usuarios</h1>

      {loading ? (
        <div className="text-[#94a3b8]">Cargando...</div>
      ) : (
        <div className="space-y-2">
          {users.map(user => {
            const currentRole = user.user_roles?.[0]?.role ?? 'qa'
            return (
              <div key={user.id} className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="text-[#f8fafc] font-medium text-sm">{user.full_name || '(sin nombre)'}</div>
                  <div className="text-[#94a3b8] text-xs">{user.email}</div>
                </div>
                <Select value={currentRole} onValueChange={v => changeRole(user.id, v)}>
                  <SelectTrigger className="bg-[#0f172a] border-[#334155] text-[#f8fafc] w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1e293b] border-[#334155] text-[#f8fafc]">
                    <SelectItem value="qa">QA</SelectItem>
                    <SelectItem value="lector">Lector</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )
          })}
          {users.length === 0 && <div className="text-[#94a3b8] text-sm">Sin usuarios.</div>}
        </div>
      )}
    </div>
  )
}
