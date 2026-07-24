'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

type Props = {
  open: boolean
  onClose: () => void
  task: any
  checklistItems: any[]
  notes: any[]
}

export function TrelloReportModal({ open, onClose, task, checklistItems, notes }: Props) {
  const [report, setReport] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const supabase = createClient()

  const generate = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-trello-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          title: task.title,
          checklist_items: checklistItems.map(i => ({ text: i.text, status: i.status, note: i.note, type: i.type })),
          notes: notes.map(n => n.content),
        }),
      })
      const data = await res.json()
      setReport(data.report || '')
    } catch {
      toast.error('Error generando reporte')
    }
    setLoading(false)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(report)
    setCopied(true)
    toast.success('Copiado al portapapeles')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setReport('') } }}>
      <DialogContent className="bg-[#1e293b] border-[#334155] text-[#f8fafc] max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reporte para Trello</DialogTitle>
        </DialogHeader>
        {!report ? (
          <div className="text-center py-6">
            <p className="text-[#94a3b8] mb-4 text-sm">Generá un resumen listo para pegar en Trello con toda la info de la tarea.</p>
            <Button onClick={generate} disabled={loading} className="bg-[#0d9488] hover:bg-[#0f766e] text-white gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Generando...' : 'Generar reporte'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <pre className="bg-[#0f172a] border border-[#334155] rounded p-4 text-sm text-[#f8fafc] whitespace-pre-wrap font-mono overflow-y-auto max-h-96">
              {report}
            </pre>
            <div className="flex gap-2">
              <Button onClick={copy} className="bg-[#334155] hover:bg-[#475569] text-[#f8fafc] gap-2">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
              <Button onClick={generate} disabled={loading} variant="ghost" className="text-[#94a3b8]">
                Regenerar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
