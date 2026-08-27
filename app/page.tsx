"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type Message = { id: string; role: "assistant" | "user"; content: string; sql?: string; rows?: Record<string, unknown>[]; source?: "verified" | "gemini" | "offline"; verifiedMetric?: string; contextMessages?: number; sqlCorrected?: boolean; durationMs?: number; createdAt: string };
type Conversation = { id: string; title: string; messages: Message[]; createdAt: string; updatedAt: string };
type FavoriteQuestion = { id: string; question: string; createdAt: string };
type AccessRole = "viewer" | "analyst" | "admin";
type AuthUser = { id: string; name: string; email: string; title: string; role: AccessRole; active: boolean; createdAt: string; lastLoginAt?: string };
type SessionData = { user: AuthUser; roleLabel: string; permissions: string[]; expiresAt?: string; authentication: "server-session"; firstOrganizationAdmin?: boolean };
type Health = { status: "ok" | "degraded"; mcp: string; databaseStatus: string; identityStatus?: string; aiMode: "gemini" | "offline"; responseTimeMs: number; database?: string; user?: string };
type Schema = Record<string, Array<{ name: string; type: string }>>;
type InsightMetric = { label: string; value: string | number; format: "number" | "currency" | "days" | "text" };
type BusinessInsight = { id: string; type: string; severity: "high" | "medium" | "low"; title: string; entity: string; description: string; action: string; question: string; metrics: InsightMetric[] };
type InsightsData = { summary: { totalProducts: number; criticalStock: number; riskOrders: number; inactiveCustomers: number; completedRevenue: number | string }; insights: BusinessInsight[]; source: "mcp"; generatedAt: string; durationMs: number };
type VerifiedMetricDefinition = { id: string; name: string; category: "Finans" | "Satış" | "Müşteri" | "Operasyon" | "Stok"; description: string; formula: string; synonyms: string[]; sampleQuestions: string[] };
type MetricsData = { metrics: VerifiedMetricDefinition[]; count: number; source: "verified-catalog"; updatedAt: string };
type AuditStatus = "success" | "blocked" | "error";
type AuditEntry = { id: string; timestamp: string; user: { id: string; name: string; role: AccessRole }; action: "chat_query" | "view_metrics" | "view_schema" | "view_insights" | "view_audit" | "manage_user"; status: AuditStatus; durationMs: number; question?: string; source?: "verified" | "gemini" | "offline"; verifiedMetric?: string; rowCount?: number; sql?: string; message?: string };
type AuditData = { entries: AuditEntry[]; summary: { total: number; successful: number; blocked: number; errors: number; byRole: Record<AccessRole, number> }; storage: string; generatedAt: string };
type ManagedUser = AuthUser;
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const accessRoleLabels: Record<AccessRole, string> = { viewer: "Görüntüleyici", analyst: "Analist", admin: "Yönetici" };
const actionLabels: Record<AuditEntry["action"], string> = { chat_query: "Sorgu çalıştırdı", view_metrics: "Veri sözlüğünü açtı", view_schema: "Şemayı görüntüledi", view_insights: "Risk analizini açtı", view_audit: "Denetim kaydını açtı", manage_user: "Kullanıcı erişimini değiştirdi" };
const starter: Message = { id: "welcome", role: "assistant", content: "Merhaba! Satış, ürün, müşteri, sipariş ve stok verileri hakkında soru sorabilirsin.", createdAt: new Date(0).toISOString() };
const suggestions = ["En çok satış yapılan 5 ürünü göster", "Stoku 20'nin altında olan ürünler hangileri?", "Bu ayın toplam cirosu ne kadar?", "Kategorilere göre ürün sayılarını göster"];
const tableNames: Record<string, string> = { products: "Ürünler", customers: "Müşteriler", orders: "Siparişler", order_items: "Sipariş kalemleri" };
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const currencyKeys = /(fiyat|price|tutar|total|ciro|gelir|revenue|amount|ortalama.*tutar|en_yuksek.*tutar)/i;
const dateKeys = /(tarih|date|created_at|updated_at)/i;
const labels: Record<string, string> = {
  urun: "Ürün", kategori: "Kategori", stok: "Stok", fiyat: "Fiyat",
  musteri: "Müşteri", sehir: "Şehir", durum: "Durum", tarih: "Tarih",
  satilan_adet: "Satılan Adet", urun_sayisi: "Ürün Sayısı", musteri_sayisi: "Müşteri Sayısı",
  aktif_musteri_sayisi: "Aktif Müşteri Sayısı",
  siparis_sayisi: "Sipariş Sayısı", ortalama_fiyat: "Ortalama Fiyat", toplam_ciro: "Toplam Ciro",
  aylik_ciro: "Aylık Ciro", ortalama_tutar: "Ortalama Tutar", en_yuksek_tutar: "En Yüksek Tutar",
};

function createConversation(): Conversation {
  const now = new Date().toISOString();
  return { id: uid(), title: "Yeni sohbet", messages: [{ ...starter, id: `welcome-${uid()}` }], createdAt: now, updatedAt: now };
}

function conversationTitle(messages: Message[]) {
  const firstQuestion = messages.find((message) => message.role === "user")?.content.trim();
  if (!firstQuestion) return "Yeni sohbet";
  return firstQuestion.length > 38 ? `${firstQuestion.slice(0, 38)}…` : firstQuestion;
}

function conversationDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}` : parts[0]?.slice(0, 2) ?? "K").toLocaleUpperCase("tr-TR");
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

function formatLabel(key: string) {
  if (labels[key]) return labels[key];
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("tr-TR"));
}

function formatValue(value: unknown, key: string) {
  if (value === null || value === undefined) return "—";
  const numeric = numberValue(value);
  if (numeric !== null) {
    if (currencyKeys.test(key)) return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric);
    return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(numeric);
  }
  if (dateKeys.test(key) && typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }
  return String(value);
}

function formatInsightMetric(metric: InsightMetric) {
  if (metric.format === "currency") return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(Number(metric.value));
  if (metric.format === "days") return `${new Intl.NumberFormat("tr-TR").format(Number(metric.value))} gün`;
  if (metric.format === "number") return new Intl.NumberFormat("tr-TR").format(Number(metric.value));
  return String(metric.value);
}

function downloadCsv(rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0]);
  const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const excelValue = (value: unknown) => numberValue(value) === null ? value : String(value).replace(".", ",");
  const csv = "\uFEFF" + [
    keys.map((key) => csvCell(formatLabel(key))).join(";"),
    ...rows.map((row) => keys.map((key) => csvCell(excelValue(row[key]))).join(";")),
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `veriasistan-sonuc-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ResultView({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return null;
  const keys = Object.keys(rows[0]);
  const metrics = Object.entries(rows[0]).filter(([, value]) => numberValue(value) !== null);
  const actions = <div className="resultActions"><span>{rows.length} sonuç satırı</span><button type="button" onClick={() => downloadCsv(rows)}>↓ CSV indir</button></div>;

  if (rows.length === 1 && metrics.length === keys.length) {
    return <>{actions}<div className="kpiGrid">{metrics.map(([key, value]) => <div className="kpiCard" key={key}><span>{formatLabel(key)}</span><strong>{formatValue(value, key)}</strong><small>PostgreSQL sonucu</small></div>)}</div></>;
  }

  const labelKey = keys.find((key) => numberValue(rows[0][key]) === null) ?? keys[0];
  const numericKey = keys.find((key) => key !== labelKey && !/(^id$|_id$|_no$)/i.test(key) && rows.every((row) => numberValue(row[key]) !== null));
  const chartRows = numericKey && rows.length <= 12 ? rows.slice(0, 10) : [];
  const maxValue = chartRows.length > 0 ? Math.max(...chartRows.map((row) => Math.abs(numberValue(row[numericKey!]) ?? 0)), 1) : 1;

  return <>{actions}
    {numericKey && chartRows.length > 1 && <section className="resultChart">
      <div className="chartHeader"><div><span>OTOMATİK GÖRSELLEŞTİRME</span><b>{formatLabel(numericKey)}</b></div><small>İlk {chartRows.length} kayıt</small></div>
      <div className="bars">{chartRows.map((row, index) => {
        const value = numberValue(row[numericKey]) ?? 0;
        return <div className="barRow" key={`${String(row[labelKey])}-${index}`}><span title={String(row[labelKey])}>{formatValue(row[labelKey], labelKey)}</span><div><i style={{ width: `${Math.abs(value) / maxValue * 100}%` }} /></div><strong>{formatValue(row[numericKey], numericKey)}</strong></div>;
      })}</div>
    </section>}
    <div className="tableWrap"><table><thead><tr>{keys.map((key) => <th key={key}>{formatLabel(key)}</th>)}</tr></thead><tbody>{rows.map((row, ri) => <tr key={ri}>{keys.map((key) => <td key={key}>{formatValue(row[key], key)}</td>)}</tr>)}</tbody></table></div>
  </>;
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [view, setView] = useState<"chat" | "schema" | "insights" | "glossary" | "audit" | "users">("chat");
  const [health, setHealth] = useState<Health | null>(null);
  const [schema, setSchema] = useState<Schema>({});
  const [copiedSql, setCopiedSql] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [profileDraft, setProfileDraft] = useState({ name: "", title: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteQuestion[]>([]);
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState("");
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditFilter, setAuditFilter] = useState<"all" | AuditStatus>("all");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const activeConversation = useMemo(() => conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0], [conversations, activeConversationId]);
  const messages = activeConversation?.messages ?? [];
  const displayMessages = messages.length > 0 ? messages : [starter];
  const profile: AuthUser = session?.user ?? { id: "", name: "Kullanıcı", email: "", title: "", role: "viewer", active: false, createdAt: "" };
  const accessRole = profile.role;

  useEffect(() => {
    if (!authChecked || view !== "chat") return;

    const frame = window.requestAnimationFrame(() => {
      const chat = chatRef.current;
      if (chat) chat.scrollTop = chat.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeConversationId, messages.length, authChecked, view]);

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      try {
        const response = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        if (!response.ok) throw new Error("no-session");
        const current = await response.json() as SessionData;
        if (cancelled) return;
        setSession(current);
        setProfileDraft({ name: current.user.name, title: current.user.title });
        await loadWorkspace(current);
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    }
    void restoreSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    async function refreshHealth() {
      try {
        const response = await fetch(`${API_BASE}/health`);
        if (!response.ok) throw new Error();
        setHealth(await response.json() as Health);
      } catch { setHealth({ status: "degraded", mcp: "unavailable", databaseStatus: "unavailable", aiMode: "offline", responseTimeMs: 0 }); }
    }
    void refreshHealth(); const timer = window.setInterval(() => void refreshHealth(), 15000); return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session || accessRole === "viewer") { setSchema({}); return; }
    void apiFetch("/schema").then((response) => response.json()).then((data) => setSchema(data as Schema)).catch(() => setSchema({}));
  }, [session?.user.id, accessRole]);

  useEffect(() => {
    const restricted = accessRole === "viewer" && ["schema", "insights", "audit", "users"].includes(view);
    if (restricted || (["audit", "users"].includes(view) && accessRole !== "admin")) setView("chat");
  }, [accessRole, view]);

  const connected = health?.status === "ok" && health.databaseStatus === "connected" && health.identityStatus !== "migration-required";
  const filteredAuditEntries = auditData?.entries.filter((entry) => auditFilter === "all" || entry.status === auditFilter) ?? [];
  const pageCopy = {
    chat: { title: "Satış Veritabanı", subtitle: "Doğal dilde sor, verilerinden anında cevap al." },
    schema: { title: "Veri Şeması", subtitle: "MCP tarafından erişilebilen tablo ve sütunlar." },
    insights: { title: "Risk ve Aksiyon Merkezi", subtitle: "Verilerdeki riskleri tespit et, önerilen aksiyonu incele." },
    glossary: { title: "Kurumsal Veri Sözlüğü", subtitle: "Şirket tarafından doğrulanan metrik tanımları ve hesaplama kuralları." },
    audit: { title: "Denetim Kayıtları", subtitle: "Kullanıcı erişimlerini, sorguları ve engellenen işlemleri izle." },
    users: { title: "Kullanıcı Yönetimi", subtitle: "Hesapları, rolleri ve erişim durumlarını merkezi olarak yönet." },
  }[view];

  async function apiFetch(path: string, options: RequestInit = {}) {
    const response = await fetch(`${API_BASE}${path}`, { ...options, credentials: "include", headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers } });
    if (response.status === 401 && path !== "/auth/login" && path !== "/auth/register") {
      setSession(null); setConversations([]); setFavorites([]); setActiveConversationId(null); setProfileOpen(false);
    }
    return response;
  }

  async function loadWorkspace(current: SessionData) {
    const [conversationsResponse, favoritesResponse] = await Promise.all([
      fetch(`${API_BASE}/conversations`, { credentials: "include" }),
      fetch(`${API_BASE}/favorites`, { credentials: "include" }),
    ]);
    if (!conversationsResponse.ok || !favoritesResponse.ok) throw new Error("Çalışma alanı yüklenemedi.");
    const conversationData = await conversationsResponse.json() as { conversations: Conversation[] };
    const favoriteData = await favoritesResponse.json() as { favorites: FavoriteQuestion[] };
    let loaded = conversationData.conversations;
    if (loaded.length === 0) {
      const createdResponse = await fetch(`${API_BASE}/conversations`, { method: "POST", credentials: "include" });
      if (!createdResponse.ok) throw new Error("İlk sohbet oluşturulamadı.");
      loaded = [await createdResponse.json() as Conversation];
    }
    setConversations(loaded);
    setActiveConversationId(loaded[0]?.id ?? null);
    setFavorites(favoriteData.favorites);
    setProfileDraft({ name: current.user.name, title: current.user.title });
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    if (authLoading) return;
    setAuthLoading(true); setAuthError("");
    try {
      const path = authMode === "login" ? "/auth/login" : "/auth/register";
      const body = authMode === "login" ? { email: authForm.email, password: authForm.password } : authForm;
      const response = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Kimlik doğrulama başarısız.");
      const current = data as SessionData;
      setSession(current); setProfileDraft({ name: current.user.name, title: current.user.title });
      setAuthForm({ name: "", email: "", password: "" });
      await loadWorkspace(current);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Kimlik doğrulama başarısız.");
    } finally { setAuthLoading(false); }
  }

  async function logout() {
    try { await apiFetch("/auth/logout", { method: "POST" }); } finally {
      setSession(null); setConversations([]); setFavorites([]); setActiveConversationId(null); setProfileOpen(false); setView("chat");
    }
  }

  async function loadInsights() {
    if (insightsLoading || !session) return;
    setInsightsLoading(true); setInsightsError("");
    try {
      const response = await apiFetch("/insights");
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Analiz alınamadı");
      setInsightsData(data as InsightsData);
    } catch (error) {
      setInsightsError(error instanceof Error ? error.message : "Risk analizleri alınamadı.");
    } finally { setInsightsLoading(false); }
  }

  function openInsights() {
    setView("insights");
    if (!insightsData) void loadInsights();
  }

  async function loadMetrics() {
    if (metricsLoading || !session) return;
    setMetricsLoading(true); setMetricsError("");
    try {
      const response = await apiFetch("/metrics");
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Veri sözlüğü alınamadı");
      setMetricsData(data as MetricsData);
    } catch (error) {
      setMetricsError(error instanceof Error ? error.message : "Veri sözlüğü alınamadı.");
    } finally { setMetricsLoading(false); }
  }

  function openGlossary() {
    setView("glossary");
    if (!metricsData) void loadMetrics();
  }

  async function loadAudit() {
    if (auditLoading || accessRole !== "admin" || !session) return;
    setAuditLoading(true); setAuditError("");
    try {
      const response = await apiFetch("/audit");
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Denetim kaydı alınamadı");
      setAuditData(data as AuditData);
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "Denetim kaydı alınamadı.");
    } finally { setAuditLoading(false); }
  }

  function openAudit() {
    if (accessRole !== "admin" || !session) return;
    setView("audit");
    void loadAudit();
  }

  async function loadUsers() {
    if (usersLoading || accessRole !== "admin" || !session) return;
    setUsersLoading(true); setUsersError("");
    try {
      const response = await apiFetch("/users");
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Kullanıcılar alınamadı");
      setManagedUsers((data as { users: ManagedUser[] }).users);
    } catch (error) { setUsersError(error instanceof Error ? error.message : "Kullanıcılar alınamadı."); }
    finally { setUsersLoading(false); }
  }

  function openUsers() {
    if (accessRole !== "admin" || !session) return;
    setView("users");
    void loadUsers();
  }

  async function updateManagedUser(user: ManagedUser, role: AccessRole, active: boolean) {
    setUpdatingUserId(user.id); setUsersError("");
    try {
      const response = await apiFetch(`/users/${user.id}/access`, { method: "PATCH", body: JSON.stringify({ role, active }) });
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Erişim güncellenemedi");
      const updated = (data as { user: ManagedUser }).user;
      setManagedUsers((old) => old.map((item) => item.id === updated.id ? updated : item));
    } catch (error) { setUsersError(error instanceof Error ? error.message : "Erişim güncellenemedi."); }
    finally { setUpdatingUserId(null); }
  }

  async function saveProfile() {
    if (!session || profileSaving) return;
    setProfileSaving(true); setProfileError("");
    try {
      const response = await apiFetch("/auth/profile", { method: "PATCH", body: JSON.stringify(profileDraft) });
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Profil güncellenemedi");
      setSession(data as SessionData); setProfileOpen(false);
    } catch (error) { setProfileError(error instanceof Error ? error.message : "Profil güncellenemedi."); }
    finally { setProfileSaving(false); }
  }

  function setMessages(update: (old: Message[]) => Message[]) {
    if (!activeConversationId) return;
    setConversations((old) => old.map((conversation) => {
      if (conversation.id !== activeConversationId) return conversation;
      const nextMessages = update(conversation.messages);
      return { ...conversation, messages: nextMessages, title: conversationTitle(nextMessages), updatedAt: new Date().toISOString() };
    }));
  }

  async function ask(question: string) {
    const clean = question.trim(); if (!clean || loading || !session || !activeConversationId) return;
    const temporaryId = `pending-${uid()}`;
    setView("chat"); setMessages((old) => [...old, { id: temporaryId, role: "user", content: clean, createdAt: new Date().toISOString() }]); setInput(""); setLoading(true);
    try {
      const response = await apiFetch("/chat", { method: "POST", body: JSON.stringify({ question: clean, conversationId: activeConversationId }) });
      const data = await response.json(); if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Sunucu hatası");
      const userMessage = data.userMessage as Message | undefined;
      const assistantMessage = data.assistantMessage as Message | undefined;
      setMessages((old) => [...old.map((message) => message.id === temporaryId ? (userMessage ?? message) : message), assistantMessage ?? { id: uid(), role: "assistant", content: data.answer, sql: data.sql, rows: data.rows, source: data.source, verifiedMetric: data.verifiedMetric, contextMessages: data.contextMessages, sqlCorrected: data.sqlCorrected, durationMs: data.durationMs, createdAt: new Date().toISOString() }]);
    } catch (error) {
      setMessages((old) => [...old, { id: uid(), role: "assistant", content: error instanceof Error ? `İstek tamamlanamadı: ${error.message}` : "Backend'e ulaşılamadı. Docker ve backend servislerini kontrol et.", createdAt: new Date().toISOString() }]);
    } finally { setLoading(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void ask(input); }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(input); } }
  async function newChat() {
    if (!session) return;
    try {
      const response = await apiFetch("/conversations", { method: "POST" });
      const conversation = await response.json() as Conversation;
      if (!response.ok) throw new Error();
      setConversations((old) => [conversation, ...old]);
      setActiveConversationId(conversation.id);
      setView("chat");
    } catch { window.alert("Yeni sohbet oluşturulamadı."); }
  }
  function openConversation(id: string) { setActiveConversationId(id); setView("chat"); }
  async function deleteConversation(id: string) {
    const target = conversations.find((conversation) => conversation.id === id);
    if (!target || !window.confirm(`“${target.title}” sohbeti silinsin mi?`)) return;
    const response = await apiFetch(`/conversations/${id}`, { method: "DELETE" });
    if (!response.ok) { window.alert("Sohbet silinemedi."); return; }
    const remaining = conversations.filter((conversation) => conversation.id !== id);
    if (remaining.length === 0) {
      const createdResponse = await apiFetch("/conversations", { method: "POST" });
      if (!createdResponse.ok) { setConversations([]); setActiveConversationId(null); return; }
      const fresh = await createdResponse.json() as Conversation;
      setConversations([fresh]); setActiveConversationId(fresh.id);
    } else {
      setConversations(remaining);
      if (id === activeConversationId) setActiveConversationId(remaining[0].id);
    }
  }
  function isFavoriteQuestion(question: string) {
    const key = question.trim().toLocaleLowerCase("tr-TR");
    return favorites.some((favorite) => favorite.question.trim().toLocaleLowerCase("tr-TR") === key);
  }
  async function toggleFavorite(question: string) {
    const clean = question.trim();
    if (!clean) return;
    const key = clean.toLocaleLowerCase("tr-TR");
    const existing = favorites.find((favorite) => favorite.question.trim().toLocaleLowerCase("tr-TR") === key);
    const response = await apiFetch(existing ? `/favorites/${existing.id}` : "/favorites", { method: existing ? "DELETE" : "POST", body: existing ? undefined : JSON.stringify({ question: clean }) });
    const data = await response.json();
    if (response.ok) setFavorites((data as { favorites: FavoriteQuestion[] }).favorites);
  }
  async function copySql(sql: string, messageId: string) {
    try {
      await navigator.clipboard.writeText(sql);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = sql; document.body.appendChild(textarea); textarea.select(); document.execCommand("copy"); textarea.remove();
    }
    setCopiedSql(messageId);
    window.setTimeout(() => setCopiedSql((current) => current === messageId ? null : current), 1800);
  }

  if (!authChecked) return <main className="authShell"><div className="authLoading"><span>✦</span><b>Güvenli oturum kontrol ediliyor…</b></div></main>;

  if (!session) return <main className="authShell">
    <section className="authStory">
      <div className="brand authBrand"><span className="brandMark">V</span><div><strong>VeriAsistan</strong><small>Kurumsal veri karar platformu</small></div></div>
      <div className="authStoryCopy"><span className="eyebrow">MCP · POSTGRESQL · GEMINI</span><h1>Şirket verilerini güvenli kararlara dönüştür.</h1><p>Gerçek kullanıcı hesapları, merkezi rol yönetimi, kişiye özel sohbetler ve denetlenebilir veri erişimi tek çalışma alanında.</p></div>
      <div className="authSecurity"><article><span>01</span><div><b>Sunucu oturumu</b><small>Oturum anahtarı JavaScript tarafından okunamaz.</small></div></article><article><span>02</span><div><b>Merkezi yetkilendirme</b><small>Kullanıcı kendi rolünü değiştiremez.</small></div></article><article><span>03</span><div><b>Veri ayrımı</b><small>Her kullanıcının sohbetleri ve favorileri ayrıdır.</small></div></article></div>
    </section>
    <section className="authPanel"><form className="authCard" onSubmit={submitAuth}>
      <div className="authTabs"><button type="button" className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setAuthError(""); }}>Giriş yap</button><button type="button" className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setAuthError(""); }}>Hesap oluştur</button></div>
      <div className="authHeading"><span>{authMode === "login" ? "Tekrar hoş geldin" : "Kurumsal hesabını oluştur"}</span><h2>{authMode === "login" ? "Çalışma alanına giriş yap" : "Güvenli kullanıcı kaydı"}</h2><p>{authMode === "login" ? "E-posta ve şifrenle devam et." : "İlk kayıt kurucu yönetici, sonraki kayıtlar Görüntüleyici olur."}</p></div>
      {authMode === "register" && <label>Ad soyad<input value={authForm.name} onChange={(event) => setAuthForm((old) => ({ ...old, name: event.target.value }))} minLength={2} maxLength={80} required autoComplete="name" placeholder="Ad Soyad" /></label>}
      <label>Kurumsal e-posta<input type="email" value={authForm.email} onChange={(event) => setAuthForm((old) => ({ ...old, email: event.target.value }))} maxLength={180} required autoComplete="email" placeholder="ad@firma.com" /></label>
      <label>Şifre<input type="password" value={authForm.password} onChange={(event) => setAuthForm((old) => ({ ...old, password: event.target.value }))} minLength={authMode === "register" ? 8 : 1} maxLength={72} required autoComplete={authMode === "login" ? "current-password" : "new-password"} placeholder="••••••••" /><small>{authMode === "register" ? "En az 8 karakter; büyük harf, küçük harf ve rakam." : "5 hatalı denemede hesap 15 dakika kilitlenir."}</small></label>
      {authError && <div className="authError">{authError}</div>}
      {health?.identityStatus === "migration-required" && <div className="authError">Üyelik veritabanı geçişi henüz çalıştırılmamış.</div>}
      <button className="authSubmit" disabled={authLoading || health?.identityStatus === "migration-required"}>{authLoading ? "İşlem yapılıyor…" : authMode === "login" ? "Güvenli giriş yap →" : "Hesap oluştur →"}</button>
      <div className="authFoot">▣ Parolalar scrypt ile hash’lenerek PostgreSQL’de saklanır.</div>
    </form></section>
  </main>;

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandMark">V</span><div><strong>VeriAsistan</strong><small>MCP destekli analiz</small></div></div>
      <button className="newChat" onClick={newChat}><span>＋</span> Yeni sohbet</button>
      <nav className="nav"><button className={view === "chat" ? "active" : ""} onClick={() => setView("chat")}><span>◫</span> Sohbet</button>{accessRole !== "viewer" && <button className={view === "insights" ? "active" : ""} onClick={openInsights}><span>⚑</span> Risk ve aksiyon <b>{insightsData?.insights.length ?? "!"}</b></button>}<button className={view === "glossary" ? "active" : ""} onClick={openGlossary}><span>✓</span> Veri sözlüğü <b>{metricsData?.count ?? "—"}</b></button>{accessRole !== "viewer" && <button className={view === "schema" ? "active" : ""} onClick={() => setView("schema")}><span>⌘</span> Veri şeması <b>{Object.keys(schema).length || "—"}</b></button>}{accessRole === "admin" && <><button className={view === "users" ? "active" : ""} onClick={openUsers}><span>♙</span> Kullanıcılar <b>{managedUsers.length || "—"}</b></button><button className={view === "audit" ? "active" : ""} onClick={openAudit}><span>◉</span> Denetim kayıtları <b>{auditData?.summary.total ?? "—"}</b></button></>}</nav>
      <div className="sideLabel">VERİ KAYNAĞI</div>
      <button className="database" onClick={() => accessRole === "viewer" ? openGlossary() : setView("schema")}><span className="dbIcon">DB</span><div><b>Satış Veritabanı</b><small className={connected ? "online" : "offline"}><i /> {connected ? "PostgreSQL bağlı" : "Bağlantı yok"}</small></div></button>
      <div className="sideLabel favoriteHeading">FAVORİ SORULAR <span>{favorites.length}</span></div>
      {favorites.length > 0 ? <div className="favoriteList">{favorites.map((favorite) => <div className="favoriteItem" key={favorite.id}><button className="favoriteRun" type="button" disabled={loading} onClick={() => void ask(favorite.question)} title={favorite.question}><span>★</span>{favorite.question}</button><button className="favoriteRemove" type="button" onClick={() => toggleFavorite(favorite.question)} title="Favorilerden kaldır" aria-label={`${favorite.question} favorisini kaldır`}>×</button></div>)}</div> : <div className="favoritesEmpty">Mesajlardaki ☆ simgesiyle soru kaydet.</div>}
      <div className="sideLabel">SOHBETLER</div>
      <div className="conversationList">{conversations.map((conversation) => <div className={`conversationItem ${conversation.id === activeConversationId ? "active" : ""}`} key={conversation.id}><button className="conversationOpen" onClick={() => openConversation(conversation.id)} title={conversation.title}><b>{conversation.title}</b><small>{conversationDate(conversation.updatedAt)}</small></button><button className="deleteChat" onClick={() => deleteConversation(conversation.id)} title="Sohbeti sil" aria-label={`${conversation.title} sohbetini sil`}>×</button></div>)}</div>
      <div className="sidebarFooter">
        <div className="sideBottom"><span>API</span><a href="http://localhost:3001/docs" target="_blank" rel="noreferrer">Swagger dokümantasyonu ↗</a></div>
        <div className="profileArea">
          {profileOpen && <div className="profileMenu"><div className="profileMenuTitle"><span className="profileAvatar large">{initials(profile.name)}</span><div><b>Hesabım</b><small>{profile.email}</small></div></div><label>Görünen ad<input value={profileDraft.name} maxLength={80} onChange={(event) => setProfileDraft((old) => ({ ...old, name: event.target.value }))} placeholder="Adınız" /></label><label>Unvan<input value={profileDraft.title} maxLength={80} onChange={(event) => setProfileDraft((old) => ({ ...old, title: event.target.value }))} placeholder="Örn. Veri Analisti" /></label><div className="lockedRole"><span>Erişim rolü</span><b>{accessRoleLabels[accessRole]}</b><small>Rolü yalnızca bir yönetici değiştirebilir.</small></div>{profileError && <span className="sessionError">{profileError}</span>}<div className="sessionState ready"><i /> Güvenli sunucu oturumu aktif</div><div className="profileActions"><button type="button" onClick={() => void saveProfile()} disabled={profileSaving}>{profileSaving ? "Kaydediliyor" : "Profili kaydet"}</button><button className="logoutButton" type="button" onClick={() => void logout()}>Çıkış yap</button></div></div>}
          <button className="profileButton" type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}><span className="profileAvatar">{initials(profile.name)}</span><div><b>{profile.name}</b><small>{profile.title || "Veri kullanıcısı"} · {accessRoleLabels[accessRole]}</small></div><span className="profileDots">•••</span></button>
        </div>
      </div>
    </aside>

    <section className="workspace">
      <header><div><h1>{pageCopy.title}</h1><p>{pageCopy.subtitle}</p></div><div className="badges"><span className={`statusBadge ${connected ? "ok" : "bad"}`}><i /> {connected ? `Bağlı · ${health?.responseTimeMs} ms` : health?.identityStatus === "migration-required" ? "Üyelik geçişi gerekli" : "Bağlantı yok"}</span><span className="accessBadge">♙ {accessRoleLabels[accessRole]}</span><span className="modeBadge">{view === "insights" || view === "glossary" || view === "audit" || view === "users" ? "MCP · Gemini kullanılmıyor" : health?.aiMode === "gemini" ? "✦ Gemini modu" : "⌁ Çevrimdışı mod"}</span><span className="safe">▣ İş verileri salt okunur</span></div></header>

      {view === "chat" ? <>
        <div className="chat" ref={chatRef}>
          {messages.length === 0 && <div className="welcome"><div className="spark">✦</div><h2>Verilerinde ne arıyorsun?</h2><p>Sorunu günlük dilde yaz. VeriAsistan şemayı inceler, güvenli SQL üretir ve MCP üzerinden çalıştırır.</p><div className="suggestions">{suggestions.map((item) => <button key={item} onClick={() => void ask(item)}>{item}<span>→</span></button>)}</div></div>}
          <div className="messages">{displayMessages.map((message) => <article className={`message ${message.role}`} key={message.id}><div className="avatar">{message.role === "assistant" ? "✦" : initials(profile.name)}</div><div className="bubble"><p>{message.content}</p>{message.role === "user" && <button className={`favoriteToggle ${isFavoriteQuestion(message.content) ? "active" : ""}`} type="button" onClick={() => void toggleFavorite(message.content)}>{isFavoriteQuestion(message.content) ? "★ Favorilerde" : "☆ Favoriye ekle"}</button>}{message.source && <div className="meta"><span className={message.source === "verified" ? "verifiedSource" : ""}>{message.source === "verified" ? "✓ Doğrulanmış metrik" : message.source === "gemini" ? "Gemini" : "Kural motoru"}</span><span>MCP</span>{Boolean(message.contextMessages) && <span>Bağlam · {message.contextMessages} mesaj</span>}{message.sqlCorrected && <span>SQL otomatik düzeltildi</span>}{message.durationMs && <span>{message.durationMs} ms</span>}</div>}
            {message.sql && <details><summary>Çalıştırılan SQL’i göster</summary><div className="sqlBlock"><code>{message.sql}</code><button className="copySql" type="button" onClick={() => void copySql(message.sql ?? "", message.id)}>{copiedSql === message.id ? "✓ Kopyalandı" : "Kopyala"}</button></div></details>}{message.rows && message.rows.length > 0 && <ResultView rows={message.rows} />}</div></article>)}{loading && <div className="thinking"><span>✦</span><div>Veri şeması inceleniyor ve sorgu çalıştırılıyor<b>•••</b></div></div>}</div>
        </div>
        <form className="composer" onSubmit={submit}><div className="inputBox"><textarea value={input} maxLength={500} rows={1} onChange={(e) => setInput(e.target.value)} onKeyDown={keyDown} placeholder={accessRole === "viewer" ? "Doğrulanmış bir metrik sor..." : "Veritabanına bir soru sor..."} aria-label="Soru"/><span>{input.length}/500</span></div><button disabled={!input.trim() || loading || !connected || !session || !activeConversationId} aria-label="Gönder">↑</button><small>{accessRole === "viewer" ? "Görüntüleyici rolü yalnızca veri sözlüğündeki doğrulanmış metrikleri çalıştırabilir." : "Enter ile gönder · Shift+Enter ile yeni satır · Sonuçlar en fazla 50 satırdır."}</small></form>
      </> : view === "insights" ? <div className="insightsPage">
        <section className="insightsHero"><div><span className="eyebrow">MCP İŞ ANALİZİ</span><h2>Riskleri tespit et, aksiyona dönüştür</h2><p>Bu analizler Gemini kotası kullanmadan, salt okunur sorgularla MCP üzerinden hazırlanır.</p></div><button type="button" onClick={() => void loadInsights()} disabled={insightsLoading}>↻ {insightsLoading ? "Analiz ediliyor" : "Analizi yenile"}</button></section>
        {insightsError && <div className="insightsError"><b>Analiz alınamadı</b><span>{insightsError}</span><button type="button" onClick={() => void loadInsights()}>Tekrar dene</button></div>}
        {insightsLoading && !insightsData && <div className="insightsLoading"><span>✦</span><div><b>Veriler MCP üzerinden analiz ediliyor</b><small>Stok, satış, sipariş ve müşteri riskleri kontrol ediliyor.</small></div></div>}
        {insightsData && <>
          <section className="insightSummary"><article className="summaryCard danger"><span>KRİTİK STOK</span><strong>{insightsData.summary.criticalStock}</strong><small>20 adedin altındaki ürün</small></article><article className="summaryCard warning"><span>RİSKLİ SİPARİŞ</span><strong>{insightsData.summary.riskOrders}</strong><small>Bekleyen veya iptal edilen</small></article><article className="summaryCard neutral"><span>MÜŞTERİ RİSKİ</span><strong>{insightsData.summary.inactiveCustomers}</strong><small>30+ gün veya hiç sipariş yok</small></article><article className="summaryCard success"><span>TAMAMLANAN CİRO</span><strong>{formatValue(insightsData.summary.completedRevenue, "toplam_ciro")}</strong><small>PostgreSQL canlı sonucu</small></article></section>
          <div className="insightToolbar"><div><b>{insightsData.insights.length} aksiyon önerisi</b><span><i className="high" /> {insightsData.insights.filter((item) => item.severity === "high").length} yüksek öncelik</span></div><small>MCP · {insightsData.durationMs} ms</small></div>
          <section className="insightGrid">{insightsData.insights.map((insight) => <article className={`insightCard ${insight.severity}`} key={insight.id}><div className="insightCardTop"><span className={`severityBadge ${insight.severity}`}>{insight.severity === "high" ? "Yüksek öncelik" : insight.severity === "medium" ? "Orta öncelik" : "Düşük öncelik"}</span><small>{insight.title}</small></div><h3>{insight.entity}</h3><p>{insight.description}</p><div className="insightMetrics">{insight.metrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><b>{formatInsightMetric(metric)}</b></div>)}</div><div className="actionBox"><span>ÖNERİLEN AKSİYON</span><p>{insight.action}</p></div><button className="inspectInsight" type="button" disabled={loading} onClick={() => void ask(insight.question)}>Sohbette detaylandır <span>→</span></button></article>)}</section>
          {insightsData.insights.length === 0 && <div className="emptyInsights">Şu anda aksiyon gerektiren bir risk bulunamadı.</div>}
        </>}
      </div> : view === "glossary" ? <div className="glossaryPage">
        <section className="glossaryHero"><div className="glossarySeal">✓</div><div><span className="eyebrow">DOĞRULANMIŞ SEMANTİK KATMAN</span><h2>Şirketin ortak veri dili</h2><p>Metrik tanımları, kullanıcıların farklı ifadelerini aynı onaylı hesaplamaya yönlendirir. Eşleşen sorular Gemini kullanmadan MCP üzerinden çalışır.</p></div><strong>{metricsData?.count ?? "—"}<small>onaylı metrik</small></strong></section>
        {metricsError && <div className="insightsError"><b>Sözlük alınamadı</b><span>{metricsError}</span><button type="button" onClick={() => void loadMetrics()}>Tekrar dene</button></div>}
        {metricsLoading && !metricsData && <div className="insightsLoading"><span>✓</span><div><b>Kurumsal metrikler yükleniyor</b><small>Doğrulanmış tanım ve hesaplama kuralları hazırlanıyor.</small></div></div>}
        {metricsData && <section className="metricGrid">{metricsData.metrics.map((metric) => <article className="metricCard" key={metric.id}><div className="metricCardTop"><span className={`metricCategory category${metric.category}`}>{metric.category}</span><b>✓ Doğrulanmış</b></div><h3>{metric.name}</h3><p>{metric.description}</p><div className="metricFormula"><span>HESAPLAMA KURALI</span><code>{metric.formula}</code></div><div className="metricSynonyms"><span>AYNI ANLAMA GELENLER</span><div>{metric.synonyms.map((synonym) => <i key={synonym}>{synonym}</i>)}</div></div><button type="button" disabled={loading} onClick={() => void ask(metric.sampleQuestions[0])}><span>“{metric.sampleQuestions[0]}”</span><b>Çalıştır →</b></button></article>)}</section>}
      </div> : view === "users" ? <div className="usersPage">
        <section className="usersHero"><div><span className="eyebrow">MERKEZİ ERİŞİM YÖNETİMİ</span><h2>Kullanıcı rolü kullanıcı tarafından seçilmez</h2><p>Yeni hesaplar Görüntüleyici olarak başlar. Analist ve Yönetici erişimi yalnızca yetkili bir yönetici tarafından atanır.</p></div><button type="button" onClick={() => void loadUsers()} disabled={usersLoading}>↻ {usersLoading ? "Yükleniyor" : "Kullanıcıları yenile"}</button></section>
        {usersError && <div className="insightsError"><b>İşlem tamamlanamadı</b><span>{usersError}</span><button type="button" onClick={() => void loadUsers()}>Tekrar dene</button></div>}
        <section className="userSummary"><article><span>TOPLAM HESAP</span><strong>{managedUsers.length}</strong><small>Kayıtlı kullanıcı</small></article><article><span>AKTİF</span><strong>{managedUsers.filter((user) => user.active).length}</strong><small>Oturum açabilir</small></article><article><span>ANALİST</span><strong>{managedUsers.filter((user) => user.role === "analyst").length}</strong><small>Serbest analiz yetkili</small></article><article><span>YÖNETİCİ</span><strong>{managedUsers.filter((user) => user.role === "admin" && user.active).length}</strong><small>Merkezi yönetim yetkili</small></article></section>
        {usersLoading && managedUsers.length === 0 && <div className="insightsLoading"><span>♙</span><div><b>Kullanıcılar yükleniyor</b><small>Roller ve hesap durumları PostgreSQL’den alınıyor.</small></div></div>}
        <section className="userList">{managedUsers.map((user) => <article className={`userRow ${user.active ? "" : "inactive"}`} key={user.id}><div className="userIdentity"><span className="profileAvatar large">{initials(user.name)}</span><div><b>{user.name}{user.id === profile.id && <i>Sen</i>}</b><span>{user.email}</span><small>{user.title || "Unvan belirtilmedi"} · {user.lastLoginAt ? `Son giriş ${conversationDate(user.lastLoginAt)}` : "Henüz giriş yapmadı"}</small></div></div><div className="userCreated"><span>KAYIT TARİHİ</span><b>{conversationDate(user.createdAt)}</b></div><label className="userRole"><span>ERİŞİM ROLÜ</span><select value={user.role} disabled={updatingUserId === user.id || user.id === profile.id} onChange={(event) => void updateManagedUser(user, event.target.value as AccessRole, user.active)}><option value="viewer">Görüntüleyici</option><option value="analyst">Analist</option><option value="admin">Yönetici</option></select></label><button className={`accountState ${user.active ? "active" : "inactive"}`} type="button" disabled={updatingUserId === user.id || user.id === profile.id} onClick={() => void updateManagedUser(user, user.role, !user.active)}><i />{updatingUserId === user.id ? "Güncelleniyor" : user.active ? "Aktif hesap" : "Devre dışı"}</button></article>)}</section>
      </div> : view === "audit" ? <div className="auditPage">
        <section className="auditHero"><div><span className="eyebrow">YÖNETİCİ GÖRÜNÜMÜ</span><h2>Kim, hangi veriye, ne zaman erişti?</h2><p>Başarılı sorgular, engellenen yetki denemeleri ve teknik hatalar append-only denetim kaydında tutulur.</p></div><button type="button" onClick={() => void loadAudit()} disabled={auditLoading}>↻ {auditLoading ? "Yükleniyor" : "Kayıtları yenile"}</button></section>
        {auditError && <div className="insightsError"><b>Kayıtlar alınamadı</b><span>{auditError}</span><button type="button" onClick={() => void loadAudit()}>Tekrar dene</button></div>}
        {auditLoading && !auditData && <div className="insightsLoading"><span>◉</span><div><b>Denetim kayıtları yükleniyor</b><small>Backend üzerindeki kalıcı erişim kayıtları okunuyor.</small></div></div>}
        {auditData && <><section className="auditSummary"><article><span>TOPLAM İŞLEM</span><strong>{auditData.summary.total}</strong><small>Son 150 kayıt</small></article><article className="success"><span>BAŞARILI</span><strong>{auditData.summary.successful}</strong><small>İzin verilen işlemler</small></article><article className="blocked"><span>ENGELLENEN</span><strong>{auditData.summary.blocked}</strong><small>Rol kuralına takılan</small></article><article className="error"><span>HATA</span><strong>{auditData.summary.errors}</strong><small>Teknik başarısızlık</small></article></section>
          <div className="auditToolbar"><div className="auditFilters">{(["all", "success", "blocked", "error"] as const).map((filter) => <button className={auditFilter === filter ? "active" : ""} type="button" key={filter} onClick={() => setAuditFilter(filter)}>{filter === "all" ? "Tümü" : filter === "success" ? "Başarılı" : filter === "blocked" ? "Engellenen" : "Hata"}</button>)}</div>{auditData.entries.length > 0 && <button className="auditExport" type="button" onClick={() => downloadCsv(auditData.entries.map((entry) => ({ zaman: entry.timestamp, kullanici: entry.user.name, rol: accessRoleLabels[entry.user.role], islem: actionLabels[entry.action], durum: entry.status, soru: entry.question ?? "", kaynak: entry.source ?? "", satir: entry.rowCount ?? "", sure_ms: entry.durationMs })))}>↓ CSV indir</button>}</div>
          <section className="auditList">{filteredAuditEntries.map((entry) => <article className={`auditEntry ${entry.status}`} key={entry.id}><div className="auditStatus"><i />{entry.status === "success" ? "Başarılı" : entry.status === "blocked" ? "Engellendi" : "Hata"}</div><div className="auditIdentity"><span className="profileAvatar">{initials(entry.user.name)}</span><div><b>{entry.user.name}</b><small>{accessRoleLabels[entry.user.role]}</small></div></div><div className="auditEvent"><b>{actionLabels[entry.action]}</b><p>{entry.question ?? entry.message ?? "Sistem görünümü açıldı."}</p>{entry.sql && <details><summary>Çalıştırılan SQL</summary><code>{entry.sql}</code></details>}</div><div className="auditFacts"><span>{conversationDate(entry.timestamp)}</span>{entry.source && <span>{entry.source === "verified" ? "Doğrulanmış" : entry.source === "gemini" ? "Gemini" : "Kural motoru"}</span>}{entry.rowCount !== undefined && <span>{entry.rowCount} satır</span>}<span>{entry.durationMs} ms</span></div></article>)}</section>
          {filteredAuditEntries.length === 0 && <div className="emptyInsights">Bu filtreyle eşleşen kayıt bulunamadı.</div>}</>}
      </div> : <div className="schemaPage"><div className="schemaIntro"><div><span className="eyebrow">CANLI ŞEMA</span><h2>{Object.keys(schema).length} tablo MCP erişimine açık</h2><p>Chatbot yalnızca aşağıdaki iş tablolarını okuyabilir. PostgreSQL sistem tabloları ve veri değiştiren komutlar engellenir.</p></div><div className="securityCard"><b>Güvenlik sınırları</b><span>✓ Salt-okunur DB kullanıcısı</span><span>✓ 5 saniye zaman aşımı</span><span>✓ En fazla 50 sonuç satırı</span><span>✓ Tek SELECT/WITH sorgusu</span></div></div><div className="schemaGrid">{Object.entries(schema).map(([table, columns]) => <article className="schemaCard" key={table}><div className="schemaTitle"><span>▤</span><div><h3>{tableNames[table] ?? table}</h3><code>{table}</code></div><b>{columns.length}</b></div><ul>{columns.map((column) => <li key={column.name}><span>{column.name}</span><code>{column.type}</code></li>)}</ul></article>)}</div>{Object.keys(schema).length === 0 && <div className="emptySchema">Şema alınamadı. Backend ve PostgreSQL bağlantısını kontrol et.</div>}</div>}
    </section>
  </main>;
}
