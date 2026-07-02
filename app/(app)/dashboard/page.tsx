'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

const statusLabel: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  done: 'Hecha',
}

const statusColor: Record<string, string> = {
  pending: 'bg-[#f59e0b]/20 text-[#f59e0b]',
  in_progress: 'bg-[#0d9488]/20 text-[#0d9488]',
  done: 'bg-[#22c55e]/20 text-[#22c55e]',
}

export default function DashboardPage() {
  const [stats, setStats] = useState({ pending: 0, in_progress: 0, done: 0 })
  const [recentTasks, setRecentTasks] = useState<any[]>([])
  const [todayNotes, setTodayNotes] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)

      const [tasksRes, notesRes] = await Promise.all([
        supabase.from('tasks').select('id, title, status, updated_at, trello_cards(card_name)').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(5),
        supabase.from('quick_notes').select('*').eq('user_id', user.id).gte('created_at', today.toISOString()).order('created_at', { ascending: false }).limit(3),
      ])

      const tasks = tasksRes.data ?? []
      setRecentTasks(tasks)

      const [pendRes, progRes, doneRes] = await Promise.all([
        supabase.from('tasks').select('id', { count: 'exact' }).eq('user_id', user.id).eq('status', 'pending'),
        supabase.from('tasks').select('id', { count: 'exact' }).eq('user_id', user.id).eq('status', 'in_progress'),
        supabase.from('tasks').select('id', { count: 'exact' }).eq('user_id', user.id).eq('status', 'done').gte('updated_at', weekAgo.toISOString()),
      ])

      setStats({
        pending: pendRes.count ?? 0,
        in_progress: progRes.count ?? 0,
        done: doneRes.count ?? 0,
      })
      setTodayNotes(notesRes.data ?? [])
    }
    load()
  }, [])

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#f8fafc]">Dashboard</h1>
        <Link href="/tasks/new">
          <Button className="bg-[#0d9488] hover:bg-[#0f766e] text-white gap-2">
            <Plus size={16} /> Nueva tarea
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pendientes', value: stats.pending, color: 'text-[#f59e0b]' },
          { label: 'En progreso', value: stats.in_progress, color: 'text-[#0d9488]' },
          { label: 'Completadas (semana)', value: stats.done, color: 'text-[#22c55e]' },
        ].map(s => (
          <div key={s.label} className="bg-[#1e293b] border border-[#334155] rounded-lg p-4">
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[#94a3b8] text-sm mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4">
        <h2 className="text-[#f8fafc] font-semibold mb-3">Tareas recientes</h2>
        {recentTasks.length === 0 ? (
          <p className="text-[#94a3b8] text-sm">No hay tareas aún.</p>
        ) : (
          <div className="space-y-2">
            {recentTasks.map(task => (
              <Link key={task.id} href={`/tasks/${task.id}`} className="flex items-center justify-between p-3 rounded hover:bg-[#334155] transition-colors">
                <span className="text-[#f8fafc] text-sm">{task.title}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[task.status]}`}>
                  {statusLabel[task.status]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {todayNotes.length > 0 && (
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4">
          <h2 className="text-[#f8fafc] font-semibold mb-3">Notas de hoy</h2>
          <div className="space-y-2">
            {todayNotes.map(note => (
              <div key={note.id} className="text-sm text-[#94a3b8] border-l-2 border-[#0d9488] pl-3">
                {note.content}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
