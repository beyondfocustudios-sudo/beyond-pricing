import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  listMicrosoftCalendars,
  syncCalendarProvider,
  upsertCalendarIntegration,
  upsertExternalCalendars,
} from "@/lib/calendar-sync";

const STATE_COOKIE = "bp_microsoft_calendar_oauth_state";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function redirectWithError(request: NextRequest, error: string) {
  return NextResponse.redirect(new URL(`/app/integrations?error=${encodeURIComponent(error)}`, request.url));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return redirectWithError(request, "microsoft_oauth_missing_code");
  }

  let decodedState: { nonce?: string; userId?: string } = {};
  try {
    decodedState = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    return redirectWithError(request, "microsoft_oauth_state_invalid");
  }

  const cookieNonce = request.cookies.get(STATE_COOKIE)?.value;
  if (!cookieNonce || decodedState.nonce !== cookieNonce) {
    return redirectWithError(request, "microsoft_oauth_state_mismatch");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || decodedState.userId !== user.id) {
    return redirectWithError(request, "microsoft_oauth_user_mismatch");
  }

  const redirectUri = new URL("/api/integrations/microsoft/callback", request.nextUrl.origin).toString();
  const tenant = process.env.MICROSOFT_CALENDAR_TENANT_ID || "common";

  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnv("MICROSOFT_CALENDAR_CLIENT_ID"),
      client_secret: requiredEnv("MICROSOFT_CALENDAR_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: "offline_access Calendars.ReadWrite User.Read",
    }).toString(),
  });

  const tokenPayload = await tokenRes.json().catch(() => ({} as { error_description?: string }));
  if (!tokenRes.ok) {
    return redirectWithError(request, tokenPayload.error_description ?? "microsoft_oauth_token_exchange_failed");
  }

  const accessToken = String((tokenPayload as { access_token?: string }).access_token ?? "");
  const refreshToken = (tokenPayload as { refresh_token?: string }).refresh_token ?? null;
  const expiresIn = Number((tokenPayload as { expires_in?: number }).expires_in ?? 3600);
  const scopes = String((tokenPayload as { scope?: string }).scope ?? "").split(" ").filter(Boolean);

  if (!accessToken) {
    return redirectWithError(request, "microsoft_oauth_no_access_token");
  }

  const { data: team } = await supabase
    .from("team_members")
    .select("org_id")
    .eq("user_id", user.id)
    .maybeSingle();

  try {
    const integration = await upsertCalendarIntegration(supabase, {
      userId: user.id,
      orgId: (team?.org_id as string | null) ?? null,
      provider: "microsoft",
      token: {
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + expiresIn * 1000 - 60_000).toISOString(),
        scopes,
      },
    });

    const { data: integrationRow } = await supabase
      .from("calendar_integrations")
      .select("id, user_id, provider, access_token, refresh_token, access_token_enc, refresh_token_enc, expires_at, scopes, metadata")
      .eq("id", integration.id)
      .single();

    if (!integrationRow) {
      throw new Error("Integração guardada sem dados de token");
    }

    const calendars = await listMicrosoftCalendars(supabase, integrationRow);
    await upsertExternalCalendars(supabase, integration.id, calendars);

    await syncCalendarProvider(supabase, {
      provider: "microsoft",
      userId: user.id,
      mode: "full",
    });

    const response = NextResponse.redirect(new URL("/app/integrations?connected=microsoft", request.url));
    response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    const response = redirectWithError(request, error instanceof Error ? error.message : "microsoft_connect_failed");
    response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }
}
