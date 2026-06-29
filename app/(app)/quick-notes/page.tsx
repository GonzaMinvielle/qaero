'use client'

import { useState } from 'react'
import { useQuickNotes, type QuickNote } from '@/lib/hooks/useQuickNotes'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Pencil, Check, X } from 'lucide-react'
import { toast } from 'sonner'

const tagLabel = { call: '📞 Llamada', test: '🧪 Prueba', todo: '✅ Pendiente', misc: '📌 Gral' }
const tagColor = {
  call: 'bg-blue-900/30 text-blue-400',
  test: 'bg-green-900/30 text-green-400',
  todo: 'bg-yellow-900/30 text-yellow-400',
  misc: 'bg-[#334155] text-[#94a3b8]',
}

export default function QuickNotesPage() {
  const { notes, loading, deleteNote, updateNote } = useQuickNotes()
  const [tagFilter, setTagFilter] = useState('all')
  const [editing, setEditing] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editTag, setEditTag] = useState<QuickNote['tag']>('misc')

  const filtered = notes.filter(n => tagFilter === 'all' || n.tag === tagFilter)

  const startEdit = (note: QuickNote) => {
    setEditing(note.id)
    setEditContent(note.content)
    setEditTag(note.tag)
  }

  const saveEdit = async (id: string) => {
    await updateNote(id, editContent, editTag)
    setEditing(null)
    toast.success('Nota actualizada')
  }

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#f8fafc]">Notas rápidas</h1>
        <Select value={tagFilter} onValueChange={(v) => setTagFilter(v ?? 'all')}>
          <SelectTrigger className="bg-[#1e293b] border-[#334155] text-[#f8fafc] w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1e293b] border-[#334155] text-[#f8fafc]">
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="call">📞 Llamada</SelectItem>
            <SelectItem value="test">🧪 Prueba</SelectItem>
            <SelectItem value="todo">✅ Pendiente</SelectItem>
            <SelectItem value="misc">📌 Gral</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-[#94a3b8]">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-[#94a3b8]">Sin notas. Usá el botón + para agregar una.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(note => (
            <div key={note.id} className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 space-y-2">
              {editing === note.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={3}
                    className="bg-[#0f172a] border-[#334155] text-[#f8fafc] resize-none"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <Select value={editTag} onValueChange={v => setEditTag(v as QuickNote['tag'])}>
                      <SelectTrigger className="bg-[#0f172a] border-[#334155] text-[#f8fafc] w-36 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1e293b] border-[#334155] text-[#f8fafc]">
                        <SelectItem value="misc">Gral</SelectItem>
                        <SelectItem value="call">📞 Llamada</SelectItem>
                        <SelectItem value="test">🧪 Prueba</SelectItem>
                        <SelectItem value="todo">✅ Pendiente</SelectItem>
                      </SelectContent>
                    </Select>
                    <button onClick={() => saveEdit(note.id)} className="text-[#22c55e] hover:text-[#16a34a]"><Check size={16} /></button>
                    <button onClick={() => setEditing(null)} className="text-[#94a3b8] hover:text-[#f8fafc]"><X size={16} /></button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm text-[#f8fafc] whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${tagColor[note.tag]}`}>{tagLabel[note.tag]}</span>
                      <span className="text-xs text-[#94a3b8]">{new Date(note.created_at).toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(note)} className="text-[#94a3b8] hover:text-[#f8fafc]"><Pencil size={14} /></button>
                    <button onClick={() => { deleteNote(note.id); toast.success('Nota eliminada') }} className="text-[#94a3b8] hover:text-[#ef4444]"><Trash2 size={14} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
