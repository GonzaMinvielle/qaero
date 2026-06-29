'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Task = {
  id: string
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'done'
  visibility: 'private' | 'public'
  trello_card_id: string | null
  created_at: string
  updated_at: string
  user_id: string
  trello_cards?: { card_name: string } | null
  checklist_items?: { id: string; status: string }[]
}

export function useTasks(filter?: { status?: string; trelloList?: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchTasks = async () => {
    setLoading(true)

    if (filter?.trelloList && filter.trelloList !== 'all') {
      const { data: cards } = await supabase
        .from('trello_cards')
        .select('card_id')
        .ilike('list_name', `%${filter.trelloList}%`)

      const cardIds = (cards ?? []).map((c: any) => c.card_id)

      let query = supabase
        .from('tasks')
        .select('*, trello_cards(card_name), checklist_items(id, status)')
        .in('trello_card_id', cardIds.length > 0 ? cardIds : ['__no_match__'])
        .order('updated_at', { ascending: false })

      if (filter?.status && filter.status !== 'all') {
        query = query.eq('status', filter.status)
      }

      const { data } = await query
      setTasks(data ?? [])
      setLoading(false)
      return
    }

    let query = supabase
      .from('tasks')
      .select('*, trello_cards(card_name), checklist_items(id, status)')
      .order('updated_at', { ascending: false })

    if (filter?.status && filter.status !== 'all') {
      query = query.eq('status', filter.status)
    }

    const { data } = await query
    setTasks(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchTasks()
  }, [filter?.status, filter?.trelloList])

  return { tasks, loading, refresh: fetchTasks }
}
