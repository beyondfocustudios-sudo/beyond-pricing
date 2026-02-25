import type { SupabaseClient } from "@supabase/supabase-js";
import { hashReviewToken, verifyReviewPassword } from "@/lib/review-links";

export type ReviewLinkResolved = {
  link: {
    id: string;
    deliverable_id: string;
    expires_at: string;
    password_hash: string | null;
    require_auth: boolean;
    single_use: boolean;
    allow_guest_comments: boolean;
    use_count: number;
    used_at: string | null;
  };
  deliverable: {
    id: string;
    project_id: string;
    title: string;
    status: string | null;
  };
};

export async function resolveReviewLink(
  admin: SupabaseClient,
  token: string,
  password?: string | null,
): Promise<{ ok: true; data: ReviewLinkResolved } | { ok: false; status: number; error: string; requiresPassword?: boolean }> {
  const tokenHash = hashReviewToken(token);

  const { data, error } = await admin
    .from("review_links")
    .select("id, deliverable_id, expires_at, password_hash, require_auth, single_use, allow_guest_comments, use_count, used_at, deliverables:deliverable_id(id, project_id, title, status)")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, status: 404, error: "Link de review inválido." };
  }

  const deliverable = Array.isArray(data.deliverables) ? data.deliverables[0] : data.deliverables;
  if (!deliverable) {
    return { ok: false, status: 404, error: "Entregável não encontrado." };
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    return { ok: false, status: 410, error: "Link expirado." };
  }

  if (data.single_use && Number(data.use_count ?? 0) > 0) {
    return { ok: false, status: 410, error: "Link já utilizado." };
  }

  if (data.password_hash) {
    const accepted = verifyReviewPassword(password ?? "", data.password_hash);
    if (!accepted) {
      return {
        ok: false,
        status: 401,
        error: "Password inválida para este link.",
        requiresPassword: true,
      };
    }
  }

  return {
    ok: true,
    data: {
      link: {
        id: data.id as string,
        deliverable_id: data.deliverable_id as string,
        expires_at: data.expires_at as string,
        password_hash: (data.password_hash as string | null) ?? null,
        require_auth: Boolean(data.require_auth),
        single_use: Boolean(data.single_use),
        allow_guest_comments: Boolean(data.allow_guest_comments),
        use_count: Number(data.use_count ?? 0),
        used_at: (data.used_at as string | null) ?? null,
      },
      deliverable: {
        id: deliverable.id as string,
        project_id: deliverable.project_id as string,
        title: deliverable.title as string,
        status: (deliverable.status as string | null) ?? null,
      },
    },
  };
}
