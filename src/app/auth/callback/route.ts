
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  // Validate `next` to prevent open redirect — only allow relative paths within the app
  const rawNext = searchParams.get('next') ?? '/app';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/app';
  const origin = request.headers.get('x-forwarded-host')
    ? `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('x-forwarded-host')}`
    : request.nextUrl.origin;

  if (process.env.NODE_ENV === 'development') console.log('[callback] code:', code);

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    if (process.env.NODE_ENV === 'development') console.log('[callback] supabase error:', error.message);
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
