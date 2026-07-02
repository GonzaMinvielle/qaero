'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Upload, Loader2, Trash2, Archive } from 'lucide-react'

export default function AdminKnowledgePage() {
  const [docs, setDocs] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [area, setArea] = useState('QA')
  const [tags, setTags] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

  const loadDocs = async () => {
    const { data } = await supabase.from('knowledge_docs').select('*').order('created_at', { ascending: false })
    setDocs(data ?? [])
  }

  useEffect(() => { loadDocs() }, [])

  const handleUpload = async () => {
    if (!title || !file) { toast.error('Título y archivo requeridos'); return }
    setUploading(true)
    try {
      const path = `docs/${Date.now()}_${file.name}`
      const { error: uploadErr } = await supabase.storage.from('knowledge-documents').upload(path, file)
      if (uploadErr) throw uploadErr

      const { data: { user } } = await supabase.auth.getUser()
      const { data: doc, error: docErr } = await supabase.from('knowledge_docs').insert({
        title, area, tags, file_path: path, file_name: file.name,
        status: 'active', visibility: 'public', uploaded_by: user?.id,
      }).select().single()

      if (docErr || !doc) throw docErr

      setProcessing(doc.id)
      toast.info('Procesando documento...')

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/process-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ bucket: 'knowledge-documents', filePath: path, fileName: file.name }),
      })
      const result = await res.json()

      if (result.success) {
        await supabase.from('knowledge_docs').update({
          full_content: result.text,
          summary: result.summary,
          content: result.summary,
        }).eq('id', doc.id)
        toast.success(`Documento procesado (${result.charCount} chars)`)
      } else {
        toast.warning('Subido pero sin procesar: ' + (result.error || ''))
      }

      setTitle('')
      setArea('QA')
      setTags('')
      setFile(null)
      loadDocs()
    } catch (e: any) {
      toast.error(e.message || 'Error subiendo documento')
    }
    setUploading(false)
    setProcessing(null)
  }

  const toggleStatus = async (doc: any) => {
    const newStatus = doc.status === 'active' ? 'obsolete' : 'active'
    await supabase.from('knowledge_docs').update({ status: newStatus }).eq('id', doc.id)
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, status: newStatus } : d))
    toast.success(`Documento marcado como ${newStatus}`)
  }

  const deleteDoc = async (id: string) => {
    await supabase.from('knowledge_docs').delete().eq('id', id)
    setDocs(prev => prev.filter(d => d.id !== id))
    toast.success('Documento eliminado')
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-[#f8fafc]">Admin — Knowledge Base</h1>

      <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 space-y-4">
        <h2 className="text-[#f8fafc] font-semibold">Subir documento</h2>
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Título *" value={title} onChange={e => setTitle(e.target.value)} className="bg-[#0f172a] border-[#334155] text-[#f8fafc] placeholder:text-[#94a3b8]" />
          <Input placeholder="Área (ej: QA, Dev, Producto)" value={area} onChange={e => setArea(e.target.value)} className="bg-[#0f172a] border-[#334155] text-[#f8fafc] placeholder:text-[#94a3b8]" />
          <Input placeholder="Tags (separados por coma)" value={tags} onChange={e => setTags(e.target.value)} className="bg-[#0f172a] border-[#334155] text-[#f8fafc] placeholder:text-[#94a3b8] col-span-2" />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => fileRef.current?.click()} className="border border-[#334155] text-[#94a3b8] gap-2">
            <Upload size={14} /> {file ? file.name : 'Seleccionar archivo'}
          </Button>
          <input ref={fileRef} type="file" accept=".txt,.md,.pdf,.docx,.png,.jpg,.jpeg,.webp" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <Button onClick={handleUpload} disabled={uploading || !title || !file} className="bg-[#0d9488] hover:bg-[#0f766e] text-white gap-2">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : null}
            {uploading ? 'Subiendo...' : 'Subir y procesar'}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-[#f8fafc] font-semibold">Documentos ({docs.length})</h2>
        {docs.map(doc => (
          <div key={doc.id} className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[#f8fafc] font-medium text-sm">{doc.title}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${doc.status === 'active' ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'bg-[#334155] text-[#94a3b8]'}`}>
                  {doc.status === 'active' ? 'Activo' : 'Obsoleto'}
                </span>
                {processing === doc.id && <span className="text-xs text-[#f59e0b]"><Loader2 size={12} className="animate-spin inline mr-1" />Procesando</span>}
              </div>
              <div className="text-xs text-[#94a3b8] mt-0.5">
                {doc.area}{doc.tags ? ` · ${doc.tags}` : ''} · {doc.file_name}
              </div>
              {doc.summary && <div className="text-xs text-[#94a3b8] mt-1 line-clamp-2">{doc.summary}</div>}
            </div>
            <div className="flex gap-1 shrink-0 ml-4">
              <button onClick={() => toggleStatus(doc)} className="text-[#94a3b8] hover:text-[#f59e0b] p-1" title={doc.status === 'active' ? 'Marcar obsoleto' : 'Activar'}>
                <Archive size={14} />
              </button>
              <button onClick={() => deleteDoc(doc.id)} className="text-[#94a3b8] hover:text-[#ef4444] p-1">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {docs.length === 0 && <div className="text-[#94a3b8] text-sm">Sin documentos aún.</div>}
      </div>
    </div>
  )
}
