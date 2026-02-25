"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { slugify } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import { CopyToast, MotionList, MotionListItem, MotionPage, SavedCheckmark } from "@/components/motion-system";
import { transitions, variants } from "@/lib/motion";
import {
  Plus, Users, X, Building2, User,
  Shield, FolderOpen, Check, Copy, Mail,
  Loader2, Lock, Eye, Trash2,
} from "lucide-react";

interface Client {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  deleted_at?: string | null;
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
  | { type: "invite_client"; clientId: string; clientName: string }
  | { type: "assign_project"; clientId: string; clientName: string }
  | { type: "members"; clientId: string; clientName: string }
  | { type: "delete_client"; clientId: string; clientName: string };

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orgRole, setOrgRole] = useState<string | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const toast = useToast();

  const [newClientName, setNewClientName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"client_viewer" | "client_approver">("client_viewer");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"client_viewer" | "client_approver">("client_viewer");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [unassignedProjects, setUnassignedProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [members, setMembers] = useState<ClientUser[]>([]);
  const [selectedMemberProjectId, setSelectedMemberProjectId] = useState("");
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [deleteWithPortalRevoke, setDeleteWithPortalRevoke] = useState(true);

  const load = useCallback(async () => {
    setLoadError(null);
    const sb = createClient();

    const roleRes = await fetch("/api/admin/org-role");
    if (roleRes.ok) {
      const roleData = await roleRes.json() as { role: string | null; isAdmin: boolean };
      setOrgRole(roleData.role);
      setIsAdmin(roleData.isAdmin);
    } else {
      setLoadError("Não foi possível validar permissões da organização.");
    }
    setAccessChecked(true);

    const { data: clientsData, error: clientsErr } = await sb
      .from("clients")
      .select("id, name, slug, created_at, deleted_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (clientsErr) {
      toast.error(`Erro ao carregar clientes: ${clientsErr.message}`);
      setLoadError(clientsErr.message);
      setLoading(false);
      return;
    }

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

    const { data: projData } = await sb
      .from("projects")
      .select("id, project_name, client_id, status")
      .is("deleted_at", null)
      .order("project_name");
    setAllProjects(projData ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const createClient_ = async () => {
    if (!newClientName.trim() || saving) return;
    setSaving(true);
    const sb = createClient();
    const slug = slugify(newClientName);
    const { error } = await sb.from("clients").insert({ name: newClientName.trim(), slug });
    setSaving(false);
    if (error) {
      toast.error(`Erro ao criar cliente: ${error.message}`);
      return;
    }
    toast.success(`Cliente "${newClientName.trim()}" criado`);
    setNewClientName("");
    setModal(null);
    load();
  };

  const createClientUser = async () => {
    if (modal?.type !== "create_user" || !newEmail.trim() || !newPassword || saving) return;
    setSaving(true);
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
    if (!res.ok) {
      toast.error(data.error ?? "Erro ao criar utilizador");
      return;
    }
    const pwd = data.password ?? newPassword;
    setSaveSuccess(`Utilizador criado! Password: ${pwd}`);
    toast.success("Utilizador criado com sucesso");
    setNewEmail("");
    setNewPassword("");
    load();
  };

  const createClientInvite = async () => {
    if (modal?.type !== "invite_client" || !inviteEmail.trim() || saving) return;
    setSaving(true);
    const res = await fetch("/api/clients/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: modal.clientId,
        email: inviteEmail.trim(),
        role: inviteRole,
        expiresInDays: 7,
      }),
    });
    const data = await res.json() as { error?: string; inviteUrl?: string; expiresAt?: string };
    setSaving(false);
    if (!res.ok || !data.inviteUrl) {
      toast.error(data.error ?? "Erro ao gerar convite");
      return;
    }
    setInviteLink(data.inviteUrl);
    setInviteExpiresAt(data.expiresAt ?? null);
    toast.success("Link de convite criado");
    load();
  };

  const assignProject = async () => {
    if (modal?.type !== "assign_project" || !selectedProjectId || saving) return;
    setSaving(true);
    const sb = createClient();
    const { error } = await sb.from("projects").update({ client_id: modal.clientId }).eq("id", selectedProjectId);
    setSaving(false);
    if (error) {
      toast.error(`Erro ao associar projeto: ${error.message}`);
      return;
    }
    toast.success("Projeto associado ao cliente");
    setSelectedProjectId("");
    setModal(null);
    load();
  };

  const loadMembers = async (clientId: string) => {
    const sb = createClient();
    const { data, error } = await sb
      .from("client_users")
      .select("id, user_id, role")
      .eq("client_id", clientId);
    if (error) toast.error(`Erro ao carregar membros: ${error.message}`);
    setMembers(data ?? []);
  };

  const grantProjectAccess = async (userId: string) => {
    if (!selectedMemberProjectId || saving) return;
    setSaving(true);
    const sb = createClient();
    const { error } = await sb.from("project_members").upsert(
      { project_id: selectedMemberProjectId, user_id: userId, role: "client_viewer" },
      { onConflict: "project_id,user_id" }
    );
    setSaving(false);
    if (error) {
      toast.error(`Erro ao conceder acesso: ${error.message}`);
      return;
    }
    toast.success("Acesso concedido ao projeto");
  };

  const openClientPortalView = async (clientId: string) => {
    const res = await fetch(`/api/clients/${clientId}/impersonate`, { method: "POST" });
    const data = await res.json().catch(() => ({} as { error?: string; portalUrl?: string }));
    if (!res.ok || !data.portalUrl) {
      toast.error(data.error ?? "Não foi possível abrir o portal do cliente.");
      return;
    }
    window.open(data.portalUrl, "_blank", "noopener,noreferrer");
  };

  const deleteClient = async () => {
    if (modal?.type !== "delete_client" || saving) return;
    setSaving(true);
    const res = await fetch(`/api/clients/${modal.clientId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revokePortal: deleteWithPortalRevoke }),
    });
    const payload = await res.json().catch(() => ({} as { error?: string }));
    setSaving(false);
    if (!res.ok) {
      toast.error(payload.error ?? "Não foi possível apagar cliente");
      return;
    }
    toast.success("Cliente removido com sucesso");
    setModal(null);
    load();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setShowCopyToast(true);
        window.setTimeout(() => setShowCopyToast(false), 1500);
        toast.success("Copiado");
      })
      .catch(() => toast.error("Não foi possível copiar"));
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--text-3)" }} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
        <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>Erro ao carregar clientes</p>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>{loadError}</p>
        <button className="btn btn-secondary btn-sm" onClick={load}>Tentar novamente</button>
      </div>
    );
  }

  if (accessChecked && !isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <Lock className="w-7 h-7" style={{ color: "var(--text-3)" }} />
        </div>
        <h2 className="text-xl font-bold" style={{ color: "var(--text)" }}>Acesso Restrito</h2>
        <p className="text-sm max-w-sm" style={{ color: "var(--text-2)" }}>
          Precisas de ser <strong style={{ color: "var(--text)" }}>owner</strong> ou{" "}
          <strong style={{ color: "var(--text)" }}>admin</strong> da organização Beyond Focus para gerir clientes.
        </p>
        <p className="text-xs" style={{ color: "var(--text-3)" }}>
          O teu role atual:{" "}
          <code
            className="px-2 py-0.5 rounded text-xs"
            style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
          >
            {orgRole ?? "sem role"}
          </code>
        </p>
        <p className="text-xs" style={{ color: "var(--text-3)" }}>
          Pede ao owner para correr{" "}
          <code
            className="px-1 rounded text-xs"
            style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
          >
            /api/admin/bootstrap
          </code>{" "}
          ou para te adicionar em team_members.
        </p>
      </div>
    );
  }

  return (
    <MotionPage className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">
            {clients.length === 0 ? "Nenhum cliente ainda" : `${clients.length} cliente${clients.length !== 1 ? "s" : ""}`}
            {orgRole && <span style={{ color: "var(--text-3)" }}> · {orgRole}</span>}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setModal({ type: "create_client" }); setSaveSuccess(null); }}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" />
            Novo Cliente
          </button>
        )}
      </div>

      {/* Empty state */}
      {clients.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <Building2 className="empty-icon" />
            <p className="empty-title">Nenhum cliente ainda</p>
            <p className="empty-desc">Cria o primeiro cliente para começar a partilhar projetos.</p>
            {isAdmin && (
              <button
                onClick={() => { setModal({ type: "create_client" }); setSaveSuccess(null); }}
                className="btn btn-primary btn-sm"
              >
                <Plus className="w-4 h-4" />
                Criar 1º Cliente
              </button>
            )}
          </div>
        </div>
      )}

      {/* Client cards */}
      <MotionList className="grid gap-4 sm:grid-cols-2">
        {clients.map((client) => (
          <MotionListItem key={client.id} className="card card-hover">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "var(--accent-dim)", border: "1px solid var(--border)" }}
                >
                  <Building2 className="w-5 h-5" style={{ color: "var(--accent-2)" }} />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{client.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>/{client.slug}</p>
                </div>
              </div>
              <button
                onClick={() => copyToClipboard(client.slug)}
                className="btn btn-ghost btn-icon-sm"
                title="Copiar slug"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-4 text-xs mb-4" style={{ color: "var(--text-3)" }}>
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
                    setSaveSuccess(null);
                  }}
                  className="btn btn-secondary btn-sm text-xs"
                >
                  <User className="w-3.5 h-3.5" /> Convidar utilizador
                </button>
                <button
                  onClick={() => {
                    setModal({ type: "invite_client", clientId: client.id, clientName: client.name });
                    setInviteEmail("");
                    setInviteRole("client_viewer");
                    setInviteLink(null);
                    setInviteExpiresAt(null);
                    setSaveSuccess(null);
                  }}
                  className="btn btn-secondary btn-sm text-xs"
                >
                  <Mail className="w-3.5 h-3.5" /> Convidar cliente
                </button>
                <button
                  onClick={() => {
                    const unassigned = allProjects.filter((p) => !p.client_id);
                    setUnassignedProjects(unassigned);
                    setModal({ type: "assign_project", clientId: client.id, clientName: client.name });
                    setSaveSuccess(null);
                  }}
                  className="btn btn-secondary btn-sm text-xs"
                >
                  <FolderOpen className="w-3.5 h-3.5" /> Associar projeto
                </button>
                <button
                  onClick={async () => {
                    await loadMembers(client.id);
                    setModal({ type: "members", clientId: client.id, clientName: client.name });
                    setSaveSuccess(null);
                  }}
                  className="btn btn-secondary btn-sm text-xs"
                >
                  <Shield className="w-3.5 h-3.5" /> Membros
                </button>
                <button
                  onClick={() => {
                    void openClientPortalView(client.id);
                  }}
                  className="btn btn-secondary btn-sm text-xs"
                >
                  <Eye className="w-3.5 h-3.5" /> Ver como cliente
                </button>
                <button
                  onClick={() => {
                    setDeleteWithPortalRevoke(true);
                    setModal({ type: "delete_client", clientId: client.id, clientName: client.name });
                  }}
                  className="btn btn-secondary btn-sm text-xs"
                  style={{ color: "var(--error)" }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Apagar cliente
                </button>
              </div>
            )}
          </MotionListItem>
        ))}
      </MotionList>

      {/* Modals */}
      <AnimatePresence>
        {modal && (
          <motion.div
            initial="initial"
            animate="animate"
            exit="exit"
            variants={variants.fadeIn}
            transition={transitions.fadeSlide}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
          >
            <motion.div
              initial="initial"
              animate="animate"
              exit="exit"
              variants={variants.modalEnter}
              className="modal-content w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold" style={{ color: "var(--text)" }}>
                  {modal.type === "create_client" && "Novo Cliente"}
                  {modal.type === "create_user" && `Convidar para ${modal.clientName}`}
                  {modal.type === "invite_client" && `Convidar cliente para ${modal.clientName}`}
                  {modal.type === "assign_project" && `Associar Projeto a ${modal.clientName}`}
                  {modal.type === "members" && `Membros de ${modal.clientName}`}
                  {modal.type === "delete_client" && `Apagar ${modal.clientName}`}
                </h2>
                <button onClick={() => setModal(null)} className="btn btn-ghost btn-icon-sm">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {modal.type === "create_client" && (
                <div className="space-y-4">
                  <input
                    autoFocus
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createClient_()}
                    placeholder="Nome do cliente"
                    className="input w-full"
                  />
                  {newClientName && (
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>
                      Slug:{" "}
                      <code style={{ color: "var(--text-2)" }}>/{slugify(newClientName)}</code>
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setModal(null)} className="btn btn-secondary flex-1">
                      Cancelar
                    </button>
                    <button
                      onClick={createClient_}
                      disabled={saving || !newClientName.trim()}
                      className="btn btn-primary flex-1"
                    >
                      {saving ? "A criar…" : "Criar cliente"}
                    </button>
                  </div>
                </div>
              )}

              {modal.type === "create_user" && (
                <div className="space-y-3">
                  {saveSuccess ? (
                    <div
                      className="rounded-xl p-4"
                      style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}
                    >
                      <div className="flex items-center gap-2 mb-1" style={{ color: "var(--success)" }}>
                        <Check className="w-4 h-4" /> Utilizador criado!
                      </div>
                      <SavedCheckmark show={true} label="Guardado" />
                      <p className="text-xs font-mono break-all" style={{ color: "var(--text-2)" }}>{saveSuccess}</p>
                      <button
                        onClick={() => copyToClipboard(saveSuccess)}
                        className="btn btn-ghost btn-sm text-xs mt-2"
                        style={{ color: "var(--text-3)" }}
                      >
                        <Copy className="w-3 h-3" /> Copiar
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="label">Email</label>
                        <input
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          placeholder="email@cliente.com"
                          className="input w-full"
                        />
                      </div>
                      <div>
                        <label className="label">Password temporária</label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          className="input w-full"
                        />
                      </div>
                      <div>
                        <label className="label">Função</label>
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value as "client_viewer" | "client_approver")}
                          className="input w-full"
                        >
                          <option value="client_viewer">Visualizador</option>
                          <option value="client_approver">Aprovador</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setModal(null)} className="btn btn-secondary flex-1">
                          Cancelar
                        </button>
                        <button
                          onClick={createClientUser}
                          disabled={saving || !newEmail.trim() || !newPassword}
                          className="btn btn-primary flex-1"
                        >
                          {saving ? "A criar…" : "Criar utilizador"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {modal.type === "invite_client" && (
                <div className="space-y-3">
                  {inviteLink ? (
                    <div
                      className="rounded-xl p-4"
                      style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}
                    >
                      <div className="flex items-center gap-2 mb-1" style={{ color: "var(--success)" }}>
                        <Check className="w-4 h-4" /> Convite criado!
                      </div>
                      <SavedCheckmark show={true} label="Guardado" />
                      <p className="text-xs break-all" style={{ color: "var(--text-2)" }}>{inviteLink}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                        Expira: {inviteExpiresAt ? new Date(inviteExpiresAt).toLocaleDateString("pt-PT") : "7 dias"}
                      </p>
                      <button
                        onClick={() => copyToClipboard(inviteLink)}
                        className="btn btn-ghost btn-sm text-xs mt-2"
                        style={{ color: "var(--text-3)" }}
                      >
                        <Copy className="w-3 h-3" /> Copiar link
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="label">Email do cliente</label>
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="email@cliente.com"
                          className="input w-full"
                        />
                      </div>
                      <div>
                        <label className="label">Função</label>
                        <select
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value as "client_viewer" | "client_approver")}
                          className="input w-full"
                        >
                          <option value="client_viewer">Visualizador</option>
                          <option value="client_approver">Aprovador</option>
                        </select>
                      </div>
                      <p className="text-xs" style={{ color: "var(--text-3)" }}>
                        O convite expira em 7 dias e é single-use.
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => setModal(null)} className="btn btn-secondary flex-1">
                          Cancelar
                        </button>
                        <button
                          onClick={createClientInvite}
                          disabled={saving || !inviteEmail.trim()}
                          className="btn btn-primary flex-1"
                        >
                          {saving ? "A criar…" : "Gerar link"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {modal.type === "assign_project" && (
                <div className="space-y-3">
                  {unassignedProjects.length === 0 ? (
                    <div className="empty-state py-8">
                      <FolderOpen className="empty-icon" />
                      <p className="empty-desc">Sem projetos por associar.</p>
                      <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                        Todos os projetos já têm cliente associado, ou não há projetos.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="label">Projeto</label>
                        <select
                          value={selectedProjectId}
                          onChange={(e) => setSelectedProjectId(e.target.value)}
                          className="input w-full"
                        >
                          <option value="">Selecionar projeto…</option>
                          {unassignedProjects.map((p) => (
                            <option key={p.id} value={p.id}>{p.project_name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setModal(null)} className="btn btn-secondary flex-1">
                          Cancelar
                        </button>
                        <button
                          onClick={assignProject}
                          disabled={saving || !selectedProjectId}
                          className="btn btn-primary flex-1"
                        >
                          {saving ? "A associar…" : "Associar"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {modal.type === "members" && (
                <div className="space-y-3">
                  {members.length === 0 ? (
                    <div className="empty-state py-8">
                      <Users className="empty-icon" />
                      <p className="empty-desc">Sem membros ainda.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <label className="label">Conceder acesso a projeto</label>
                        <select
                          value={selectedMemberProjectId}
                          onChange={(e) => setSelectedMemberProjectId(e.target.value)}
                          className="input w-full"
                        >
                          <option value="">Selecionar projeto…</option>
                          {allProjects.map((p) => (
                            <option key={p.id} value={p.id}>{p.project_name}</option>
                          ))}
                        </select>
                      </div>
                      {members.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between rounded-xl px-4 py-3"
                          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                        >
                          <div className="flex items-center gap-3">
                            <User className="w-4 h-4" style={{ color: "var(--text-3)" }} />
                            <div>
                              <p className="text-sm" style={{ color: "var(--text)" }}>
                                {m.email ?? m.user_id.slice(0, 12) + "…"}
                              </p>
                              <p className="text-xs" style={{ color: "var(--text-3)" }}>{m.role}</p>
                            </div>
                          </div>
                          {selectedMemberProjectId && (
                            <button
                              onClick={() => grantProjectAccess(m.user_id)}
                              disabled={saving}
                              className="btn btn-primary btn-sm text-xs"
                            >
                              {saving ? "…" : "Dar acesso"}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setModal(null)} className="btn btn-secondary w-full">
                    Fechar
                  </button>
                </div>
              )}

              {modal.type === "delete_client" && (
                <div className="space-y-4">
                  <p className="text-sm" style={{ color: "var(--text-2)" }}>
                    Esta ação remove o cliente da lista ativa. Os projetos mantêm-se, mas deixam de estar ligados ao cliente.
                  </p>
                  <label className="flex items-start gap-2 text-xs" style={{ color: "var(--text-2)" }}>
                    <input
                      type="checkbox"
                      checked={deleteWithPortalRevoke}
                      onChange={(event) => setDeleteWithPortalRevoke(event.target.checked)}
                      className="mt-0.5"
                    />
                    Apagar portal também (revogar utilizadores cliente + convites pendentes)
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => setModal(null)} className="btn btn-secondary flex-1">
                      Cancelar
                    </button>
                    <button
                      onClick={deleteClient}
                      disabled={saving}
                      className="btn flex-1"
                      style={{ background: "var(--error)", color: "white", borderRadius: "999px" }}
                    >
                      {saving ? "A apagar…" : "Confirmar apagar"}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <CopyToast show={showCopyToast} />
    </MotionPage>
  );
}
