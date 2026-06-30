'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TrelloReportModal } from '@/components/tasks/TrelloReportModal'
import { toast } from 'sonner'
import { Plus, Trash2, Upload, X, ChevronLeft } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

type MediaItem = { url: string; type: 'image' | 'video'; name: string }

function MediaLightbox({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-w-5xl max-h-[90vh] w-full mx-4" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
        >
          <X size={28} />
        </button>
        {item.type === 'image' ? (
          <img
            src={item.url}
            alt={item.name}
            className="max-h-[85vh] w-auto max-w-full mx-auto rounded-lg object-contain"
          />
        ) : (
          <video
            src={item.url}
            controls
            autoPlay
            className="max-h-[85vh] w-full rounded-lg"
          />
        )}
        <p className="text-white/50 text-xs text-center mt-2 truncate">{item.name}</p>
      </div>
    </div>
  )
}

const typeLabel = { functional: 'Funcional', edge_case: 'Edge Cases', risk: 'Riesgos' }

const statusBadge: Record<string, { label: string; cls: string }> = {
  pass: { label: '✅ Pass', cls: 'bg-[#22c55e]/20 text-[#22c55e]' },
  fail: { label: '❌ Fail', cls: 'bg-[#ef4444]/20 text-[#ef4444]' },
  pending: { label: '⏳ Pendiente', cls: 'bg-[#334155] text-[#94a3b8]' },
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [task, setTask] = useState<any>(null)
  const [checklistItems, setChecklistItems] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [references, setReferences] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [addingNote, setAddingNote] = useState(false)
  const [noteContent, setNoteContent] = useState('')
  const [noteFiles, setNoteFiles] = useState<File[]>([])
  const [savingNote, setSavingNote] = useState(false)
  const [newItemText, setNewItemText] = useState('')
  const [addingItemType, setAddingItemType] = useState<string | null>(null)
  const [failNotes, setFailNotes] = useState<Record<string, string>>({})
  const [editingFailNote, setEditingFailNote] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [taskStatus, setTaskStatus] = useState<string>('pending')
  const [lightbox, setLightbox] = useState<MediaItem | null>(null)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const refInputRef = useRef<HTMLInputElement>(null)

  const loadTask = async () => {
    const [taskRes, checkRes, notesRes, refsRes] = await Promise.all([
      supabase.from('tasks').select('*, trello_cards(card_name)').eq('id', id).single(),
      supabase.from('checklist_items').select('*').eq('task_id', id).order('sort_order'),
      supabase.from('task_notes').select('*, task_evidences(*)').eq('task_id', id).order('created_at'),
      supabase.from('task_references').select('*').eq('task_id', id),
    ])
    setTask(taskRes.data)
    setTaskStatus(taskRes.data?.status ?? 'pending')
    setChecklistItems(checkRes.data ?? [])
    setNotes(notesRes.data ?? [])
    setReferences(refsRes.data ?? [])

    const allPaths: string[] = []
    notesRes.data?.forEach((note: any) =>
      note.task_evidences?.forEach((ev: any) => allPaths.push(ev.file_path))
    )
    refsRes.data?.forEach((ref: any) => allPaths.push(ref.file_path))

    if (allPaths.length > 0) {
      const urlEntries = await Promise.all(
        allPaths.map(async path => {
          const { data } = await supabase.storage.from('task-evidences').createSignedUrl(path, 3600)
          return [path, data?.signedUrl ?? ''] as [string, string]
        })
      )
      setSignedUrls(Object.fromEntries(urlEntries))
    }

    setLoading(false)
  }

  useEffect(() => { loadTask() }, [id])

  const updateItemStatus = async (itemId: string, status: string) => {
    await supabase.from('checklist_items').update({ status }).eq('id', itemId)
    setChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, status } : i))
    if (status === 'fail') setEditingFailNote(itemId)
    if (status !== 'fail' && editingFailNote === itemId) setEditingFailNote(null)
  }

  const saveFailNote = async (itemId: string, note: string) => {
    await supabase.from('checklist_items').update({ note }).eq('id', itemId)
    setChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, note } : i))
    setEditingFailNote(null)
  }

  const deleteItem = async (itemId: string) => {
    await supabase.from('checklist_items').delete().eq('id', itemId)
    setChecklistItems(prev => prev.filter(i => i.id !== itemId))
  }

  const addItem = async (type: string) => {
    if (!newItemText.trim()) return
    const sort = checklistItems.filter(i => i.type === type).length
    const { data } = await supabase.from('checklist_items').insert({
      task_id: id, text: newItemText.trim(), type, status: 'pending', sort_order: sort,
    }).select().single()
    if (data) setChecklistItems(prev => [...prev, data])
    setNewItemText('')
    setAddingItemType(null)
  }

  const saveNote = async () => {
    if (!noteContent.trim()) return
    setSavingNote(true)
    const { data: note } = await supabase.from('task_notes').insert({ task_id: id, content: noteContent }).select().single()
    if (note && noteFiles.length > 0) {
      for (const file of noteFiles) {
        const path = `${id}/${note.id}/${file.name}`
        await supabase.storage.from('task-evidences').upload(path, file)
        await supabase.from('task_evidences').insert({
          task_note_id: note.id,
          file_path: path,
          file_type: file.type.startsWith('video') ? 'video' : 'image',
          file_name: file.name,
        })
      }
    }
    setNoteContent('')
    setNoteFiles([])
    setAddingNote(false)
    setSavingNote(false)
    loadTask()
    toast.success('Nota agregada')
  }

  const uploadReference = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const path = `${id}/ref/${file.name}`
    await supabase.storage.from('task-evidences').upload(path, file, { upsert: true })
    const { data } = await supabase.from('task_references').insert({ task_id: id, file_path: path }).select().single()
    if (data) setReferences(prev => [...prev, data])
    toast.success('Imagen de referencia subida')
  }

  const updateStatus = async (status: string) => {
    setTaskStatus(status)
    await supabase.from('tasks').update({ status }).eq('id', id)
    toast.success('Estado actualizado')
  }

  const getUrl = (path: string) => signedUrls[path] ?? ''

  if (loading) return <div className="p-6 text-[#94a3b8]">Cargando...</div>
  if (!task) return <div className="p-6 text-[#94a3b8]">Tarea no encontrada</div>

  const total = checklistItems.length
  const passed = checklistItems.filter(i => i.status === 'pass').length
  const failed = checklistItems.filter(i => i.status === 'fail').length

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tasks" className="text-[#94a3b8] hover:text-[#f8fafc]"><ChevronLeft size={20} /></Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#f8fafc]">{task.title}</h1>
          {(task.trello_cards as any)?.card_name && (
            <p className="text-xs text-[#94a3b8]">🔗 {(task.trello_cards as any).card_name}</p>
          )}
        </div>
        {total > 0 && (
          <div className="text-sm text-[#94a3b8]">
            <span className="text-[#22c55e]">{passed}</span> / {total}
            {failed > 0 && <span className="text-[#ef4444] ml-1">({failed} fail)</span>}
          </div>
        )}
      </div>

      {task.description && (
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 text-sm text-[#94a3b8]">
          {task.description}
        </div>
      )}

      {/* Checklist */}
      <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4">
        <h2 className="text-[#f8fafc] font-semibold mb-3">Checklist</h2>
        <Tabs defaultValue="functional">
          <TabsList className="bg-[#0f172a] border border-[#334155]">
            {(['functional', 'edge_case', 'risk'] as const).map(type => (
              <TabsTrigger key={type} value={type} className="text-[#94a3b8] data-[state=active]:text-[#f8fafc] data-[state=active]:bg-[#334155]">
                {typeLabel[type]} ({checklistItems.filter(i => i.type === type).length})
              </TabsTrigger>
            ))}
          </TabsList>

          {(['functional', 'edge_case', 'risk'] as const).map(type => (
            <TabsContent key={type} value={type} className="mt-3 space-y-2">
              {checklistItems.filter(i => i.type === type).map(item => (
                <div key={item.id} className="border border-[#334155] rounded p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="flex-1 text-sm text-[#f8fafc]">{item.text}</span>
                    <div className="flex gap-1 shrink-0">
                      {(['pass', 'fail', 'pending'] as const).map(s => (
                        <button
                          key={s}
                          onClick={() => updateItemStatus(item.id, s)}
                          className={`text-xs px-2 py-0.5 rounded transition-colors ${item.status === s ? statusBadge[s].cls : 'bg-[#334155] text-[#94a3b8] hover:bg-[#475569]'}`}
                        >
                          {s === 'pass' ? '✅' : s === 'fail' ? '❌' : '⏳'}
                        </button>
                      ))}
                      <button onClick={() => deleteItem(item.id)} className="text-[#94a3b8] hover:text-[#ef4444] ml-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {item.status === 'fail' && editingFailNote === item.id && (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nota del fallo..."
                        defaultValue={item.note || ''}
                        onBlur={e => saveFailNote(item.id, e.target.value)}
                        className="bg-[#0f172a] border-[#334155] text-[#f8fafc] text-sm h-8 placeholder:text-[#94a3b8]"
                        autoFocus
                      />
                    </div>
                  )}
                  {item.status === 'fail' && item.note && editingFailNote !== item.id && (
                    <div onClick={() => setEditingFailNote(item.id)} className="text-xs text-[#ef4444] cursor-pointer bg-[#ef4444]/10 px-2 py-1 rounded">
                      {item.note}
                    </div>
                  )}
                </div>
              ))}

              {addingItemType === type ? (
                <div className="flex gap-2">
                  <Input
                    value={newItemText}
                    onChange={e => setNewItemText(e.target.value)}
                    placeholder="Descripción del ítem..."
                    onKeyDown={e => e.key === 'Enter' && addItem(type)}
                    className="bg-[#0f172a] border-[#334155] text-[#f8fafc] text-sm placeholder:text-[#94a3b8]"
                    autoFocus
                  />
                  <Button size="sm" onClick={() => addItem(type)} className="bg-[#0d9488] hover:bg-[#0f766e] text-white">Agregar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddingItemType(null)} className="text-[#94a3b8]"><X size={14} /></Button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingItemType(type)}
                  className="flex items-center gap-2 text-sm text-[#94a3b8] hover:text-[#0d9488] transition-colors"
                >
                  <Plus size={14} /> Agregar ítem
                </button>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Evidencias y notas */}
      <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[#f8fafc] font-semibold">Notas y evidencias</h2>
          <Button size="sm" onClick={() => setAddingNote(true)} className="bg-[#334155] hover:bg-[#475569] text-[#f8fafc] gap-1">
            <Plus size={14} /> Agregar nota
          </Button>
        </div>

        {addingNote && (
          <div className="border border-[#334155] rounded p-4 space-y-3">
            <Textarea
              value={noteContent}
              onChange={e => setNoteContent(e.target.value)}
              placeholder="Descripción, observaciones..."
              rows={3}
              className="bg-[#0f172a] border-[#334155] text-[#f8fafc] placeholder:text-[#94a3b8] resize-none"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} className="text-[#94a3b8] gap-1 border border-[#334155]">
                <Upload size={14} /> Adjuntar archivos
              </Button>
              <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={e => setNoteFiles(Array.from(e.target.files ?? []))} />
              {noteFiles.length > 0 && <span className="text-xs text-[#94a3b8]">{noteFiles.length} archivo(s)</span>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveNote} disabled={savingNote || !noteContent.trim()} className="bg-[#0d9488] hover:bg-[#0f766e] text-white">
                {savingNote ? 'Guardando...' : 'Guardar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setAddingNote(false); setNoteContent(''); setNoteFiles([]) }} className="text-[#94a3b8]">
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {notes.map(note => (
            <div key={note.id} className="border border-[#334155] rounded p-3 space-y-2">
              <div className="text-sm text-[#f8fafc]">{note.content}</div>
              <div className="text-xs text-[#94a3b8]">{new Date(note.created_at).toLocaleString('es-AR')}</div>
              {note.task_evidences?.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {note.task_evidences.map((ev: any) => {
                    const url = getUrl(ev.file_path)
                    return (
                      <div key={ev.id}>
                        {ev.file_type === 'image' ? (
                          <button
                            onClick={() => setLightbox({ url, type: 'image', name: ev.file_name })}
                            className="w-full focus:outline-none group"
                          >
                            <img
                              src={url}
                              alt={ev.file_name}
                              className="rounded w-full h-32 object-cover transition-opacity group-hover:opacity-80 cursor-zoom-in"
                            />
                          </button>
                        ) : (
                          <div
                            className="relative cursor-pointer group"
                            onClick={() => setLightbox({ url, type: 'video', name: ev.file_name })}
                          >
                            <video src={url} className="rounded w-full h-32 object-cover" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded opacity-80 group-hover:opacity-60 transition-opacity">
                              <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
          {notes.length === 0 && <p className="text-[#94a3b8] text-sm">Sin notas aún.</p>}
        </div>
      </div>

      {/* Imágenes de referencia */}
      <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[#f8fafc] font-semibold">Imágenes de referencia</h2>
          <Button size="sm" variant="ghost" onClick={() => refInputRef.current?.click()} className="text-[#94a3b8] border border-[#334155] gap-1">
            <Upload size={14} /> Subir
          </Button>
          <input ref={refInputRef} type="file" accept="image/*" className="hidden" onChange={uploadReference} />
        </div>
        {references.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {references.map(ref => {
              const url = getUrl(ref.file_path)
              return (
                <button
                  key={ref.id}
                  onClick={() => setLightbox({ url, type: 'image', name: ref.file_path.split('/').pop() ?? '' })}
                  className="w-full focus:outline-none group"
                >
                  <img src={url} className="rounded w-full h-32 object-cover transition-opacity group-hover:opacity-80 cursor-zoom-in" />
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-[#94a3b8] text-sm">Sin imágenes de referencia.</p>
        )}
      </div>

      {/* Footer: status + reporte */}
      <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#94a3b8]">Estado:</span>
          <select
            value={taskStatus}
            onChange={e => updateStatus(e.target.value)}
            className="bg-[#0f172a] border border-[#334155] text-[#f8fafc] rounded px-3 py-1.5 text-sm"
          >
            <option value="pending">Pendiente</option>
            <option value="in_progress">En progreso</option>
            <option value="done">Hecha</option>
          </select>
        </div>
        <Button onClick={() => setShowReport(true)} className="bg-[#334155] hover:bg-[#475569] text-[#f8fafc]">
          Generar reporte para Trello
        </Button>
      </div>

      <TrelloReportModal
        open={showReport}
        onClose={() => setShowReport(false)}
        task={task}
        checklistItems={checklistItems}
        notes={notes}
      />

      {lightbox && <MediaLightbox item={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
