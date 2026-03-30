import { NextResponse } from 'next/server'
import { updateSession, createMiddlewareClient } from './src/lib/supabase/middleware'

const PRIVATE_PREFIXES = ['/folia', '/aral-calc/private', '/acceso-privado']

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export async function middleware(request) {
  const baseResponse = await updateSession(request)

  if (!isPrivatePath(request.nextUrl.pathname)) {
    return baseResponse
  }

  const { supabase } = createMiddlewareClient(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = new URL('/acceso', request.url)
    loginUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return baseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
