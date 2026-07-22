'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useTasks } from '@/lib/hooks/useTasks'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

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

export default function TasksPage() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [trelloListFilter, setTrelloListFilter] = useState('Testing')
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [syncingTesting, setSyncingTesting] = useState(false)
  const { tasks, loading, refresh } = useTasks({ status: statusFilter, trelloList: trelloListFilter })
  const supabase = createClient()
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

  const syncTesting = async () => {
    setSyncingTesting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/trello-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'sync-testing' }),
      })
      const result = await res.json()
      if (result.success) {
        console.log('sync-testing debug:', result.debug)
        toast.success(`${result.count} tuyas de ${result.scanned} encontradas en Testing`)
        refresh()
      } else {
        toast.error(result.error || 'Error actualizando Testing')
      }
    } catch (e: any) {
      toast.error(e.message)
    }
    setSyncingTesting(false)
  }

  const deleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await supabase.from('tasks').delete().eq('id', taskId)
    setConfirmDelete(null)
    toast.success('Tarea eliminada')
    refresh()
  }

  const filtered = tasks.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#f8fafc]">Tareas</h1>
        <div className="flex gap-2">
          <Button
            onClick={syncTesting}
            disabled={syncingTesting}
            variant="ghost"
            className="border border-[#334155] text-[#94a3b8] hover:text-[#f8fafc] gap-2"
          >
            {syncingTesting ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Actualizar Testing
          </Button>
          <Link href="/tasks/new">
            <Button className="bg-[#0d9488] hover:bg-[#0f766e] text-white gap-2">
              <Plus size={16} /> Nueva tarea
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Buscar tarea..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-[#1e293b] border-[#334155] text-[#f8fafc] placeholder:text-[#94a3b8]"
        />
        <Select value={trelloListFilter} onValueChange={(v) => setTrelloListFilter(v ?? 'Testing')}>
          <SelectTrigger className="bg-[#1e293b] border-[#334155] text-[#f8fafc] w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1e293b] border-[#334155] text-[#f8fafc]">
            <SelectItem value="all">Todas las columnas</SelectItem>
            <SelectItem value="Testing">Testing</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="bg-[#1e293b] border-[#334155] text-[#f8fafc] w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1e293b] border-[#334155] text-[#f8fafc]">
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="in_progress">En progreso</SelectItem>
            <SelectItem value="done">Hechas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-[#94a3b8]">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-[#94a3b8]">No hay tareas.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const total = task.checklist_items?.length ?? 0
            const done = task.checklist_items?.filter(i => i.status === 'pass').length ?? 0
            return (
              <Link key={task.id} href={`/tasks/${task.id}`}>
                <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 hover:border-[#0d9488] transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[#f8fafc] font-medium">{task.title}</h3>
                      {(task.trello_cards as any)?.card_name && (
                        <p className="text-[#94a3b8] text-xs mt-0.5">
                          🔗 {(task.trello_cards as any).card_name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[task.status]}`}>
                        {statusLabel[task.status]}
                      </span>
                      {confirmDelete === task.id ? (
                        <div className="flex items-center gap-1" onClick={e => e.preventDefault()}>
                          <button
                            onClick={e => deleteTask(task.id, e)}
                            className="text-xs px-2 py-0.5 rounded bg-[#ef4444]/20 text-[#ef4444] hover:bg-[#ef4444]/40 transition-colors"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(null) }}
                            className="text-xs px-2 py-0.5 rounded bg-[#334155] text-[#94a3b8] hover:bg-[#475569] transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(task.id) }}
                          className="text-[#94a3b8] hover:text-[#ef4444] transition-colors p-1 rounded hover:bg-[#ef4444]/10"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-[#94a3b8]">
                      {new Date(task.created_at).toLocaleDateString('es-AR')}
                    </span>
                    {total > 0 && (
                      <span className="text-xs text-[#94a3b8]">
                        Checklist: {done}/{total}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
