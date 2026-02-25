import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getAssistantSettings, resolveAudienceRole } from "@/lib/hq-assistant";

type SearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  type: "project" | "client" | "task" | "message" | "deliverable" | "journal";
};

async function safeProjects(
  supabase: Awaited<ReturnType<typeof createClient>>,
  q: string,
  limit: number,
  portal = false,
) {
  try {
    let query = supabase
      .from("projects")
      .select("id, project_name, name, client_name, status, updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (q) {
      query = query.or(`project_name.ilike.%${q}%,name.ilike.%${q}%,client_name.ilike.%${q}%`);
    }

    const { data } = await query;
    return (data ?? []).map((row) => {
      const title = String((row as Record<string, unknown>).project_name ?? (row as Record<string, unknown>).name ?? "Projeto");
      const status = String((row as Record<string, unknown>).status ?? "");
      const client = String((row as Record<string, unknown>).client_name ?? "").trim();
      return {
        id: String((row as Record<string, unknown>).id),
        title,
        subtitle: [client, status].filter(Boolean).join(" · "),
        href: portal
          ? `/portal/projects/${String((row as Record<string, unknown>).id)}`
          : `/app/projects/${String((row as Record<string, unknown>).id)}`,
        type: "project",
      } satisfies SearchItem;
    });
  } catch {
    return [] as SearchItem[];
  }
}

async function safeClients(supabase: Awaited<ReturnType<typeof createClient>>, q: string, limit: number) {
  try {
    let query = supabase
      .from("clients")
      .select("id, name, email, company, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (q) {
      query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`);
    }

    const { data } = await query;
    return (data ?? []).map((row) => {
      const title = String((row as Record<string, unknown>).name ?? "Cliente");
      const email = String((row as Record<string, unknown>).email ?? "").trim();
      const company = String((row as Record<string, unknown>).company ?? "").trim();
      return {
        id: String((row as Record<string, unknown>).id),
        title,
        subtitle: [company, email].filter(Boolean).join(" · "),
        href: "/app/clients",
        type: "client",
      } satisfies SearchItem;
    });
  } catch {
    return [] as SearchItem[];
  }
}

async function safeTasks(supabase: Awaited<ReturnType<typeof createClient>>, q: string, limit: number) {
  try {
    let query = supabase
      .from("tasks")
      .select("id, title, status, project_id, due_date, updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (q) {
      query = query.ilike("title", `%${q}%`);
    }

    let { data } = await query;

    if (!data) {
      const fallback = supabase
        .from("tasks")
        .select("id, title, status, project_id, due_date, updated_at")
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (q) {
        ({ data } = await fallback.ilike("title", `%${q}%`));
      } else {
        ({ data } = await fallback);
      }
    }

    return (data ?? []).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      title: String((row as Record<string, unknown>).title ?? "Tarefa"),
      subtitle: String((row as Record<string, unknown>).status ?? ""),
      href: "/app/tasks",
      type: "task",
    } satisfies SearchItem));
  } catch {
    return [] as SearchItem[];
  }
}

async function safeMessages(supabase: Awaited<ReturnType<typeof createClient>>, q: string, limit: number) {
  try {
    let query = supabase
      .from("messages")
      .select("id, body, conversation_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (q) {
      query = query.ilike("body", `%${q}%`);
    }

    const { data } = await query;
    return (data ?? []).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      title: String((row as Record<string, unknown>).body ?? "Mensagem").slice(0, 88),
      subtitle: `Conversa ${String((row as Record<string, unknown>).conversation_id ?? "")}`,
      href: "/app/inbox",
      type: "message",
    } satisfies SearchItem));
  } catch {
    return [] as SearchItem[];
  }
}

async function safeDeliverables(supabase: Awaited<ReturnType<typeof createClient>>, q: string, limit: number, portal = false) {
  try {
    let query = supabase
      .from("deliverables")
      .select("id, project_id, title, status, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (q) {
      query = query.ilike("title", `%${q}%`);
    }

    const { data } = await query;
    return (data ?? []).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      title: String((row as Record<string, unknown>).title ?? "Entregável"),
      subtitle: String((row as Record<string, unknown>).status ?? ""),
      href: portal
        ? `/portal/review/${String((row as Record<string, unknown>).id)}`
        : `/portal/review/${String((row as Record<string, unknown>).id)}`,
      type: "deliverable",
    } satisfies SearchItem));
  } catch {
    return [] as SearchItem[];
  }
}

async function safeJournal(supabase: Awaited<ReturnType<typeof createClient>>, q: string, limit: number) {
  try {
    let query = supabase
      .from("journal_entries")
      .select("id, title, body, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (q) {
      query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
    }

    let { data } = await query;
    if (!data) {
      const fallback = supabase
        .from("journal_entries")
        .select("id, title, body, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (q) {
        ({ data } = await fallback.or(`title.ilike.%${q}%,body.ilike.%${q}%`));
      } else {
        ({ data } = await fallback);
      }
    }

    return (data ?? []).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      title: String((row as Record<string, unknown>).title ?? "Journal"),
      subtitle: String((row as Record<string, unknown>).body ?? "").slice(0, 90),
      href: "/app/journal",
      type: "journal",
    } satisfies SearchItem));
  } catch {
    return [] as SearchItem[];
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const settings = await getAssistantSettings(supabase);
  if (!settings.enableHqAssistant) {
    return NextResponse.json({ error: "HQ Assistant desativado" }, { status: 403 });
  }

  const q = String(request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 5), 1), 10);
  const role = await resolveAudienceRole(supabase, user);
  const isPortal = request.nextUrl.searchParams.get("scope") === "portal";

  if (role === "client" || role === "collaborator" || isPortal) {
    const [projects, deliverables, messages] = await Promise.all([
      safeProjects(supabase, q, limit, true),
      safeDeliverables(supabase, q, limit, true),
      safeMessages(supabase, q, limit),
    ]);

    return NextResponse.json({
      query: q,
      groups: [
        { key: "projects", label: "Projects", items: projects },
        { key: "deliverables", label: "Deliverables", items: deliverables },
        { key: "messages", label: "Messages", items: messages },
      ],
    });
  }

  const [projects, clients, tasks, messages, deliverables, journal] = await Promise.all([
    safeProjects(supabase, q, limit),
    safeClients(supabase, q, limit),
    safeTasks(supabase, q, limit),
    safeMessages(supabase, q, limit),
    safeDeliverables(supabase, q, limit),
    safeJournal(supabase, q, limit),
  ]);

  return NextResponse.json({
    query: q,
    groups: [
      { key: "projects", label: "Projects", items: projects },
      { key: "clients", label: "Clients", items: clients },
      { key: "tasks", label: "Tasks", items: tasks },
      { key: "messages", label: "Messages", items: messages },
      { key: "deliverables", label: "Deliverables", items: deliverables },
      { key: "journal", label: "Journal", items: journal },
    ],
  });
}
