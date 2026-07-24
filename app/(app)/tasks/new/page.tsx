'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2, Sparkles, RefreshCw } from 'lucide-react'

type ChecklistItem = { text: string; type: 'functional' | 'edge_case' | 'risk' }

export default function NewTaskPage() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [trelloCardId, setTrelloCardId] = useState('')
  const [trelloCards, setTrelloCards] = useState<any[]>([])
  const [selectedCard, setSelectedCard] = useState<any>(null)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncingTesting, setSyncingTesting] = useState(false)
  const [supabaseUrl] = useState(process.env.NEXT_PUBLIC_SUPABASE_URL!)
  const router = useRouter()
  const supabase = createClient()

  const loadTrelloCards = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('trello_cards')
      .select('card_id, card_name, list_name, description, labels, comments')
      .eq('user_id', user.id)
      .ilike('list_name', '%testing%')
      .order('synced_at', { ascending: false })
      .limit(100)
    setTrelloCards(data ?? [])
  }

  useEffect(() => {
    loadTrelloCards()
  }, [])

  const syncTesting = async () => {
    setSyncingTesting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${supabaseUrl}/functions/v1/trello-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'sync-testing' }),
      })
      const result = await res.json()
      if (result.success) {
        console.log('sync-testing boardsScanned:', result.boardsScanned)
        console.log('sync-testing debug:', result.debug)
        toast.success(`${result.count} tuyas de ${result.scanned} encontradas en Testing`)
        await loadTrelloCards()
      } else {
        toast.error(result.error || 'Error sincronizando Testing')
      }
    } catch (e: any) {
      toast.error(e.message)
    }
    setSyncingTesting(false)
  }

  const handleTrelloSelect = (cardId: string) => {
    setTrelloCardId(cardId)
    const card = trelloCards.find(c => c.card_id === cardId)
    if (card) {
      setTitle(card.card_name)
      setSelectedCard(card)
    } else {
      setSelectedCard(null)
    }
  }

  const generateChecklist = async () => {
    if (!title) { toast.error('Ingresá un título'); return }
    setGenerating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-checklist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          title,
          description,
          card_context: selectedCard ? {
            description: selectedCard.description,
            labels: (selectedCard.labels ?? []).map((l: any) => l.name || l).filter(Boolean),
            comments: (selectedCard.comments ?? []).map((c: any) => c.text).filter(Boolean),
          } : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error generando checklist')
      const items: ChecklistItem[] = [
        ...(data.checklist || []).map((text: string) => ({ text, type: 'functional' as const })),
        ...(data.edge_cases || []).map((text: string) => ({ text, type: 'edge_case' as const })),
        ...(data.risks || []).map((text: string) => ({ text, type: 'risk' as const })),
      ]
      setChecklist(items)
      toast.success(`${items.length} ítems generados`)
    } catch (e: any) {
      toast.error(e.message)
    }
    setGenerating(false)
  }

  const handleSave = async () => {
    if (!title) { toast.error('Ingresá un título'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: task, error } = await supabase.from('tasks').insert({
      user_id: user.id,
      title,
      description: description || null,
      trello_card_id: trelloCardId || null,
      status: 'pending',
    }).select().single()

    if (error || !task) { toast.error('Error creando tarea'); setSaving(false); return }

    if (checklist.length > 0) {
      await supabase.from('checklist_items').insert(
        checklist.map((item, i) => ({
          task_id: task.id,
          text: item.text,
          type: item.type,
          status: 'pending',
          sort_order: i,
        }))
      )
    }

    toast.success('Tarea creada')
    router.push(`/tasks/${task.id}`)
  }

  const typeLabel = { functional: '✅ Funcional', edge_case: '⚠️ Edge case', risk: '🔴 Riesgo' }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-[#f8fafc]">Nueva tarea</h1>

      <div className="space-y-4 bg-[#1e293b] border border-[#334155] rounded-lg p-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-[#94a3b8]">Tarjeta Trello (opcional)</label>
            <button
              type="button"
              onClick={syncTesting}
              disabled={syncingTesting}
              className="flex items-center gap-1 text-xs text-[#94a3b8] hover:text-[#f8fafc] transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={syncingTesting ? 'animate-spin' : ''} />
              {syncingTesting ? 'Sincronizando...' : 'Actualizar Testing'}
            </button>
          </div>
          <select
            value={trelloCardId}
            onChange={e => handleTrelloSelect(e.target.value)}
            className="w-full bg-[#0f172a] border border-[#334155] text-[#f8fafc] rounded-md px-3 py-2 text-sm"
          >
            <option value="">— Sin tarjeta Trello —</option>
            {trelloCards.map(c => (
              <option key={c.card_id} value={c.card_id}>
                [{c.list_name}] {c.card_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm text-[#94a3b8] mb-1 block">Título *</label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Nombre de la tarea de testing"
            className="bg-[#0f172a] border-[#334155] text-[#f8fafc] placeholder:text-[#94a3b8]"
          />
        </div>

        <div>
          <label className="text-sm text-[#94a3b8] mb-1 block">Descripción</label>
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Contexto, scope, criterios de aceptación..."
            rows={4}
            className="bg-[#0f172a] border-[#334155] text-[#f8fafc] placeholder:text-[#94a3b8] resize-none"
          />
        </div>

        <Button
          onClick={generateChecklist}
          disabled={generating || !title}
          className="bg-[#334155] hover:bg-[#475569] text-[#f8fafc] gap-2"
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          Generar checklist con IA
        </Button>
      </div>

      {checklist.length > 0 && (
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 space-y-4">
          <h2 className="text-[#f8fafc] font-semibold">Checklist generado ({checklist.length} ítems)</h2>
          {(['functional', 'edge_case', 'risk'] as const).map(type => {
            const items = checklist.filter(i => i.type === type)
            if (!items.length) return null
            return (
              <div key={type}>
                <div className="text-sm text-[#94a3b8] mb-2">{typeLabel[type]}</div>
                <ul className="space-y-1">
                  {items.map((item, i) => (
                    <li key={i} className="text-sm text-[#f8fafc] flex items-start gap-2">
                      <span className="text-[#334155] mt-0.5">•</span>
                      {item.text}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          onClick={handleSave}
          disabled={saving || !title}
          className="bg-[#0d9488] hover:bg-[#0f766e] text-white"
        >
          {saving ? 'Guardando...' : 'Crear tarea'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="text-[#94a3b8]"
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
