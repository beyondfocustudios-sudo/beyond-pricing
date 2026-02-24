"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { slugify } from "@/lib/utils";
import {
  Plus, Users, ChevronRight, X, Building2, User,
  Mail, Shield, FolderOpen, Check, AlertCircle, Copy,
  Loader2, Lock,
} from "lucide-react";

interface Client {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  _projectCount?: number;
  _memberCount?: number;
}

interface Project {
  id: string;
  project_name: string;
  client_id: string | null;
  status: string;
}

interface ClientUser {
  id: string;
  user_id: string;
  role: string;
  email?: string;
}

type Modal =
  | { type: "create_client" }
  | { type: "create_user"; clientId: string; clientName: string }
  | { type: "assign_project"; clientId: string; clientName: string }
  | { type: "members"; clientId: string; clientName: string };

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Modal | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orgRole, setOrgRole] = useState<string | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);

  const [newClientName, setNewClientName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"client_viewer" | "client_approver">("client_viewer");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [unassignedProjects, setUnassignedProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [members, setMembers] = useState<ClientUser[]>([]);
  const [selectedMemberProjectId, setSelectedMemberProjectId] = useState("");
  const [allProjects, setAllProjects] = useState<Project[]>([]);

  const load = useCallback(async () => {
    const sb = createClient();

    // Check org role via API (reads team_members + app_metadata)
    const roleRes = await fetch("/api/admin/org-role");
    if (roleRes.ok) {
      const roleData = await roleRes.json() as { role: string | null; isAdmin: boolean };
      setOrgRole(roleData.role);
      setIsAdmin(roleData.isAdmin);
    }
    setAccessChecked(true);

    // Load clients (RLS will allow if in team_members)
    const { data: clientsData } = await sb
      .from("clients")
      .select("id, name, slug, created_at")
      .order("created_at", { ascending: false });

    // Enrich with counts
    const enriched = await Promise.all(
      (clientsData ?? []).map(async (c) => {
        const { count: projCount } = await sb
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("client_id", c.id);
        const { count: memberCount } = await sb
          .from("client_users")
          .select("id", { count: "exact", head: true })
          .eq("client_id", c.id);
        return { ...c, _projectCount: projCount ?? 0, _memberCount: memberCount ?? 0 };
      })
    );

    setClients(enriched);

    // Load all projects
    const { data: projData } = await sb
      .from("projects")
      .select("id, project_name, client_id, status")
      .order("project_name");
    setAllProjects(projData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createClient_ = async () => {
    if (!newClientName.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    const sb = createClient();
    const slug = slugify(newClientName);
    const { error } = await sb.from("clients").insert({ name: newClientName.trim(), slug });
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setNewClientName("");
    setModal(null);
    load();
  };

  const createClientUser = async () => {
    if (modal?.type !== "create_user" || !newEmail.trim() || !newPassword || saving) return;
    setSaving(true);
    setSaveError(null);
    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: newEmail.trim(),
        password: newPassword,
        clientId: modal.clientId,
        role: newRole,
      }),
    });
    const data = await res.json() as { error?: string; password?: string };
    setSaving(false);
    if (!res.ok) { setSaveError(data.error ?? "Erro"); return; }
    setSaveSuccess(`Utilizador criado! Password: ${data.password ?? newPassword}`);
    setNewEmail("");
    setNewPassword("");
    load();
  };

  const assignProject = async () => {
    if (modal?.type !== "assign_project" || !selectedProjectId || saving) return;
    setSaving(true);
    const sb = createClient();
    await sb.from("projects").update({ client_id: modal.clientId }).eq("id", selectedProjectId);
    setSaving(false);
    setSelectedProjectId("");
    setModal(null);
    load();
  };

  const loadMembers = async (clientId: string) => {
    const sb = createClient();
    const { data } = await sb
      .from("client_users")
      .select("id, user_id, role")
      .eq("client_id", clientId);
    setMembers(data ?? []);
  };

  const grantProjectAccess = async (userId: string) => {
    if (!selectedMemberProjectId || saving) return;
    setSaving(true);
    const sb = createClient();
    await sb.from("project_members").upsert(
      { project_id: selectedMemberProjectId, user_id: userId, role: "client_viewer" },
      { onConflict: "project_id,user_id" }
    );
    setSaving(false);
    setSaveSuccess("Acesso concedido!");
  };

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text).catch(() => {});

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      </div>
    );
  }

  // Access denied state
  if (accessChecked && !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
          <Lock className="w-7 h-7 text-white/30" />
        </div>
        <h2 className="text-xl font-bold text-white">Acesso Restrito</h2>
        <p className="text-white/50 text-sm max-w-sm">
          Precisas de ser <strong className="text-white/80">owner</strong> ou <strong className="text-white/80">admin</strong> da organização Beyond Focus para gerir clientes.
        </p>
        <p className="text-white/30 text-xs mt-2">
          O teu role atual: <code className="bg-white/5 px-2 py-0.5 rounded">{orgRole ?? "sem role"}</code>
        </p>
        <p className="text-white/25 text-xs">
          Pede ao owner para correr <code className="bg-white/5 px-1 rounded">/api/admin/bootstrap</code> ou para te adicionar em team_members.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Clientes</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {clients.length === 0 ? "Nenhum cliente ainda" : `${clients.length} cliente${clients.length !== 1 ? "s" : ""}`}
            {orgRole && <span className="ml-2 text-white/25">· {orgRole}</span>}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setModal({ type: "create_client" }); setSaveError(null); setSaveSuccess(null); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white text-gray-900 text-sm font-semibold hover:bg-white/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            Novo Cliente
          </button>
        )}
      </div>

      {/* Empty state */}
      {clients.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
            <Building2 className="w-7 h-7 text-white/20" />
          </div>
          <div>
            <p className="text-white/60 font-medium">Nenhum cliente ainda</p>
            <p className="text-white/30 text-sm mt-1">Cria o primeiro cliente para começar a partilhar projetos.</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => { setModal({ type: "create_client" }); setSaveError(null); setSaveSuccess(null); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white text-gray-900 text-sm font-semibold hover:bg-white/90 transition-all"
            >
              <Plus className="w-4 h-4" />
              Criar 1º Cliente
            </button>
          )}
        </div>
      )}

      {/* Client cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {clients.map((client) => (
          <div
            key={client.id}
            className="rounded-2xl bg-white/5 border border-white/8 p-5 hover:bg-white/8 hover:border-white/15 transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-white/50" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">{client.name}</p>
                  <p className="text-xs text-white/30">/{client.slug}</p>
                </div>
              </div>
              <button
                onClick={() => copyToClipboard(client.slug)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60 transition-all"
                title="Copiar slug"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-4 text-xs text-white/40 mb-4">
              <span className="flex items-center gap-1">
                <FolderOpen className="w-3 h-3" />
                {client._projectCount} projeto{client._projectCount !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {client._memberCount} utilizador{client._memberCount !== 1 ? "es" : ""}
              </span>
            </div>

            {isAdmin && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setModal({ type: "create_user", clientId: client.id, clientName: client.name });
                    setSaveError(null); setSaveSuccess(null);
                  }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/60 hover:text-white transition-all"
                >
                  <User className="w-3.5 h-3.5" /> Convidar utilizador
                </button>
                <button
                  onClick={() => {
                    const unassigned = allProjects.filter(p => !p.client_id);
                    setUnassignedProjects(unassigned);
                    setModal({ type: "assign_project", clientId: client.id, clientName: client.name });
                    setSaveError(null); setSaveSuccess(null);
                  }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/60 hover:text-white transition-all"
                >
                  <FolderOpen className="w-3.5 h-3.5" /> Associar projeto
                </button>
                <button
                  onClick={async () => {
                    await loadMembers(client.id);
                    setModal({ type: "members", clientId: client.id, clientName: client.name });
                    setSaveError(null); setSaveSuccess(null);
                  }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/60 hover:text-white transition-all"
                >
                  <Shield className="w-3.5 h-3.5" /> Membros
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setModal(null); }}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="w-full max-w-md rounded-2xl bg-gray-900 border border-white/10 shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-white">
                  {modal.type === "create_client" && "Novo Cliente"}
                  {modal.type === "create_user" && `Convidar para ${modal.clientName}`}
                  {modal.type === "assign_project" && `Associar Projeto a ${modal.clientName}`}
                  {modal.type === "members" && `Membros de ${modal.clientName}`}
                </h2>
                <button onClick={() => setModal(null)} className="text-white/40 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {modal.type === "create_client" && (
                <div className="space-y-4">
                  <input
                    autoFocus
                    value={newClientName}
                    onChange={e => setNewClientName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && createClient_()}
                    placeholder="Nome do cliente"
                    className="w-full px-4 py-3 rounded-xl bg-white/8 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-white/25"
                  />
                  {newClientName && (
                    <p className="text-xs text-white/40">Slug: <code className="text-white/60">/{slugify(newClientName)}</code></p>
                  )}
                  {saveError && <p className="text-xs text-rose-400">{saveError}</p>}
                  <button
                    onClick={createClient_}
                    disabled={saving || !newClientName.trim()}
                    className="w-full py-3 rounded-xl bg-white text-gray-900 font-semibold disabled:opacity-50 hover:bg-white/90 transition-all"
                  >
                    {saving ? "A criar…" : "Criar cliente"}
                  </button>
                </div>
              )}

              {modal.type === "create_user" && (
                <div className="space-y-3">
                  {saveSuccess ? (
                    <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/25 p-4">
                      <div className="flex items-center gap-2 text-emerald-400 mb-1">
                        <Check className="w-4 h-4" /> Utilizador criado!
                      </div>
                      <p className="text-xs text-white/60 font-mono break-all">{saveSuccess}</p>
                      <button onClick={() => copyToClipboard(saveSuccess)} className="text-xs text-white/40 hover:text-white mt-2 flex items-center gap-1">
                        <Copy className="w-3 h-3" /> Copiar
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        placeholder="Email do utilizador"
                        className="w-full px-4 py-3 rounded-xl bg-white/8 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-white/25"
                      />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Password temporária"
                        className="w-full px-4 py-3 rounded-xl bg-white/8 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-white/25"
                      />
                      <select
                        value={newRole}
                        onChange={e => setNewRole(e.target.value as "client_viewer" | "client_approver")}
                        className="w-full px-4 py-3 rounded-xl bg-white/8 border border-white/10 text-white focus:outline-none"
                      >
                        <option value="client_viewer">Visualizador</option>
                        <option value="client_approver">Aprovador</option>
                      </select>
                      {saveError && <p className="text-xs text-rose-400">{saveError}</p>}
                      <button
                        onClick={createClientUser}
                        disabled={saving || !newEmail.trim() || !newPassword}
                        className="w-full py-3 rounded-xl bg-white text-gray-900 font-semibold disabled:opacity-50 hover:bg-white/90 transition-all"
                      >
                        {saving ? "A criar…" : "Criar utilizador"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {modal.type === "assign_project" && (
                <div className="space-y-3">
                  {unassignedProjects.length === 0 ? (
                    <p className="text-sm text-white/50 text-center py-4">Sem projetos por associar.</p>
                  ) : (
                    <>
                      <select
                        value={selectedProjectId}
                        onChange={e => setSelectedProjectId(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-white/8 border border-white/10 text-white focus:outline-none"
                      >
                        <option value="">Selecionar projeto…</option>
                        {unassignedProjects.map(p => (
                          <option key={p.id} value={p.id}>{p.project_name}</option>
                        ))}
                      </select>
                      <button
                        onClick={assignProject}
                        disabled={saving || !selectedProjectId}
                        className="w-full py-3 rounded-xl bg-white text-gray-900 font-semibold disabled:opacity-50 hover:bg-white/90 transition-all"
                      >
                        {saving ? "A associar…" : "Associar"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {modal.type === "members" && (
                <div className="space-y-3">
                  {members.length === 0 ? (
                    <p className="text-sm text-white/50 text-center py-4">Sem membros ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {members.map((m) => (
                        <div key={m.id} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <User className="w-4 h-4 text-white/40" />
                            <div>
                              <p className="text-sm text-white/80">{m.email ?? m.user_id.slice(0, 8)}</p>
                              <p className="text-xs text-white/40">{m.role}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedMemberProjectId}
                              onChange={e => setSelectedMemberProjectId(e.target.value)}
                              className="text-xs px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none"
                            >
                              <option value="">+ Projeto</option>
                              {allProjects.map(p => (
                                <option key={p.id} value={p.id}>{p.project_name}</option>
                              ))}
                            </select>
                            {selectedMemberProjectId && (
                              <button
                                onClick={() => grantProjectAccess(m.user_id)}
                                disabled={saving}
                                className="text-xs px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/70 transition-all"
                              >
                                {saving ? "…" : "Dar acesso"}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {saveSuccess && (
                    <div className="flex items-center gap-2 text-emerald-400 text-xs">
                      <Check className="w-3.5 h-3.5" /> {saveSuccess}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
