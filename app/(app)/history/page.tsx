'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'

export default function HistoryPage() {
  const [tasks, setTasks] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase
        .from('tasks')
        .select('*, trello_cards(card_name), checklist_items(*), task_notes(*)')
        .eq('user_id', user.id)
        .eq('status', 'done')
        .order('updated_at', { ascending: false })
      setTasks(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = tasks.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (id: string) => {
    setExpanded(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const statusIcon = { pass: '✅', fail: '❌', pending: '⏳' }

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold text-[#f8fafc]">Historial</h1>

      <Input
        placeholder="Buscar en historial..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="bg-[#1e293b] border-[#334155] text-[#f8fafc] placeholder:text-[#94a3b8]"
      />

      {loading ? (
        <div className="text-[#94a3b8]">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-[#94a3b8]">No hay tareas completadas.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const isOpen = expanded.includes(task.id)
            const total = task.checklist_items?.length ?? 0
            const passed = task.checklist_items?.filter((i: any) => i.status === 'pass').length ?? 0
            const failed = task.checklist_items?.filter((i: any) => i.status === 'fail').length ?? 0
            return (
              <div key={task.id} className="bg-[#1e293b] border border-[#334155] rounded-lg overflow-hidden">
                <button
                  onClick={() => toggle(task.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-[#334155] transition-colors"
                >
                  <div>
                    <div className="text-[#f8fafc] font-medium">{task.title}</div>
                    <div className="text-xs text-[#94a3b8] mt-0.5">
                      {new Date(task.updated_at).toLocaleDateString('es-AR')}
                      {total > 0 && ` · ${passed}✅ ${failed > 0 ? `${failed}❌` : ''} / ${total}`}
                      {(task.trello_cards as any)?.card_name && ` · 🔗 ${(task.trello_cards as any).card_name}`}
                    </div>
                  </div>
                  {isOpen ? <ChevronDown size={16} className="text-[#94a3b8]" /> : <ChevronRight size={16} className="text-[#94a3b8]" />}
                </button>
                {isOpen && (
                  <div className="border-t border-[#334155] p-4 space-y-4">
                    {task.checklist_items?.length > 0 && (
                      <div>
                        <div className="text-sm text-[#94a3b8] mb-2">Checklist</div>
                        <div className="space-y-1">
                          {task.checklist_items.map((item: any) => (
                            <div key={item.id} className="flex items-start gap-2 text-sm">
                              <span>{(statusIcon as any)[item.status]}</span>
                              <span className="text-[#f8fafc]">{item.text}</span>
                              {item.note && <span className="text-[#ef4444] text-xs">({item.note})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {task.task_notes?.length > 0 && (
                      <div>
                        <div className="text-sm text-[#94a3b8] mb-2">Notas</div>
                        <div className="space-y-2">
                          {task.task_notes.map((note: any) => (
                            <div key={note.id} className="text-sm text-[#f8fafc] border-l-2 border-[#334155] pl-3">
                              {note.content}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <Link href={`/tasks/${task.id}`} className="text-xs text-[#0d9488] hover:underline">
                      Ver tarea completa →
                    </Link>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
