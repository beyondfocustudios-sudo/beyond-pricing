import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

type ProjectRow = {
  id: string;
  project_name: string;
};

type MilestoneTemplate = {
  title: string;
  phase: "pre_producao" | "rodagem" | "pos_producao";
  status: "pending" | "in_progress" | "done" | "blocked";
  offsetDays: number;
  notes: string;
};

const PROJECT_NAMES = ["Evento Coimbra", "Evento Fátima"];

function readEnv(name: string) {
  if (process.env[name]) return process.env[name] as string;
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return "";
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    if (key !== name) continue;
    return trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return "";
}

const MILESTONES: MilestoneTemplate[] = [
  {
    title: "Kickoff com cliente",
    phase: "pre_producao",
    status: "done",
    offsetDays: -7,
    notes: "Alinhamento inicial de objetivos e referências.",
  },
  {
    title: "Shoot day principal",
    phase: "rodagem",
    status: "in_progress",
    offsetDays: 2,
    notes: "Rodagem no local principal com equipa completa.",
  },
  {
    title: "Delivery V1",
    phase: "pos_producao",
    status: "pending",
    offsetDays: 6,
    notes: "Primeira versão para feedback do cliente.",
  },
  {
    title: "Delivery V2",
    phase: "pos_producao",
    status: "pending",
    offsetDays: 10,
    notes: "Segunda versão após ajustes de revisão.",
  },
  {
    title: "Aprovação final",
    phase: "pos_producao",
    status: "pending",
    offsetDays: 14,
    notes: "Confirmação final do cliente.",
  },
  {
    title: "Entrega final e handoff",
    phase: "pos_producao",
    status: "pending",
    offsetDays: 16,
    notes: "Entrega final e fecho de projeto.",
  },
];

function toDate(offsetDays: number) {
  const now = new Date();
  const target = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  return target.toISOString().slice(0, 10);
}

async function run() {
  const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios em .env.local");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: directProjects, error: directError } = await supabase
    .from("projects")
    .select("id, project_name")
    .in("project_name", PROJECT_NAMES)
    .limit(10);

  if (directError) {
    throw new Error(`Falha a carregar projetos alvo: ${directError.message}`);
  }

  let projects = (directProjects ?? []) as ProjectRow[];

  if (projects.length === 0) {
    const { data: fallbackProjects, error: fallbackError } = await supabase
      .from("projects")
      .select("id, project_name")
      .or("project_name.ilike.%Coimbra%,project_name.ilike.%Fátima%,project_name.ilike.%Fatima%")
      .limit(10);

    if (fallbackError) {
      throw new Error(`Falha no fallback de projetos: ${fallbackError.message}`);
    }
    projects = (fallbackProjects ?? []) as ProjectRow[];
  }

  if (projects.length === 0) {
    console.log("Nenhum projeto Coimbra/Fátima encontrado. Seed não aplicado.");
    return;
  }

  for (const project of projects) {
    const { data: existingRows, error: existingError } = await supabase
      .from("project_milestones")
      .select("title")
      .eq("project_id", project.id);

    if (existingError) {
      throw new Error(`Falha ao ler milestones do projeto ${project.project_name}: ${existingError.message}`);
    }

    const existingTitles = new Set((existingRows ?? []).map((row) => String((row as { title?: string }).title ?? "")));
    const missing = MILESTONES.filter((template) => !existingTitles.has(template.title));

    if (missing.length === 0) {
      console.log(`Projeto "${project.project_name}" já tem milestones WOW.`);
      continue;
    }

    const payload = missing.map((template, index) => ({
      project_id: project.id,
      title: template.title,
      phase: template.phase,
      status: template.status,
      due_date: toDate(template.offsetDays),
      position: index,
      notes: template.notes,
    }));

    const { error: insertError } = await supabase
      .from("project_milestones")
      .insert(payload);

    if (insertError) {
      throw new Error(`Falha ao inserir milestones no projeto ${project.project_name}: ${insertError.message}`);
    }

    console.log(`Seed aplicado em "${project.project_name}": +${payload.length} milestones.`);
  }
}

run()
  .then(() => {
    console.log("Seed de milestones WOW concluído.");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
