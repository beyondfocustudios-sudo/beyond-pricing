"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { slugify } from "@/lib/utils";
import {
  Plus, Users, ChevronRight, X, Building2, User,
  Mail, Shield, FolderOpen, Check, AlertCircle, Copy
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

  // Form states
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
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // Check if user is admin/owner on any project
    const { data: memberCheck } = await sb
      .from("project_members")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .limit(1);

    setIsAdmin((memberCheck?.length ?? 0) > 0);

    const { data: clientsData } = await sb
      .from("clients")
      .select("id, name, slug, created_at")
      .order("created_at", { ascending: false });

    if (!clientsData) { setLoading(false); return; }

    // Get counts
    const enriched = await Promise.all(
      clientsData.map(async (c) => {
        const [projRes, memberRes] = await Promise.all([
          sb.from("projects").select("id", { count: "exact", head: true }).eq("client_id", c.id),
          sb.from("client_users").select("id", { count: "exact", head: true }).eq("client_id", c.id),
        ]);
        return { ...c, _projectCount: projRes.count ?? 0, _memberCount: memberRes.count ?? 0 };
      })
    );
    setClients(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    setSaving(true); setSaveError(null);
    const sb = createClient();
    const slug = slugify(newClientName);
    const { error } = await sb.from("clients").insert({ name: newClientName.trim(), slug });
    if (error) {
      setSaveError(error.message);
    } else {
      setSaveSuccess("Cliente criado com sucesso!");
      setNewClientName("");
      setTimeout(() => { setModal(null); setSaveSuccess(null); load(); }, 1500);
    }
    setSaving(false);
  };

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword) return;
    setSaving(true); setSaveError(null);
    const m = modal as Extract<Modal, { type: "create_user" }>;

    const sb = createClient();
    // Create auth user via Supabase Admin API (through service role — not available client-side)
    // Fallback: use signUp (user gets email verification) but set password
    const { data: signUpData, error: signUpErr } = await sb.auth.signUp({
      email: newEmail,
      password: newPassword,
    });

    if (signUpErr || !signUpData.user) {
      setSaveError(signUpErr?.message ?? "Erro ao criar utilizador");
      setSaving(false);
      return;
    }

    // Link to client
    const { error: linkErr } = await sb.from("client_users").insert({
      client_id: m.clientId,
      user_id: signUpData.user.id,
      role: newRole,
    });

    if (linkErr) {
      setSaveError(linkErr.message);
    } else {
      setSaveSuccess(`Utilizador criado! Email: ${newEmail} / Password: ${newPassword}`);
      setNewEmail(""); setNewPassword("");
    }
    setSaving(false);
  };

  const handleAssignProject = async () => {
    if (!selectedProjectId) return;
    setSaving(true); setSaveError(null);
    const m = modal as Extract<Modal, { type: "assign_project" }>;
    const sb = createClient();
    const { error } = await sb
      .from("projects")
      .update({ client_id: m.clientId })
      .eq("id", selectedProjectId);

    if (error) {
      setSaveError(error.message);
    } else {
      setSaveSuccess("Projeto associado!");
      setSelectedProjectId("");
      setTimeout(() => { setModal(null); setSaveSuccess(null); load(); }, 1200);
    }
    setSaving(false);
  };

  const openAssignProject = async (clientId: string, clientName: string) => {
    const sb = createClient();
    const { data } = await sb
      .from("projects")
      .select("id, project_name, client_id, status")
      .is("client_id", null)
      .order("created_at", { ascending: false });
    setUnassignedProjects((data ?? []) as Project[]);
    setSelectedProjectId("");
    setSaveError(null); setSaveSuccess(null);
    setModal({ type: "assign_project", clientId, clientName });
  };

  const openMembers = async (clientId: string, clientName: string) => {
    const sb = createClient();
    const { data } = await sb
      .from("client_users")
      .select("id, user_id, role")
      .eq("client_id", clientId);
    setMembers((data ?? []) as ClientUser[]);

    // Get all projects for this client
    const { data: pData } = await sb
      .from("projects")
      .select("id, project_name, client_id, status")
      .eq("client_id", clientId);
    setAllProjects((pData ?? []) as Project[]);
    setSaveError(null); setSaveSuccess(null);
    setModal({ type: "members", clientId, clientName });
  };

  const handleAddMemberToProject = async () => {
    if (!selectedMemberProjectId) return;
    // Add all client_users as client_viewer on this project
    const sb = createClient();
    const m = modal as Extract<Modal, { type: "members" }>;
    for (const cu of members) {
      await sb.from("project_members").upsert(
        { project_id: selectedMemberProjectId, user_id: cu.user_id, role: cu.role as "client_viewer" | "client_approver" },
        { onConflict: "project_id,user_id", ignoreDuplicates: false }
      );
    }
    setSaveSuccess("Membros adicionados ao projeto!");
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-PT");

  const resetModal = () => {
    setModal(null);
    setSaveError(null);
    setSaveSuccess(null);
    setNewClientName("");
    setNewEmail("");
    setNewPassword("");
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">Gerir clientes, projetos e acessos ao portal</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setSaveError(null); setSaveSuccess(null); setModal({ type: "create_client" }); }}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" />
            Novo cliente
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="card">
          <div className="flex items-center gap-3 py-4">
            <Shield className="h-5 w-5 shrink-0" style={{ color: "#d97706" }} />
            <p className="text-sm" style={{ color: "var(--text-2)" }}>
              Precisas de ser admin ou owner de um projeto para gerir clientes.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card space-y-3">
              <div className="skeleton h-10 w-10 rounded-xl" />
              <div className="skeleton h-5 w-32" />
              <div className="skeleton h-4 w-24" />
            </div>
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Building2 className="empty-icon" />
            <p className="empty-title">Sem clientes</p>
            <p className="empty-desc">Cria o primeiro cliente para começar</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="card card-hover space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "var(--accent-bg)" }}>
                  <Building2 className="h-5 w-5" style={{ color: "var(--accent)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{c.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>/{c.slug}</p>
                </div>
              </div>

              <div className="flex gap-3 text-xs" style={{ color: "var(--text-3)" }}>
                <span className="flex items-center gap-1">
                  <FolderOpen className="h-3.5 w-3.5" />
                  {c._projectCount} projetos
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {c._memberCount} membros
                </span>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => openAssignProject(c.id, c.name)}
                  className="btn btn-secondary text-xs py-1.5 px-3"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Associar projeto
                </button>
                <button
                  onClick={() => { setSaveError(null); setSaveSuccess(null); setModal({ type: "create_user", clientId: c.id, clientName: c.name }); }}
                  className="btn btn-secondary text-xs py-1.5 px-3"
                >
                  <User className="h-3.5 w-3.5" />
                  Convidar utilizador
                </button>
                <button
                  onClick={() => openMembers(c.id, c.name)}
                  className="btn btn-secondary text-xs py-1.5 px-3"
                >
                  <Users className="h-3.5 w-3.5" />
                  Gerir membros
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── MODALS ── */}
      <AnimatePresence>
        {modal && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={resetModal}
          >
            <motion.div
              className="card-glass"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", maxWidth: 480 }}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: "var(--border)" }}>
                <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>
                  {modal.type === "create_client" && "Novo Cliente"}
                  {modal.type === "create_user" && `Convidar utilizador — ${(modal as Extract<Modal, { type: "create_user" }>).clientName}`}
                  {modal.type === "assign_project" && `Associar projeto — ${(modal as Extract<Modal, { type: "assign_project" }>).clientName}`}
                  {modal.type === "members" && `Membros — ${(modal as Extract<Modal, { type: "members" }>).clientName}`}
                </h2>
                <button onClick={resetModal} className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Feedback banners */}
                {saveError && (
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}>
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />{saveError}
                  </div>
                )}
                {saveSuccess && (
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: "rgba(52,168,83,0.1)", color: "#34a853" }}>
                    <Check className="h-3.5 w-3.5 shrink-0" />{saveSuccess}
                  </div>
                )}

                {/* CREATE CLIENT */}
                {modal.type === "create_client" && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="label">Nome do cliente</label>
                      <input
                        className="input"
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        placeholder="Ex: ACME Corporation"
                      />
                      {newClientName && (
                        <p className="text-xs" style={{ color: "var(--text-3)" }}>Slug: /{slugify(newClientName)}</p>
                      )}
                    </div>
                    <button onClick={handleCreateClient} disabled={saving || !newClientName.trim()} className="btn btn-primary w-full">
                      {saving ? "A criar…" : "Criar cliente"}
                    </button>
                  </div>
                )}

                {/* CREATE USER */}
                {modal.type === "create_user" && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="label">Email do cliente</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--text-3)" }} />
                        <input className="input pl-9" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="cliente@email.com" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="label">Password inicial</label>
                      <input className="input" type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
                      <p className="text-xs" style={{ color: "var(--text-3)" }}>O cliente pode alterar depois no portal.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="label">Papel (role)</label>
                      <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value as "client_viewer" | "client_approver")}>
                        <option value="client_viewer">Visualizador</option>
                        <option value="client_approver">Aprovador</option>
                      </select>
                    </div>
                    <button onClick={handleCreateUser} disabled={saving || !newEmail || !newPassword} className="btn btn-primary w-full">
                      {saving ? "A criar…" : "Criar utilizador e convidar"}
                    </button>
                  </div>
                )}

                {/* ASSIGN PROJECT */}
                {modal.type === "assign_project" && (
                  <div className="space-y-4">
                    {unassignedProjects.length === 0 ? (
                      <p className="text-sm text-center py-4" style={{ color: "var(--text-3)" }}>
                        Não há projetos sem cliente para associar.
                      </p>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <label className="label">Projeto</label>
                          <select className="input" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
                            <option value="">Seleciona um projeto…</option>
                            {unassignedProjects.map((p) => (
                              <option key={p.id} value={p.id}>{p.project_name}</option>
                            ))}
                          </select>
                        </div>
                        <button onClick={handleAssignProject} disabled={saving || !selectedProjectId} className="btn btn-primary w-full">
                          {saving ? "A associar…" : "Associar projeto"}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* MEMBERS */}
                {modal.type === "members" && (
                  <div className="space-y-4">
                    {members.length === 0 ? (
                      <p className="text-sm text-center py-3" style={{ color: "var(--text-3)" }}>
                        Sem utilizadores cliente ainda.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {members.map((m) => (
                          <div key={m.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: "var(--surface-2)" }}>
                            <User className="h-4 w-4 shrink-0" style={{ color: "var(--text-3)" }} />
                            <span className="flex-1 text-xs font-mono truncate" style={{ color: "var(--text)" }}>{m.user_id}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
                              {m.role}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {allProjects.length > 0 && members.length > 0 && (
                      <div className="space-y-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                        <label className="label">Dar acesso a um projeto</label>
                        <select className="input" value={selectedMemberProjectId} onChange={(e) => setSelectedMemberProjectId(e.target.value)}>
                          <option value="">Seleciona um projeto…</option>
                          {allProjects.map((p) => (
                            <option key={p.id} value={p.id}>{p.project_name}</option>
                          ))}
                        </select>
                        <button onClick={handleAddMemberToProject} disabled={!selectedMemberProjectId} className="btn btn-secondary w-full">
                          Adicionar membros ao projeto
                        </button>
                        {saveSuccess && (
                          <p className="text-xs text-center" style={{ color: "#34a853" }}>{saveSuccess}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
