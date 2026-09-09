import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import pg from "pg";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type ToolResult = { isError?: boolean; content?: Array<{ type: string; text?: string }> };

const readerUrl = process.env.INTEGRATION_DATABASE_URL;
const adminUrl = process.env.INTEGRATION_ADMIN_DATABASE_URL;
const enabled = Boolean(readerUrl && adminUrl);
const sentinelTable = "veriasistan_integration_secret";

let reader: pg.Pool;
let admin: pg.Pool;
let client: Client;
let transport: StdioClientTransport;

function resultText(result: ToolResult) {
  return (result.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n");
}

async function call(sql: string) {
  return client.callTool({ name: "query_database", arguments: { sql } }) as Promise<ToolResult>;
}

async function assertToolRejects(sql: string) {
  const result = await call(sql);
  assert.equal(result.isError, true, `Sorgu reddedilmedi: ${sql}`);
}

before(async () => {
  if (!readerUrl || !adminUrl) return;
  reader = new pg.Pool({ connectionString: readerUrl });
  admin = new pg.Pool({ connectionString: adminUrl });
  await admin.query(`CREATE TABLE IF NOT EXISTS public.${sentinelTable} (id integer PRIMARY KEY, secret text NOT NULL)`);
  await admin.query(`TRUNCATE TABLE public.${sentinelTable}`);
  await admin.query(`INSERT INTO public.${sentinelTable} (id, secret) VALUES (1, 'not for chatbot')`);
  await admin.query(`REVOKE ALL PRIVILEGES ON TABLE public.${sentinelTable} FROM chatbot_reader`);

  const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("./index.js", import.meta.url))],
    env: { ...environment, DATABASE_URL: readerUrl },
  });
  client = new Client({ name: "veriasistan-integration-test", version: "1.0.0" });
  await client.connect(transport);
});

after(async () => {
  if (!enabled || !client || !transport || !admin || !reader) return;
  await client.close().catch(() => undefined);
  await transport.close().catch(() => undefined);
  await admin.query(`DROP TABLE IF EXISTS public.${sentinelTable}`);
  await reader.end();
  await admin.end();
});

test("MCP gerçek PostgreSQL okuyucu rolüyle izinli tabloyu sorgular", { skip: !enabled }, async () => {
  const result = await call("SELECT COUNT(*)::int AS count FROM public.products");
  assert.equal(result.isError, undefined);
  const body = JSON.parse(resultText(result));
  assert.equal(body.rowCount, 1);
  assert.equal(typeof body.rows[0].count, "number");
});

test("MCP şema aracında yalnız dört iş tablosunu gösterir", { skip: !enabled }, async () => {
  const result = await client.callTool({ name: "get_schema", arguments: {} }) as ToolResult;
  const rows = JSON.parse(resultText(result)) as Array<{ table_name: string }>;
  assert.deepEqual([...new Set(rows.map((row) => row.table_name))].sort(), ["customers", "order_items", "orders", "products"]);
});

test("MCP AST doğrulaması ve okuyucu rolü yetkisiz tabloyu birlikte engeller", { skip: !enabled }, async () => {
  await assertToolRejects(`SELECT * FROM ${sentinelTable}`);
  await assertToolRejects("SELECT * FROM information_schema.columns");
  await assertToolRejects("SELECT * FROM products; DROP TABLE products");
  await assertToolRejects("WITH changed AS (DELETE FROM products RETURNING *) SELECT * FROM changed");
});

test("okuyucu rolü doğrudan SELECT dışındaki işletme yazmasını da reddeder", { skip: !enabled }, async () => {
  await assert.rejects(reader.query(`SELECT * FROM public.${sentinelTable}`), /permission denied/);
  await assert.rejects(
    reader.query("INSERT INTO public.products (name, category, price, stock) VALUES ('integration', 'test', 1, 1)"),
    /permission denied/,
  );
});
