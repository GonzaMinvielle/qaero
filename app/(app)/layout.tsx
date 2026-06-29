import { Sidebar } from '@/components/layout/Sidebar'
import { QuickNoteButton } from '@/components/layout/QuickNoteButton'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#0f172a]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <QuickNoteButton />
    </div>
  )
}
