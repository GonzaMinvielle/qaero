'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Send, Loader2, X } from 'lucide-react'

type Message = { role: 'user' | 'assistant'; content: string }

export default function ChatPopupPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (question: string) => {
    if (!question.trim() || streaming) return
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setInput('')
    setStreaming(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/knowledge-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ question, userId: session?.user?.id }),
      })

      if (!res.ok || !res.body) throw new Error('Error en el servidor')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value, { stream: true }).split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const token = JSON.parse(data).token || ''
            fullText += token
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: 'assistant', content: fullText }
              return updated
            })
          } catch {}
        }
      }
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: `Error: ${err.message}` }
        return updated
      })
    }
    setStreaming(false)
  }

  return (
    <div className="h-screen w-screen bg-[#0f172a] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e293b] shrink-0">
        <span className="text-[#94a3b8] text-xs font-medium tracking-wide uppercase">Chat QA</span>
        <button onClick={() => window.close()} className="text-[#475569] hover:text-[#94a3b8] transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-[#475569] text-xs text-center mt-4">Preguntá sobre tareas, notas o knowledge base</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed ${
              m.role === 'user'
                ? 'bg-[#0d9488] text-white'
                : 'bg-[#1e293b] border border-[#334155] text-[#f8fafc]'
            }`}>
              {m.content}
              {streaming && i === messages.length - 1 && m.role === 'assistant' && (
                <span className="inline-block w-1 h-3 bg-[#0d9488] ml-1 animate-pulse align-text-bottom" />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-2 border-t border-[#1e293b] shrink-0">
        <div className="flex gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Preguntá algo... (Enter para enviar)"
            rows={2}
            className="bg-[#1e293b] border-[#334155] text-[#f8fafc] placeholder:text-[#475569] resize-none text-xs"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
              if (e.key === 'Escape') window.close()
            }}
          />
          <Button
            onClick={() => send(input)}
            disabled={streaming || !input.trim()}
            className="bg-[#0d9488] hover:bg-[#0f766e] text-white self-end h-8 w-8 p-0 shrink-0"
          >
            {streaming ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </Button>
        </div>
      </div>
    </div>
  )
}
