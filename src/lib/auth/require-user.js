import { redirect } from 'next/navigation'
import { createClient } from '../supabase/server'

export async function requireUser(redirectTo = '/acceso') {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(redirectTo)
  }

  return { supabase, user }
}
