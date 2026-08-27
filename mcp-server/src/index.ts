import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pg from "pg";
import { z } from "zod";
import { validateReadOnlySql } from "./security.js";

const allowedTables = ["products", "customers", "orders", "order_items"];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://chatbot_reader:readerpass@localhost:5432/salesdb", max: 3, statement_timeout: 5000, query_timeout: 6000, application_name: "veriasistan-mcp" });
const server = new McpServer({ name: "sales-db", version: "2.0.0" });

server.tool("health_check", "MCP ile PostgreSQL bağlantısını gerçek bir sorguyla doğrular", {}, async () => {
  const { rows } = await pool.query("SELECT current_database() AS database, current_user AS user, NOW()::text AS \"serverTime\"");
  return { content: [{ type: "text", text: JSON.stringify(rows[0]) }] };
});

server.tool("get_schema", "İzin verilen public tablo ve kolonlarını döndürür", {}, async () => {
  const { rows } = await pool.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1) ORDER BY table_name,ordinal_position", [allowedTables]);
  return { content: [{ type: "text", text: JSON.stringify(rows) }] };
});

server.tool("query_database", "Veritabanında güvenli, salt okunur SQL çalıştırır", { sql: z.string().min(6).max(4000) }, async ({ sql }) => {
  const clean = validateReadOnlySql(sql);
  const limitedSql = `SELECT * FROM (${clean}) AS safe_result LIMIT 50`;
  const client = await pool.connect(); const started = Date.now();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    const { rows } = await client.query(limitedSql);
    await client.query("ROLLBACK");
    return { content: [{ type: "text", text: JSON.stringify({ rows, rowCount: rows.length, durationMs: Date.now() - started }) }] };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});

async function shutdown() { await pool.end(); process.exit(0); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
await server.connect(new StdioServerTransport());
