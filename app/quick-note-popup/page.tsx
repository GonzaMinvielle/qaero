'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Check, X } from 'lucide-react'

type Tag = 'misc' | 'call' | 'test' | 'todo'

const TAG_LABELS: Record<Tag, string> = {
  misc: '💬 Gral',
  call: '📞 Llamada',
  test: '🧪 Prueba',
  todo: '✅ Pendiente',
}

export default function QuickNotePopupPage() {
  const [content, setContent] = useState('')
  const [tag, setTag] = useState<Tag>('misc')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.close()
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSave()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [content])

  const handleSave = async () => {
    if (!content.trim() || saving) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('quick_notes').insert({ content: content.trim(), tag, user_id: user.id })
    setSaved(true)
    setTimeout(() => window.close(), 800)
  }

  return (
    <div className="h-screen w-screen bg-[#0f172a] flex flex-col p-3 gap-2 select-none">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[#94a3b8] text-xs font-medium tracking-wide uppercase">Nota rápida</span>
        <button onClick={() => window.close()} className="text-[#475569] hover:text-[#94a3b8] transition-colors">
          <X size={14} />
        </button>
      </div>

      <Textarea
        ref={textareaRef}
        placeholder="¿Qué anotás? (Ctrl+Enter para guardar)"
        value={content}
        onChange={e => setContent(e.target.value)}
        rows={4}
        className="bg-[#1e293b] border-[#334155] text-[#f8fafc] placeholder:text-[#475569] resize-none text-sm flex-1"
      />

      <div className="flex gap-2 items-center">
        <Select value={tag} onValueChange={v => setTag(v as Tag)}>
          <SelectTrigger className="bg-[#1e293b] border-[#334155] text-[#f8fafc] h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1e293b] border-[#334155] text-[#f8fafc]">
            {(Object.entries(TAG_LABELS) as [Tag, string][]).map(([value, label]) => (
              <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={handleSave}
          disabled={saving || !content.trim() || saved}
          className="bg-[#0d9488] hover:bg-[#0f766e] text-white h-8 px-3 text-xs gap-1.5 shrink-0"
        >
          {saved ? <Check size={13} /> : null}
          {saved ? 'Guardado' : saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>

      <p className="text-[#334155] text-[10px] text-center">Esc para cerrar · Ctrl+Enter para guardar</p>
    </div>
  )
}
