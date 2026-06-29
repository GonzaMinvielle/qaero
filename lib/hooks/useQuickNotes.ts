'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type QuickNote = {
  id: string
  content: string
  tag: 'call' | 'test' | 'todo' | 'misc'
  created_at: string
  user_id: string
}

export function useQuickNotes() {
  const [notes, setNotes] = useState<QuickNote[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchNotes = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('quick_notes')
      .select('*')
      .order('created_at', { ascending: false })
    setNotes(data ?? [])
    setLoading(false)
  }

  const addNote = async (content: string, tag: QuickNote['tag']) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('quick_notes').insert({ content, tag, user_id: user.id })
    fetchNotes()
  }

  const deleteNote = async (id: string) => {
    await supabase.from('quick_notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  const updateNote = async (id: string, content: string, tag: QuickNote['tag']) => {
    await supabase.from('quick_notes').update({ content, tag }).eq('id', id)
    fetchNotes()
  }

  useEffect(() => {
    fetchNotes()
  }, [])

  return { notes, loading, addNote, deleteNote, updateNote, refresh: fetchNotes }
}
