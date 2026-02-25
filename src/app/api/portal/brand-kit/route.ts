import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { getProjectAccess } from "@/lib/review-auth";

type ProjectRow = {
  id: string;
  client_id: string | null;
  user_id: string | null;
  owner_user_id: string | null;
  inputs?: Record<string, unknown> | null;
};

type BrandColorInput = { name?: string | null; hex?: string | null };
type BrandFontInput = { name?: string | null; usage?: string | null };
type BrandAssetInput = { assetType?: string | null; label?: string | null; fileUrl?: string | null };

type FallbackVersion = { id: string; version_number: number; summary: string; created_at: string };

type FallbackPayload = {
  title: string;
  logos: string[];
  guidelines: string;
  applyPortalAccent: boolean;
  accentLight: string;
  accentDark: string;
  autoAdjusted: boolean;
  colors: Array<{ name: string; hex: string }>;
  fonts: Array<{ name: string; usage?: string }>;
  assets: Array<{ assetType: string; label?: string; fileUrl: string }>;
};

function normalizeHex(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim().replace(/^#/, "");
  if (!raw) return null;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const expanded = raw.split("").map((c) => c + c).join("");
    return `#${expanded.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function adjustLightness(hex: string, factor: number) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function deriveAccents(preferredHex: string | null): { accentLight: string; accentDark: string; adjusted: boolean } {
  const fallback = "#1A8FA3";
  const base = preferredHex ?? fallback;
  let accentLight = base;
  let adjusted = false;

  const luminance = relativeLuminance(base);
  if (luminance > 0.72) {
    accentLight = adjustLightness(base, 0.7);
    adjusted = true;
  } else if (luminance < 0.12) {
    accentLight = adjustLightness(base, 1.35);
    adjusted = true;
  }

  const accentDark = adjustLightness(accentLight, 1.18);
  return { accentLight, accentDark, adjusted };
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const code = String(error.code ?? "").toUpperCase();
  const message = String(error.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("schema cache") || message.includes("does not exist");
}

function extractFallback(inputs: Record<string, unknown> | null | undefined) {
  const root = (inputs && typeof inputs === "object" ? inputs : {}) as Record<string, unknown>;
  const brand = (root.brand_kit && typeof root.brand_kit === "object" ? root.brand_kit : {}) as Record<string, unknown>;
  const versionsRaw = Array.isArray(root.brand_kit_versions) ? root.brand_kit_versions : [];

  const payload: FallbackPayload = {
    title: String(brand.title ?? "Brand Kit"),
    logos: Array.isArray(brand.logos) ? brand.logos.map((v) => String(v)).filter(Boolean) : [],
    guidelines: String(brand.guidelines ?? ""),
    applyPortalAccent: Boolean(brand.applyPortalAccent),
    accentLight: String(brand.accentLight ?? "#1A8FA3"),
    accentDark: String(brand.accentDark ?? "#63C7D7"),
    autoAdjusted: Boolean(brand.autoAdjusted),
    colors: Array.isArray(brand.colors)
      ? brand.colors
          .map((entry) => {
            const row = entry as Record<string, unknown>;
            return { name: String(row.name ?? ""), hex: String(row.hex ?? "") };
          })
          .filter((row) => Boolean(row.hex))
      : [],
    fonts: Array.isArray(brand.fonts)
      ? brand.fonts
          .map((entry) => {
            const row = entry as Record<string, unknown>;
            return { name: String(row.name ?? ""), usage: String(row.usage ?? "") };
          })
          .filter((row) => Boolean(row.name))
      : [],
    assets: Array.isArray(brand.assets)
      ? brand.assets
          .map((entry) => {
            const row = entry as Record<string, unknown>;
            return { assetType: String(row.assetType ?? "logo"), label: String(row.label ?? ""), fileUrl: String(row.fileUrl ?? "") };
          })
          .filter((row) => Boolean(row.fileUrl))
      : [],
  };

  const versions: FallbackVersion[] = versionsRaw
    .map((entry, index) => {
      const row = entry as Record<string, unknown>;
      return {
        id: String(row.id ?? `fallback-${index}`),
        version_number: Number(row.version_number ?? index + 1),
        summary: String(row.summary ?? "Atualização do Brand Kit"),
        created_at: String(row.created_at ?? new Date().toISOString()),
      };
    })
    .sort((a, b) => b.version_number - a.version_number);

  return { payload, versions };
}

async function getProject(supabase: Awaited<ReturnType<typeof createClient>>, projectId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, client_id, user_id, owner_user_id, inputs")
    .eq("id", projectId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: String(data.id),
    client_id: (data.client_id as string | null) ?? null,
    user_id: (data.user_id as string | null) ?? null,
    owner_user_id: (data.owner_user_id as string | null) ?? null,
    inputs: (data.inputs as Record<string, unknown> | null) ?? null,
  } as ProjectRow;
}

async function notifyInternalTeam(admin: ReturnType<typeof createServiceClient>, projectId: string, actorUserId: string, payload: Record<string, unknown>) {
  const { data: internalMembers } = await admin
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .in("role", ["owner", "admin", "editor", "producer"]);

  const recipientIds = Array.from(new Set((internalMembers ?? [])
    .map((row) => String(row.user_id ?? ""))
    .filter((id) => Boolean(id) && id !== actorUserId)));

  if (recipientIds.length === 0) return;

  await admin.from("notifications").insert(
    recipientIds.map((recipientId) => ({
      user_id: recipientId,
      type: "brand_kit_updated",
      payload,
    })),
  );

  if (!(process.env.RESEND_API_KEY || process.env.SMTP_HOST)) {
    await admin.from("email_outbox").insert(
      recipientIds.map((recipientId) => ({
        to_email: `team+${recipientId}@placeholder`,
        template: "brand_kit_updated",
        payload,
        status: "pending",
      })),
    );
  }
}

export async function GET(req: NextRequest) {
  const projectId = String(req.nextUrl.searchParams.get("projectId") ?? "").trim();
  if (!projectId) return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const project = await getProject(supabase, projectId);
  if (!project || !project.client_id) return NextResponse.json({ error: "Projeto sem cliente associado" }, { status: 404 });

  const access = await getProjectAccess(supabase, project, user.id);
  if (!access.canRead) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });

  const admin = createServiceClient();

  const kitRes = await admin
    .from("brand_kits")
    .select("id, client_id, project_id, title, logos, accent_light, accent_dark, apply_portal_accent, notes, auto_adjusted, updated_at")
    .eq("client_id", project.client_id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isMissingTableError(kitRes.error)) {
    const fallback = extractFallback(project.inputs);
    return NextResponse.json({
      kit: {
        id: null,
        title: fallback.payload.title,
        logos: fallback.payload.logos,
        notes: fallback.payload.guidelines,
        apply_portal_accent: fallback.payload.applyPortalAccent,
        accent_light: fallback.payload.accentLight,
        accent_dark: fallback.payload.accentDark,
        auto_adjusted: fallback.payload.autoAdjusted,
      },
      colors: fallback.payload.colors,
      fonts: fallback.payload.fonts,
      assets: fallback.payload.assets,
      versions: fallback.versions,
      fallback: true,
    });
  }

  if (kitRes.error) return NextResponse.json({ error: kitRes.error.message }, { status: 500 });

  if (!kitRes.data) {
    const fallback = extractFallback(project.inputs);
    return NextResponse.json({
      kit: null,
      colors: fallback.payload.colors,
      fonts: fallback.payload.fonts,
      assets: fallback.payload.assets,
      versions: fallback.versions,
    });
  }

  const kit = kitRes.data;

  const [colorsRes, fontsRes, assetsRes, versionsRes] = await Promise.all([
    admin.from("brand_colors").select("id, name, hex, source, created_at").eq("brand_kit_id", kit.id).order("created_at", { ascending: true }),
    admin.from("brand_fonts").select("id, name, usage, created_at").eq("brand_kit_id", kit.id).order("created_at", { ascending: true }),
    admin.from("brand_assets").select("id, asset_type, label, file_url, created_at").eq("brand_kit_id", kit.id).order("created_at", { ascending: true }),
    admin.from("brand_kit_versions").select("id, version_number, summary, payload, created_at").eq("brand_kit_id", kit.id).order("version_number", { ascending: false }).limit(20),
  ]);

  return NextResponse.json({
    kit,
    colors: colorsRes.data ?? [],
    fonts: fontsRes.data ?? [],
    assets: assetsRes.data ?? [],
    versions: versionsRes.data ?? [],
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    projectId?: string;
    title?: string;
    logos?: string[];
    guidelines?: string;
    applyPortalAccent?: boolean;
    colors?: BrandColorInput[];
    fonts?: BrandFontInput[];
    assets?: BrandAssetInput[];
    summary?: string;
  };

  const projectId = String(body.projectId ?? "").trim();
  if (!projectId) return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const project = await getProject(supabase, projectId);
  if (!project || !project.client_id) return NextResponse.json({ error: "Projeto sem cliente associado" }, { status: 404 });

  const access = await getProjectAccess(supabase, project, user.id);
  if (!(access.canWrite || access.isClientUser)) return NextResponse.json({ error: "Sem permissão para editar brand kit" }, { status: 403 });

  const colors = (body.colors ?? [])
    .map((entry) => ({ name: String(entry.name ?? "").trim() || null, hex: normalizeHex(entry.hex) }))
    .filter((entry) => Boolean(entry.hex)) as Array<{ name: string | null; hex: string }>;

  const fonts = (body.fonts ?? [])
    .map((entry) => ({ name: String(entry.name ?? "").trim(), usage: String(entry.usage ?? "").trim() || null }))
    .filter((entry) => Boolean(entry.name));

  const assets = (body.assets ?? [])
    .map((entry) => ({
      asset_type: String(entry.assetType ?? "logo").trim() || "logo",
      label: String(entry.label ?? "").trim() || null,
      file_url: String(entry.fileUrl ?? "").trim() || null,
    }))
    .filter((entry) => Boolean(entry.file_url));

  const logos = (body.logos ?? []).map((logo) => String(logo ?? "").trim()).filter(Boolean);
  const guidelines = String(body.guidelines ?? "").trim() || "";
  const summary = String(body.summary ?? "Brand Kit atualizado no portal").trim() || "Brand Kit atualizado no portal";

  const derived = deriveAccents(colors[0]?.hex ?? null);
  const now = new Date().toISOString();
  const admin = createServiceClient();

  const payload = {
    project_id: project.id,
    client_id: project.client_id,
    title: String(body.title ?? "Brand Kit").trim() || "Brand Kit",
    logos,
    notes: guidelines,
    apply_portal_accent: Boolean(body.applyPortalAccent),
    accent_light: derived.accentLight,
    accent_dark: derived.accentDark,
    auto_adjusted: derived.adjusted,
    updated_by: user.id,
    updated_at: now,
  };

  const existingKitRes = await admin
    .from("brand_kits")
    .select("id")
    .eq("client_id", project.client_id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isMissingTableError(existingKitRes.error)) {
    const fallback = extractFallback(project.inputs);
    const nextVersion = (fallback.versions[0]?.version_number ?? 0) + 1;

    const nextPayload: FallbackPayload = {
      title: payload.title,
      logos,
      guidelines,
      applyPortalAccent: payload.apply_portal_accent,
      accentLight: payload.accent_light,
      accentDark: payload.accent_dark,
      autoAdjusted: payload.auto_adjusted,
      colors: colors.map((entry) => ({ name: entry.name ?? "", hex: entry.hex })),
      fonts: fonts.map((entry) => ({ name: entry.name, usage: entry.usage ?? "" })),
      assets: assets.map((entry) => ({ assetType: entry.asset_type, label: entry.label ?? "", fileUrl: String(entry.file_url) })),
    };

    const versions: FallbackVersion[] = [
      {
        id: `fallback-${nextVersion}`,
        version_number: nextVersion,
        summary,
        created_at: now,
      },
      ...fallback.versions,
    ].slice(0, 20);

    const nextInputs: Record<string, unknown> = {
      ...((project.inputs ?? {}) as Record<string, unknown>),
      brand_kit: nextPayload,
      brand_kit_versions: versions,
    };

    const updateProject = await admin
      .from("projects")
      .update({ inputs: nextInputs, updated_at: now })
      .eq("id", project.id);

    if (updateProject.error) {
      return NextResponse.json({ error: updateProject.error.message }, { status: 500 });
    }

    await notifyInternalTeam(admin, project.id, user.id, {
      project_id: project.id,
      client_id: project.client_id,
      brand_kit_id: "fallback",
      version: nextVersion,
      by: user.id,
      fallback: true,
    });

    return NextResponse.json({
      ok: true,
      brandKitId: "fallback",
      version: nextVersion,
      accentLight: derived.accentLight,
      accentDark: derived.accentDark,
      autoAdjusted: derived.adjusted,
      fallback: true,
    });
  }

  if (existingKitRes.error) return NextResponse.json({ error: existingKitRes.error.message }, { status: 500 });

  let brandKitId = existingKitRes.data?.id as string | undefined;
  if (brandKitId) {
    const update = await admin.from("brand_kits").update(payload).eq("id", brandKitId);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  } else {
    const insert = await admin
      .from("brand_kits")
      .insert({ ...payload, created_by: user.id, created_at: now })
      .select("id")
      .single();

    if (insert.error || !insert.data) {
      return NextResponse.json({ error: insert.error?.message ?? "Falha ao criar brand kit" }, { status: 500 });
    }

    brandKitId = String(insert.data.id);
  }

  await Promise.all([
    admin.from("brand_colors").delete().eq("brand_kit_id", brandKitId),
    admin.from("brand_fonts").delete().eq("brand_kit_id", brandKitId),
    admin.from("brand_assets").delete().eq("brand_kit_id", brandKitId),
  ]);

  if (colors.length > 0) {
    await admin.from("brand_colors").insert(colors.map((entry) => ({
      brand_kit_id: brandKitId,
      name: entry.name,
      hex: entry.hex,
      source: "portal",
    })));
  }

  if (fonts.length > 0) {
    await admin.from("brand_fonts").insert(fonts.map((entry) => ({
      brand_kit_id: brandKitId,
      name: entry.name,
      usage: entry.usage,
    })));
  }

  if (assets.length > 0) {
    await admin.from("brand_assets").insert(assets.map((entry) => ({
      brand_kit_id: brandKitId,
      asset_type: entry.asset_type,
      label: entry.label,
      file_url: entry.file_url,
    })));
  }

  const lastVersion = await admin
    .from("brand_kit_versions")
    .select("version_number")
    .eq("brand_kit_id", brandKitId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = Number(lastVersion.data?.version_number ?? 0) + 1;

  await admin.from("brand_kit_versions").insert({
    brand_kit_id: brandKitId,
    version_number: nextVersion,
    summary,
    payload: {
      title: payload.title,
      logos,
      colors,
      fonts,
      assets,
      applyPortalAccent: payload.apply_portal_accent,
      accentLight: payload.accent_light,
      accentDark: payload.accent_dark,
      autoAdjusted: payload.auto_adjusted,
    },
    changed_by: user.id,
    created_at: now,
  });

  await notifyInternalTeam(admin, project.id, user.id, {
    project_id: project.id,
    client_id: project.client_id,
    brand_kit_id: brandKitId,
    version: nextVersion,
    by: user.id,
  });

  return NextResponse.json({
    ok: true,
    brandKitId,
    version: nextVersion,
    accentLight: derived.accentLight,
    accentDark: derived.accentDark,
    autoAdjusted: derived.adjusted,
  });
}
