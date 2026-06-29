'use client'

import { useState } from 'react'
import { useTasks } from '@/lib/hooks/useTasks'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus } from 'lucide-react'

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
  const { tasks, loading } = useTasks({ status: statusFilter, trelloList: trelloListFilter })

  const filtered = tasks.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#f8fafc]">Tareas</h1>
        <Link href="/tasks/new">
          <Button className="bg-[#0d9488] hover:bg-[#0f766e] text-white gap-2">
            <Plus size={16} /> Nueva tarea
          </Button>
        </Link>
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
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-[#f8fafc] font-medium">{task.title}</h3>
                      {(task.trello_cards as any)?.card_name && (
                        <p className="text-[#94a3b8] text-xs mt-0.5">
                          🔗 {(task.trello_cards as any).card_name}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[task.status]}`}>
                      {statusLabel[task.status]}
                    </span>
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
