'use client'

import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { QuickNoteModal } from '@/components/quick-notes/QuickNoteModal'

export function QuickNoteButton() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[#0d9488] hover:bg-[#0f766e] text-white flex items-center justify-center shadow-lg transition-colors"
        title="Nueva nota rápida (Ctrl+Shift+N)"
      >
        <Plus size={22} />
      </button>
      <QuickNoteModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
