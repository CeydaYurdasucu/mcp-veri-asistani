import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import type { AccessRole, UserContext } from "./access-control";

const SESSION_HOURS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const DUMMY_PASSWORD_HASH = "scrypt$16384$8$1$fVpl2txOvdqIpTN4eJ5N1Q$bjXMTfBh8f7TQQJjBJQhR-op_kwf7_GbROZjOuZ2UFcRVf_dsJGiif2K1d0dIFacF7iNZx6GNK18BDEHj_0a7Q";

export type ApplicationUser = UserContext & {
  email: string;
  title: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
};

export type StoredMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  sql?: string;
  rows?: Record<string, unknown>[];
  source?: "verified" | "gemini" | "offline";
  verifiedMetric?: string;
  verifiedMetricVersion?: string;
  contextMessages?: number;
  sqlCorrected?: boolean;
  durationMs?: number;
  createdAt: string;
};

export type StoredConversation = {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: string;
  updatedAt: string;
};

export type StoredFavorite = { id: string; question: string; createdAt: string };
type PoolLike = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
  connect: () => Promise<ClientLike>;
  end?: () => Promise<void>;
};
type ClientLike = { query: PoolLike["query"]; release: () => void };

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase("tr-TR");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function derivePassword(password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number; maxmem: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, derived) => error ? reject(error) : resolve(derived));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, nText, rText, pText, saltText, expectedText] = stored.split("$");
  if (algorithm !== "scrypt" || !saltText || !expectedText) return false;
  const expected = Buffer.from(expectedText, "base64url");
  const derived = await derivePassword(password, Buffer.from(saltText, "base64url"), expected.length, {
    N: Number(nText), r: Number(rText), p: Number(pText), maxmem: 64 * 1024 * 1024,
  });
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

@Injectable()
export class ApplicationStore {
  private database?: PoolLike;

  async close() {
    const database = this.database;
    this.database = undefined;
    await database?.end?.();
  }

