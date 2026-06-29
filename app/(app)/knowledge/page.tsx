'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'

export default function KnowledgePage() {
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('knowledge_docs')
      .select('id, title, area, tags, status, summary, content, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setDocs(data ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold text-[#f8fafc]">Knowledge Base</h1>

      {loading ? (
        <div className="text-[#94a3b8]">Cargando...</div>
      ) : docs.length === 0 ? (
        <div className="text-[#94a3b8]">Sin documentos. El admin puede subir documentos desde Admin → Knowledge.</div>
      ) : (
        <div className="grid gap-3">
          {docs.map(doc => (
            <div
              key={doc.id}
              className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 cursor-pointer hover:border-[#0d9488] transition-colors"
              onClick={() => setExpanded(expanded === doc.id ? null : doc.id)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-[#f8fafc] font-medium">{doc.title}</h3>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <span className="text-xs bg-[#0d9488]/20 text-[#0d9488] px-2 py-0.5 rounded">{doc.area}</span>
                    {doc.tags && doc.tags.split(',').map((tag: string) => (
                      <span key={tag} className="text-xs bg-[#334155] text-[#94a3b8] px-2 py-0.5 rounded">{tag.trim()}</span>
                    ))}
                  </div>
                </div>
                <span className="text-xs text-[#94a3b8]">{new Date(doc.created_at).toLocaleDateString('es-AR')}</span>
              </div>
              {expanded === doc.id && (doc.summary || doc.content) && (
                <div className="mt-3 text-sm text-[#94a3b8] border-t border-[#334155] pt-3 whitespace-pre-wrap">
                  {doc.summary || doc.content}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
