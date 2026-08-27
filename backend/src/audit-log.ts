import { appendFile, mkdir, readFile } from "fs/promises";
import { dirname, join } from "path";
import type { AccessRole, UserContext } from "./access-control";

export type AuditStatus = "success" | "blocked" | "error";
export type AuditAction = "chat_query" | "view_metrics" | "view_schema" | "view_insights" | "view_audit" | "manage_user";

export type AuditEntry = {
  id: string;
  timestamp: string;
  user: UserContext;
  action: AuditAction;
  status: AuditStatus;
  durationMs: number;
  question?: string;
  source?: "verified" | "gemini" | "offline";
  verifiedMetric?: string;
  rowCount?: number;
  sql?: string;
  message?: string;
};

type NewAuditEntry = Omit<AuditEntry, "id" | "timestamp">;

export class AuditLogStore {
  private readonly path = process.env.AUDIT_LOG_PATH ?? join(process.cwd(), "data", "audit-log.jsonl");
  private writeQueue: Promise<void> = Promise.resolve();

  record(entry: NewAuditEntry) {
    const complete: AuditEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: new Date().toISOString(),
    };
    this.writeQueue = this.writeQueue
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true });
        await appendFile(this.path, `${JSON.stringify(complete)}\n`, "utf8");
      })
      .catch(() => undefined);
    return complete;
  }

  async list(limit = 150) {
    await this.writeQueue;
    let entries: AuditEntry[] = [];
    try {
      const text = await readFile(this.path, "utf8");
      entries = text.split("\n").filter(Boolean).flatMap((line) => {
        try { return [JSON.parse(line) as AuditEntry]; } catch { return []; }
      }).slice(-Math.min(Math.max(limit, 1), 500)).reverse();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const byRole: Record<AccessRole, number> = { viewer: 0, analyst: 0, admin: 0 };
    for (const entry of entries) byRole[entry.user.role] += 1;
    return {
      entries,
      summary: {
        total: entries.length,
        successful: entries.filter((entry) => entry.status === "success").length,
        blocked: entries.filter((entry) => entry.status === "blocked").length,
        errors: entries.filter((entry) => entry.status === "error").length,
        byRole,
      },
      storage: "append-only-jsonl",
      generatedAt: new Date().toISOString(),
    };
  }
}
