'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('user_roles').select('user_id, role'),
      ])
      const error = profilesError || rolesError
      if (error) {
        console.error('Error cargando usuarios:', error)
        toast.error(`Error cargando usuarios: ${error.message}`)
      }
      const roleByUserId = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]))
      const merged = (profiles ?? []).map((p: any) => ({
        ...p,
        user_roles: roleByUserId.has(p.id) ? [{ role: roleByUserId.get(p.id) }] : [],
      }))
      setUsers(merged)
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

  const saveTrelloUsername = async (userId: string, trelloUsername: string) => {
    const value = trelloUsername.trim() || null
    const { data, error } = await supabase.from('profiles').update({ trello_username: value }).eq('id', userId).select()
    // Si RLS bloquea el update de la fila de otro usuario, Supabase no devuelve `error` —
    // simplemente afecta 0 filas. Hay que chequear `data` explícitamente para detectarlo.
    if (error || !data || data.length === 0) {
      toast.error('No se pudo guardar el username (permisos insuficientes)')
      return
    }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, trello_username: value } : u))
    toast.success('Username de Trello actualizado')
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-[#f8fafc]">Admin — Usuarios</h1>

      {loading ? (
        <div className="flex items-center gap-2 text-[#94a3b8] text-sm">
          <Loader2 size={16} className="animate-spin" /> Cargando...
        </div>
      ) : users.length === 0 ? (
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6 text-center">
          <p className="text-[#94a3b8] text-sm">Sin usuarios.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(user => {
            const currentRole = user.user_roles?.[0]?.role ?? 'qa'
            return (
              <div
                key={user.id}
                className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 flex flex-col sm:flex-row sm:items-end gap-4"
              >
                <div className="min-w-0 flex-1 sm:self-center">
                  <div className="text-[#f8fafc] font-medium text-sm truncate">{user.full_name || '(sin nombre)'}</div>
                  <div className="text-[#94a3b8] text-xs truncate">{user.email}</div>
                </div>
                <div className="flex flex-wrap sm:flex-nowrap items-end gap-2 shrink-0">
                  <div className="flex flex-col gap-1 flex-1 min-w-[9rem] sm:flex-none sm:w-36">
                    <label className="text-[#64748b] text-[10px] leading-none">Username Trello</label>
                    <Input
                      key={user.trello_username ?? 'empty'}
                      defaultValue={user.trello_username ?? ''}
                      placeholder="username"
                      className="bg-[#0f172a] border-[#334155] text-[#f8fafc] w-full"
                      onBlur={e => {
                        if (e.target.value.trim() !== (user.trello_username ?? '')) {
                          saveTrelloUsername(user.id, e.target.value)
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1 flex-1 min-w-[7rem] sm:flex-none sm:w-32">
                    <label className="text-[#64748b] text-[10px] leading-none">Rol</label>
                    <Select value={currentRole} onValueChange={v => changeRole(user.id, v)}>
                      <SelectTrigger className="bg-[#0f172a] border-[#334155] text-[#f8fafc] w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1e293b] border-[#334155] text-[#f8fafc]">
                        <SelectItem value="qa">QA</SelectItem>
                        <SelectItem value="lector">Lector</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
