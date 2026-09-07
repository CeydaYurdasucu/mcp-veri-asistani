import assert from "node:assert/strict";
import test from "node:test";
import { validateReadOnlySql } from "./security.js";

async function accepts(sql: string) {
  return validateReadOnlySql(sql);
}

async function rejects(sql: string, message?: RegExp) {
  if (message) await assert.rejects(validateReadOnlySql(sql), message);
  else await assert.rejects(validateReadOnlySql(sql));
}

test("tek SELECT sorgusunu kabul eder", async () => {
  assert.equal(await accepts("SELECT * FROM products;"), "SELECT * FROM products");
});

test("yalnız SELECT içeren CTE sorgusunu kabul eder", async () => {
  const sql = "WITH totals AS (SELECT product_id, SUM(quantity)::int AS quantity FROM order_items GROUP BY product_id) SELECT * FROM totals";
  assert.equal(await accepts(sql), sql);
});

test("izinli tablo, join, aggregate ve public şemasını kabul eder", async () => {
  const sql = "SELECT c.city, COUNT(*)::int FROM public.orders o JOIN customers c ON c.id = o.customer_id GROUP BY c.city ORDER BY COUNT(*) DESC";
  assert.equal(await accepts(sql), sql);
});

test("analitik tarih, JSON ve alt sorgu düğümlerini kabul eder", async () => {
  const sql = `WITH activity AS (
    SELECT c.id, MAX(o.created_at) AS last_at
    FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id
  )
  SELECT json_build_object(
    'total', (SELECT COUNT(*)::int FROM products),
    'items', COALESCE((SELECT json_agg(item) FROM (
      SELECT jsonb_build_object('days', FLOOR(EXTRACT(EPOCH FROM (NOW() - last_at)) / 86400)) AS item
      FROM activity WHERE last_at IS NOT NULL
    ) rows), '[]'::json)
  )`;
  assert.equal(await accepts(sql), sql);
});

test("güvenli filtre, BETWEEN, ILIKE ve UNION sorgularını kabul eder", async () => {
  const sql = "SELECT name FROM products WHERE price BETWEEN 100 AND 2000 AND name ILIKE '%a%' UNION ALL SELECT name FROM products WHERE stock >= 20";
  assert.equal(await accepts(sql), sql);
});

test("string içindeki noktalı virgülü ikinci statement saymaz", async () => {
  const sql = "SELECT name FROM products WHERE name = 'A;B'";
  assert.equal(await accepts(sql), sql);
});

test("DELETE statement reddedilir", async () => {
  await rejects("DELETE FROM products", /SELECT veya WITH/);
});

test("birden fazla statement reddedilir", async () => {
  await rejects("SELECT 1; SELECT 2", /tek SQL statement/);
});

test("SQL yorumları reddedilir", async () => {
  await rejects("SELECT * FROM products -- gizli bölüm", /yorumları/);
  await rejects("SELECT /* gizli bölüm */ * FROM products", /yorumları/);
});

test("izin listesinde olmayan iş tablosu reddedilir", async () => {
  await rejects("SELECT * FROM payments", /Tablo izin listesinde değil/);
});

test("sistem katalogları ve başka şemalar reddedilir", async () => {
  await rejects("SELECT * FROM pg_catalog.pg_user", /public şemasına/);
  await rejects("SELECT * FROM information_schema.columns", /public şemasına/);
  await rejects("SELECT * FROM private.products", /public şemasına/);
});

test("veri değiştiren CTE reddedilir", async () => {
  await rejects("WITH removed AS (DELETE FROM products RETURNING *) SELECT * FROM removed", /AST düğümü izin listesinde değil/);
  await rejects("WITH changed AS (UPDATE products SET stock = 0 RETURNING *) SELECT * FROM changed", /AST düğümü izin listesinde değil/);
});

test("SELECT INTO reddedilir", async () => {
  await rejects("SELECT * INTO copied_products FROM products", /SELECT INTO/);
});

test("satır kilitleme ifadeleri reddedilir", async () => {
  await rejects("SELECT * FROM products FOR UPDATE", /kilitleyen/);
  await rejects("SELECT * FROM products FOR SHARE", /kilitleyen/);
});

test("recursive CTE reddedilir", async () => {
  await rejects("WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM numbers WHERE n < 5) SELECT * FROM numbers", /Recursive CTE/);
});

test("sistem ve gecikme fonksiyonları reddedilir", async () => {
  await rejects("SELECT pg_sleep(1)", /Fonksiyon izin listesinde değil/);
  await rejects("SELECT pg_read_file('/etc/passwd')", /Fonksiyon izin listesinde değil/);
  await rejects("SELECT set_config('search_path', 'public', false)", /Fonksiyon izin listesinde değil/);
});

test("kullanıcı tanımlı veya şema nitelemeli fonksiyonlar reddedilir", async () => {
  await rejects("SELECT calculate_bonus()", /Fonksiyon izin listesinde değil/);
  await rejects("SELECT public.sum(stock) FROM products", /Fonksiyon izin listesinde değil/);
});

test("tablo döndüren fonksiyonlar reddedilir", async () => {
  await rejects("SELECT * FROM generate_series(1, 10)", /AST düğümü izin listesinde değil/);
});

test("tehlikeli ve özel veri tipi dönüşümleri reddedilir", async () => {
  await rejects("SELECT 'products'::regclass", /Veri tipi izin listesinde değil/);
  await rejects("SELECT 'x'::private.secret_type", /yerleşik PostgreSQL veri tipleri/);
});

test("kimlik bilgisi döndüren SQL değer fonksiyonları reddedilir", async () => {
  await rejects("SELECT CURRENT_USER", /SQL değer fonksiyonu izin listesinde değil/);
});

test("SELECT/WITH dışındaki SelectStmt kısayolları reddedilir", async () => {
  await rejects("VALUES (1)", /SELECT veya WITH/);
  await rejects("TABLE products", /SELECT veya WITH/);
});

test("bozuk SQL fail-closed reddedilir", async () => {
  await rejects("SELECT FROM products WHERE", /AST olarak ayrıştırılamadı/);
});
