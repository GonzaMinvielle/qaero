'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, RefreshCw, Eye } from 'lucide-react'

function mask(value: string): string {
  if (!value) return ''
  if (value.length <= 10) return '•'.repeat(value.length)
  return value.slice(0, 6) + '•'.repeat(Math.max(4, value.length - 10)) + value.slice(-4)
}

function SecretInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const [revealing, setRevealing] = useState(false)
  const [editing, setEditing] = useState(false)

  const displayValue = editing ? value : (value ? mask(value) : '')

  return (
    <div className="relative flex items-center">
      <Input
        type={editing ? 'text' : 'text'}
        placeholder={placeholder}
        value={displayValue}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChange={e => {
          if (editing) onChange(e.target.value)
        }}
        className="bg-[#0f172a] border-[#334155] text-[#f8fafc] placeholder:text-[#94a3b8] pr-10 font-mono tracking-widest"
        autoComplete="off"
        spellCheck={false}
      />
      {value && !editing && (
        <button
          type="button"
          onMouseDown={() => setRevealing(true)}
          onMouseUp={() => setRevealing(false)}
          onMouseLeave={() => setRevealing(false)}
          onTouchStart={() => setRevealing(true)}
          onTouchEnd={() => setRevealing(false)}
          className="absolute right-3 text-[#94a3b8] hover:text-[#f8fafc] select-none"
          title="Mantener presionado para ver"
        >
          <Eye size={15} />
        </button>
      )}
      {revealing && value && (
        <div className="absolute -bottom-8 left-0 bg-[#0f172a] border border-[#334155] rounded px-3 py-1 text-xs font-mono text-[#f8fafc] z-10 whitespace-nowrap select-none">
          {mask(value)}
        </div>
      )}
    </div>
  )
}

export default function AdminTrelloPage() {
  const [apiKey, setApiKey] = useState('')
  const [token, setToken] = useState('')
  const [boards, setBoards] = useState<any[]>([])
  const [syncing, setSyncing] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [configured, setConfigured] = useState(false)
  const supabase = createClient()

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

  const call = async (action: string, params = {}) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/trello-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ action, ...params }),
    })
    return res.json()
  }

  useEffect(() => {
    call('check-config').then(data => {
      setConfigured(data.configured)
      if (data.configured) loadBoards()
    })
  }, [])

  const saveConfig = async () => {
    setLoading(true)
    const result = await call('set-config', { trello_api_key: apiKey, trello_token: token })
    if (result.success) {
      toast.success('Configuración guardada')
      setConfigured(true)
      loadBoards()
    } else {
      toast.error(result.error || 'Error guardando config')
    }
    setLoading(false)
  }

  const loadBoards = async () => {
    const result = await call('list-boards')
    setBoards(result.boards ?? [])
  }

  const syncBoard = async (boardId: string, boardName: string) => {
    setSyncing(boardId)
    const result = await call('sync-board', { board_id: boardId, board_name: boardName })
    if (result.success) {
      toast.success(`${result.count} tarjetas sincronizadas de "${boardName}"`)
    } else {
      toast.error(result.error || 'Error sincronizando')
    }
    setSyncing(null)
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-[#f8fafc]">Admin — Trello</h1>

      <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 space-y-5">
        <h2 className="text-[#f8fafc] font-semibold">Credenciales Trello</h2>
        <p className="text-xs text-[#94a3b8]">Clic en el campo para editar · Mantener 👁 presionado para ver valor actual</p>

        <SecretInput
          placeholder="API Key"
          value={apiKey}
          onChange={setApiKey}
        />
        <SecretInput
          placeholder="Token"
          value={token}
          onChange={setToken}
        />

        <Button
          onClick={saveConfig}
          disabled={loading || !apiKey || !token}
          className="bg-[#0d9488] hover:bg-[#0f766e] text-white"
        >
          {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
          Guardar configuración
        </Button>
        {configured && <p className="text-xs text-[#22c55e]">✅ Trello configurado</p>}
      </div>

      {boards.length > 0 && (
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 space-y-3">
          <h2 className="text-[#f8fafc] font-semibold">Boards disponibles</h2>
          {boards.map(board => (
            <div key={board.id} className="flex items-center justify-between p-3 border border-[#334155] rounded">
              <div>
                <div className="text-[#f8fafc] text-sm font-medium">{board.name}</div>
                <div className="text-[#94a3b8] text-xs">{board.url}</div>
              </div>
              <Button
                size="sm"
                onClick={() => syncBoard(board.id, board.name)}
                disabled={syncing === board.id}
                className="bg-[#334155] hover:bg-[#475569] text-[#f8fafc] gap-1"
              >
                {syncing === board.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Sincronizar
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
