'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useQuickNotes } from '@/lib/hooks/useQuickNotes'
import { toast } from 'sonner'

type Props = {
  open: boolean
  onClose: () => void
}

export function QuickNoteModal({ open, onClose }: Props) {
  const [content, setContent] = useState('')
  const [tag, setTag] = useState<'call' | 'test' | 'todo' | 'misc'>('misc')
  const [saving, setSaving] = useState(false)
  const { addNote } = useQuickNotes()

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    await addNote(content.trim(), tag)
    toast.success('Nota guardada')
    setContent('')
    setTag('misc')
    setSaving(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1e293b] border-[#334155] text-[#f8fafc]">
        <DialogHeader>
          <DialogTitle>Nueva nota rápida</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            placeholder="¿Qué anotás?"
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
            className="bg-[#0f172a] border-[#334155] text-[#f8fafc] placeholder:text-[#94a3b8] resize-none"
            autoFocus
          />
          <Select value={tag} onValueChange={v => setTag(v as typeof tag)}>
            <SelectTrigger className="bg-[#0f172a] border-[#334155] text-[#f8fafc]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1e293b] border-[#334155] text-[#f8fafc]">
              <SelectItem value="misc">Gral</SelectItem>
              <SelectItem value="call">📞 Llamada</SelectItem>
              <SelectItem value="test">🧪 Prueba</SelectItem>
              <SelectItem value="todo">✅ Pendiente</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose} className="text-[#94a3b8]">
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !content.trim()}
              className="bg-[#0d9488] hover:bg-[#0f766e] text-white"
            >
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