  private pool(): PoolLike {
    if (this.database) return this.database;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require("pg") as { Pool: new (options: { connectionString: string; max: number }) => PoolLike };
      this.database = new Pool({
        connectionString: process.env.APP_DATABASE_URL ?? "postgresql://app_writer:appwriterpass@localhost:5432/salesdb",
        max: 10,
      });
      return this.database;
    } catch {
      throw new ServiceUnavailableException("Uygulama veritabanı sürücüsü bulunamadı. Backend klasöründe npm install çalıştır.");
    }
  }

  async ready() {
    try {
      const result = await this.pool().query(`
        SELECT to_regclass('app_identity.users') AS users_table,
               EXISTS (
                 SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'app_identity'
                   AND table_name = 'messages'
                   AND column_name = 'verified_metric_version'
               ) AS metric_version_column`);
      if (!result.rows[0]?.users_table || !result.rows[0]?.metric_version_column) throw new Error("migration missing");
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("Üyelik tabloları güncel değil. database/002-identity-and-user-data.sql ve database/004-metric-version.sql geçişlerini çalıştır.");
    }
  }

  async register(name: string, email: string, password: string) {
    await this.ready();
    const cleanName = name.trim().slice(0, 80);
    const cleanEmail = normalizeEmail(email);
    if (cleanName.length < 2) throw new BadRequestException("Ad en az 2 karakter olmalıdır.");
    const passwordHash = await hashPassword(password);
    const client = await this.pool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(667341)");
      const count = await client.query("SELECT COUNT(*)::int AS count FROM app_identity.users");
      const role: AccessRole = Number(count.rows[0]?.count ?? 0) === 0 ? "admin" : "viewer";
      const id = randomUUID();
      const result = await client.query(
        `INSERT INTO app_identity.users (id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, title, role, active, created_at, last_login_at`,
        [id, cleanName, cleanEmail, passwordHash, role],
      );
      const session = await this.createSession(client, result.rows[0]);
      await client.query("COMMIT");
      return { ...session, firstOrganizationAdmin: role === "admin" };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if ((error as { code?: string }).code === "23505") throw new ConflictException("Bu e-posta adresiyle kayıtlı bir hesap var.");
      throw error;
    } finally {
      client.release();
    }
  }

  async login(email: string, password: string) {
    await this.ready();
    const cleanEmail = normalizeEmail(email);
    const result = await this.pool().query(
      `SELECT id, name, email, title, role, active, created_at, last_login_at, password_hash,
              failed_login_count, locked_until
       FROM app_identity.users WHERE email = $1`,
      [cleanEmail],
    );
    const record = result.rows[0];
    if (!record) {
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException("E-posta veya şifre hatalı.");
    }
    if (!record.active) throw new ForbiddenException("Bu hesap devre dışı bırakılmış.");
    if (record.locked_until && new Date(record.locked_until).getTime() > Date.now()) {
      throw new HttpException("Çok sayıda başarısız giriş yapıldı. 15 dakika sonra tekrar dene.", HttpStatus.TOO_MANY_REQUESTS);
    }

    const valid = await verifyPassword(password, record.password_hash);
    if (!valid) {
      const attempts = Number(record.failed_login_count ?? 0) + 1;
      const lockedUntil = attempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
      await this.pool().query(
        "UPDATE app_identity.users SET failed_login_count = $2, locked_until = $3 WHERE id = $1",
        [record.id, lockedUntil ? 0 : attempts, lockedUntil],
      );
      if (lockedUntil) throw new HttpException("Çok sayıda başarısız giriş yapıldı. Hesap 15 dakika kilitlendi.", HttpStatus.TOO_MANY_REQUESTS);
      throw new UnauthorizedException("E-posta veya şifre hatalı.");
    }

    await this.pool().query(
      "UPDATE app_identity.users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1",
      [record.id],
    );
    const updated = { ...record, last_login_at: new Date().toISOString() };
    return this.createSession(this.pool(), updated);
  }

  private async createSession(client: Pick<PoolLike, "query">, record: any) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60_000);
    await client.query(
      `INSERT INTO app_identity.sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), record.id, tokenHash(token), expiresAt],
    );
    return { token, expiresAt: expiresAt.toISOString(), user: this.mapUser(record) };
  }

  async authenticate(token: string) {
    await this.ready();
    const result = await this.pool().query(
      `SELECT u.id, u.name, u.email, u.title, u.role, u.active, u.created_at, u.last_login_at
       FROM app_identity.sessions s
       JOIN app_identity.users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW() AND u.active = TRUE`,
      [tokenHash(token)],
    );
    if (!result.rows[0]) throw new UnauthorizedException("Oturumun süresi dolmuş veya oturum geçersiz.");
    return this.mapUser(result.rows[0]);
  }

  async logout(token: string) {
    await this.ready();
    await this.pool().query("UPDATE app_identity.sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL", [tokenHash(token)]);
  }

  async updateProfile(userId: string, name: string, title: string) {
    const cleanName = name.trim().slice(0, 80);
    if (cleanName.length < 2) throw new BadRequestException("Ad en az 2 karakter olmalıdır.");
    const result = await this.pool().query(
      `UPDATE app_identity.users SET name = $2, title = $3, updated_at = NOW()
       WHERE id = $1 RETURNING id, name, email, title, role, active, created_at, last_login_at`,
      [userId, cleanName, title.trim().slice(0, 80)],
    );
    return this.mapUser(result.rows[0]);
  }

  async listUsers() {
    const result = await this.pool().query(
      `SELECT id, name, email, title, role, active, created_at, last_login_at
       FROM app_identity.users ORDER BY created_at ASC`,
    );
    return result.rows.map((row) => this.mapUser(row));
  }

  async updateUserAccess(actor: ApplicationUser, targetId: string, role: AccessRole, active: boolean) {
    if (actor.id === targetId && (role !== "admin" || !active)) {
      throw new ForbiddenException("Kendi yönetici erişimini kaldıramaz veya kendi hesabını kapatamazsın.");
    }
    const client = await this.pool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(667342)");
      const target = await client.query("SELECT role, active FROM app_identity.users WHERE id = $1 FOR UPDATE", [targetId]);
      if (!target.rows[0]) throw new ConflictException("Kullanıcı bulunamadı.");
      if (target.rows[0].role === "admin" && target.rows[0].active && (role !== "admin" || !active)) {
        const admins = await client.query("SELECT COUNT(*)::int AS count FROM app_identity.users WHERE role = 'admin' AND active = TRUE");
        if (Number(admins.rows[0]?.count ?? 0) <= 1) throw new ForbiddenException("Sistemde en az bir aktif yönetici kalmalıdır.");
      }
      const result = await client.query(
        `UPDATE app_identity.users SET role = $2, active = $3, updated_at = NOW()
         WHERE id = $1 RETURNING id, name, email, title, role, active, created_at, last_login_at`,
        [targetId, role, active],
      );
      if (!active) await client.query("UPDATE app_identity.sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL", [targetId]);
      await client.query("COMMIT");
      return this.mapUser(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listConversations(userId: string): Promise<StoredConversation[]> {
    const conversations = await this.pool().query(
      `SELECT id, title, created_at, updated_at FROM app_identity.conversations
       WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50`,
      [userId],
    );
    if (conversations.rows.length === 0) return [];
    const ids = conversations.rows.map((row) => row.id);
    const messages = await this.pool().query(
      `SELECT id, conversation_id, role, content, sql, result_rows, source, verified_metric, verified_metric_version,
              context_messages, sql_corrected, duration_ms, created_at
       FROM app_identity.messages WHERE conversation_id = ANY($1::uuid[])
       ORDER BY created_at ASC`,
      [ids],
    );
    const grouped = new Map<string, StoredMessage[]>();
    for (const row of messages.rows) {
      const list = grouped.get(row.conversation_id) ?? [];
      list.push(this.mapMessage(row));
      grouped.set(row.conversation_id, list);
    }
    return conversations.rows.map((row) => ({
      id: row.id,
      title: row.title,
      messages: (grouped.get(row.id) ?? []).slice(-40),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  async createConversation(userId: string): Promise<StoredConversation> {
    const result = await this.pool().query(
      `INSERT INTO app_identity.conversations (id, user_id, title) VALUES ($1, $2, 'Yeni sohbet')
       RETURNING id, title, created_at, updated_at`,
      [randomUUID(), userId],
    );
    const row = result.rows[0];
    return { id: row.id, title: row.title, messages: [], createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
  }

  async assertConversation(userId: string, conversationId: string) {
    const result = await this.pool().query("SELECT id FROM app_identity.conversations WHERE id = $1 AND user_id = $2", [conversationId, userId]);
    if (!result.rows[0]) throw new ForbiddenException("Bu sohbet sana ait değil veya bulunamadı.");
  }

  async deleteConversation(userId: string, conversationId: string) {
    const result = await this.pool().query("DELETE FROM app_identity.conversations WHERE id = $1 AND user_id = $2", [conversationId, userId]);
    if (!result.rowCount) throw new ForbiddenException("Bu sohbet sana ait değil veya bulunamadı.");
  }

  async conversationHistory(userId: string, conversationId: string, limit = 8) {
    await this.assertConversation(userId, conversationId);
    const result = await this.pool().query(
      `SELECT role, content, sql, result_rows FROM app_identity.messages
       WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [conversationId, limit],
    );
    return result.rows.reverse().map((row) => {
      const sqlContext = row.role === "assistant" && row.sql ? `\nSQL: ${row.sql}` : "";
      const resultContext = row.role === "assistant" && Array.isArray(row.result_rows) && row.result_rows.length
        ? `\nSonuç: ${JSON.stringify(row.result_rows.slice(0, 10))}` : "";
      return { role: row.role as "user" | "assistant", content: `${row.content}${sqlContext}${resultContext}`.slice(0, 3000) };
    });
  }

  async appendMessage(userId: string, conversationId: string, message: Omit<StoredMessage, "id" | "createdAt">) {
    await this.assertConversation(userId, conversationId);
    const id = randomUUID();
    const result = await this.pool().query(
      `INSERT INTO app_identity.messages
        (id, conversation_id, role, content, sql, result_rows, source, verified_metric, verified_metric_version, context_messages, sql_corrected, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)
       RETURNING id, role, content, sql, result_rows, source, verified_metric, verified_metric_version, context_messages, sql_corrected, duration_ms, created_at`,
      [id, conversationId, message.role, message.content, message.sql ?? null, JSON.stringify(message.rows ?? []), message.source ?? null,
        message.verifiedMetric ?? null, message.verifiedMetricVersion ?? null, message.contextMessages ?? 0, message.sqlCorrected ?? false, message.durationMs ?? null],
    );
    if (message.role === "user") {
      const title = message.content.trim().length > 38 ? `${message.content.trim().slice(0, 38)}…` : message.content.trim();
      await this.pool().query(
        `UPDATE app_identity.conversations SET title = CASE WHEN title = 'Yeni sohbet' THEN $3 ELSE title END, updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [conversationId, userId, title || "Yeni sohbet"],
      );
    } else {
      await this.pool().query("UPDATE app_identity.conversations SET updated_at = NOW() WHERE id = $1 AND user_id = $2", [conversationId, userId]);
    }
    return this.mapMessage(result.rows[0]);
  }

  async listFavorites(userId: string): Promise<StoredFavorite[]> {
    const result = await this.pool().query(
      "SELECT id, question, created_at FROM app_identity.favorites WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
      [userId],
    );
    return result.rows.map((row) => ({ id: row.id, question: row.question, createdAt: new Date(row.created_at).toISOString() }));
  }

  async addFavorite(userId: string, question: string) {
    const clean = question.trim().slice(0, 500);
    const key = clean.toLocaleLowerCase("tr-TR");
    await this.pool().query(
      `INSERT INTO app_identity.favorites (id, user_id, question, question_key)
       VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, question_key) DO NOTHING`,
      [randomUUID(), userId, clean, key],
    );
    return this.listFavorites(userId);
  }

  async deleteFavorite(userId: string, favoriteId: string) {
    await this.pool().query("DELETE FROM app_identity.favorites WHERE id = $1 AND user_id = $2", [favoriteId, userId]);
    return this.listFavorites(userId);
  }

  private mapUser(row: any): ApplicationUser {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      title: row.title ?? "",
      role: row.role,
      active: Boolean(row.active),
      createdAt: new Date(row.created_at).toISOString(),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : undefined,
    };
  }

  private mapMessage(row: any): StoredMessage {
    return {
      id: row.id,
      role: row.role,
      content: row.content,
      sql: row.sql ?? undefined,
      rows: Array.isArray(row.result_rows) ? row.result_rows : [],
      source: row.source ?? undefined,
      verifiedMetric: row.verified_metric ?? undefined,
      verifiedMetricVersion: row.verified_metric_version ?? undefined,
      contextMessages: Number(row.context_messages ?? 0),
      sqlCorrected: Boolean(row.sql_corrected),
      durationMs: row.duration_ms === null || row.duration_ms === undefined ? undefined : Number(row.duration_ms),
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
