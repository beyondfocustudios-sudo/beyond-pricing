import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { resolveAccessRole } from "@/lib/access-role";

const STATE_COOKIE = "bp_microsoft_calendar_oauth_state";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login?next=/app/integrations", request.url));
    }

    const access = await resolveAccessRole(supabase, user);
    if (access.isClient) {
      return NextResponse.redirect(new URL("/portal?mismatch=calendar", request.url));
    }

    const nonce = randomBytes(18).toString("hex");
    const statePayload = Buffer.from(
      JSON.stringify({
        nonce,
        userId: user.id,
        provider: "microsoft",
      }),
    ).toString("base64url");

    const redirectUri = new URL("/api/integrations/microsoft/callback", request.nextUrl.origin).toString();
    const tenant = process.env.MICROSOFT_CALENDAR_TENANT_ID || "common";

    const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
    url.searchParams.set("client_id", requiredEnv("MICROSOFT_CALENDAR_CLIENT_ID"));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", "offline_access Calendars.ReadWrite User.Read");
    url.searchParams.set("state", statePayload);

    const response = NextResponse.redirect(url);
    response.cookies.set(STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });

    return response;
  } catch {
    return NextResponse.redirect(new URL("/app/integrations?error=microsoft_oauth_config", request.url));
  }
}
