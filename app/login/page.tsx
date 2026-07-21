'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error(error.message)
    } else {
      // Primer login tras el registro: copiar el username de Trello del metadata a profiles
      const trelloUsername = data.user?.user_metadata?.trello_username?.trim()
      if (trelloUsername) {
        const { data: profile } = await supabase.from('profiles').select('trello_username').eq('id', data.user!.id).single()
        if (!profile?.trello_username) {
          await supabase.from('profiles').update({ trello_username: trelloUsername }).eq('id', data.user!.id)
        }
      }
      router.push('/dashboard')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
      <div className="w-full max-w-sm space-y-6 p-8 bg-[#1e293b] rounded-lg border border-[#334155]">
        <div>
          <h1 className="text-2xl font-bold text-[#f8fafc]">QAero</h1>
          <p className="text-[#94a3b8] text-sm mt-1">Iniciá sesión para continuar</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="bg-[#0f172a] border-[#334155] text-[#f8fafc] placeholder:text-[#94a3b8]"
          />
          <Input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="bg-[#0f172a] border-[#334155] text-[#f8fafc] placeholder:text-[#94a3b8]"
          />
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </Button>
        </form>
        <p className="text-center text-sm text-[#94a3b8]">
          ¿No tenés cuenta?{' '}
          <Link href="/register" className="text-[#0d9488] hover:underline">
            Registrate
          </Link>
        </p>
      </div>
    </div>
  )
}
