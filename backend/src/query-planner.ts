export type QueryPlan = { mode: "query" | "unsupported"; sql: string; answerTitle: string; explanation: string };

const query = (sql: string, answerTitle: string, explanation: string): QueryPlan => ({ mode: "query", sql, answerTitle, explanation });

export function createOfflinePlan(question: string): QueryPlan | null {
  const q = question.toLocaleLowerCase("tr-TR").replace(/[?!.,]/g, " ");
  const number = Number(q.match(/\b(\d{1,4})\b/)?.[1] ?? 20);
  if (q.includes("stok") && /(az|düşük|alt|kritik)/.test(q)) return query(`SELECT name AS urun, category AS kategori, stock AS stok FROM products WHERE stock < ${number} ORDER BY stock ASC LIMIT 50`, "Düşük stoklu ürünler", `Stoku ${number} adedin altında olan ürünler listelendi.`);
  if (q.includes("stok") && /(çok|yüksek|fazla|üst)/.test(q)) return query(`SELECT name AS urun, category AS kategori, stock AS stok FROM products WHERE stock > ${number} ORDER BY stock DESC LIMIT 50`, "Yüksek stoklu ürünler", `Stoku ${number} adedin üzerinde olan ürünler listelendi.`);
  if (/(çok|fazla|popüler)/.test(q) && /(satış|satılan|ürün)/.test(q)) return query("SELECT p.name AS urun, SUM(oi.quantity)::int AS satilan_adet, SUM(oi.quantity * oi.unit_price)::numeric(12,2) AS gelir FROM order_items oi JOIN products p ON p.id=oi.product_id GROUP BY p.id,p.name ORDER BY satilan_adet DESC LIMIT 5", "En çok satılan ürünler", "Satış adedine göre ilk 5 ürün listelendi.");
  if (/(az|düşük)/.test(q) && /(satış|satılan)/.test(q)) return query("SELECT p.name AS urun, COALESCE(SUM(oi.quantity),0)::int AS satilan_adet FROM products p LEFT JOIN order_items oi ON p.id=oi.product_id GROUP BY p.id,p.name ORDER BY satilan_adet ASC LIMIT 5", "En az satılan ürünler", "Satış adedine göre son 5 ürün listelendi.");
  if (q.includes("ciro") || q.includes("gelir")) return query(q.includes("toplam") && !q.includes("ay") ? "SELECT COALESCE(SUM(total),0)::numeric(12,2) AS toplam_ciro FROM orders WHERE status='completed'" : "SELECT COALESCE(SUM(total),0)::numeric(12,2) AS aylik_ciro FROM orders WHERE status='completed' AND created_at >= date_trunc('month', CURRENT_DATE)", q.includes("ay") ? "Bu ayın cirosu" : "Toplam ciro", "Tamamlanan siparişlerin tutarı toplandı.");
  if (q.includes("ortalama") && q.includes("fiyat")) return query("SELECT ROUND(AVG(price),2) AS ortalama_fiyat FROM products", "Ortalama ürün fiyatı", "Tüm ürünlerin ortalama fiyatı hesaplandı.");
  if (/(pahalı|yüksek fiyat)/.test(q)) return query("SELECT name AS urun, category AS kategori, price AS fiyat FROM products ORDER BY price DESC LIMIT 5", "En pahalı ürünler", "Fiyatı en yüksek 5 ürün listelendi.");
  if (/(ucuz|düşük fiyat)/.test(q)) return query("SELECT name AS urun, category AS kategori, price AS fiyat FROM products ORDER BY price ASC LIMIT 5", "En uygun fiyatlı ürünler", "Fiyatı en düşük 5 ürün listelendi.");
  if (q.includes("kategori")) return query("SELECT category AS kategori, COUNT(*)::int AS urun_sayisi, ROUND(AVG(price),2) AS ortalama_fiyat FROM products GROUP BY category ORDER BY urun_sayisi DESC", "Kategori özeti", "Ürünler kategorilerine göre gruplandı.");
  if (q.includes("müşteri") && /(kaç|sayı|adet|ne kadar)/.test(q)) return query("SELECT COUNT(*)::int AS musteri_sayisi FROM customers", "Müşteri sayısı", "Kayıtlı müşteriler sayıldı.");
  if (q.includes("müşteri")) return query("SELECT name AS musteri, email, city AS sehir FROM customers ORDER BY name LIMIT 50", "Müşteri listesi", "Kayıtlı müşteriler alfabetik listelendi.");
  if (q.includes("sipariş") && /(son|yeni|güncel)/.test(q)) return query("SELECT o.id AS siparis_no, c.name AS musteri, o.total AS tutar, o.status AS durum, o.created_at AS tarih FROM orders o JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC LIMIT 10", "Son siparişler", "En yeni 10 sipariş listelendi.");
  if (q.includes("sipariş") && /(kaç|sayı|adet|ne kadar)/.test(q)) return query("SELECT COUNT(*)::int AS siparis_sayisi FROM orders", "Sipariş sayısı", "Tüm siparişler sayıldı.");
  if (q.includes("ürün") && /(kaç|sayı|adet|ne kadar)/.test(q)) return query("SELECT COUNT(*)::int AS urun_sayisi FROM products", "Ürün sayısı", "Katalogdaki ürünler sayıldı.");
  if (q.includes("ürün")) return query("SELECT name AS urun, category AS kategori, price AS fiyat, stock AS stok FROM products ORDER BY name LIMIT 50", "Ürün listesi", "Ürün kataloğu listelendi.");
  return null;
}

export function summarizeRows(plan: QueryPlan, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return `${plan.answerTitle}: sonuç bulunamadı.`;
  const entries = Object.entries(rows[0]);
  if (rows.length === 1 && entries.length === 1) return `${plan.answerTitle}: ${String(entries[0][1])}.`;
  return `${plan.explanation} ${rows.length} kayıt bulundu.`;
}
