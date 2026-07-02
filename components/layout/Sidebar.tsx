'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ClipboardList, History, StickyNote, MessageSquare, BookOpen, Settings, LogOut, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: null, emoji: '🏠' },
  { href: '/tasks', label: 'Tareas', icon: null, emoji: '📋' },
  { href: '/history', label: 'Historial', icon: null, emoji: '📜' },
  { href: '/quick-notes', label: 'Notas rápidas', icon: null, emoji: '📝' },
  { href: '/chat', label: 'Chat', icon: null, emoji: '💬' },
  { href: '/knowledge', label: 'Knowledge base', icon: null, emoji: '📚' },
  { href: '/trello', label: 'Mi Trello', icon: null, emoji: '🔗' },
]

const adminItems = [
  { href: '/admin/knowledge', label: 'Knowledge', emoji: '📄' },
  { href: '/admin/users', label: 'Usuarios', emoji: '👥' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const { isAdmin } = useAuth()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-[#1e293b] border-r border-[#334155] transition-all duration-200',
        collapsed ? 'w-14' : 'w-60'
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-[#334155]">
        {!collapsed && (
          <span className="font-bold text-[#f8fafc] text-base">QAero</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-[#334155] text-[#94a3b8] ml-auto"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-4 py-2 text-sm transition-colors rounded mx-2',
              pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                ? 'bg-[#0d9488]/20 text-[#0d9488]'
                : 'text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#334155]'
            )}
          >
            <span className="text-base">{item.emoji}</span>
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}

        {isAdmin && (
          <>
            <div className={cn('px-4 py-2 text-xs text-[#94a3b8] font-medium uppercase tracking-wider', collapsed && 'hidden')}>
              Admin
            </div>
            {adminItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-2 text-sm transition-colors rounded mx-2',
                  pathname.startsWith(item.href)
                    ? 'bg-[#0d9488]/20 text-[#0d9488]'
                    : 'text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#334155]'
                )}
              >
                <span className="text-base">{item.emoji}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-[#334155]">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 text-sm text-[#94a3b8] hover:text-[#ef4444] w-full"
        >
          <LogOut size={16} />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  )
}
