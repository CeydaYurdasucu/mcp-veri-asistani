import type { QueryPlan } from "./query-planner";

export const METRIC_CATALOG_VERSION = "1.1.0";

export type VerifiedMetricDefinition = {
  id: string;
  name: string;
  category: "Finans" | "Satış" | "Müşteri" | "Operasyon" | "Stok";
  description: string;
  formula: string;
  synonyms: string[];
  sampleQuestions: string[];
};

export const verifiedMetrics: VerifiedMetricDefinition[] = [
  {
    id: "monthly_revenue", name: "Aylık ciro", category: "Finans",
    description: "İçinde bulunulan takvim ayında tamamlanan siparişlerin toplam tutarı.",
    formula: "SUM(orders.total), status = completed, tarih = bu ay",
    synonyms: ["bu ayın geliri", "aylık satış tutarı", "bu ay ciro"],
    sampleQuestions: ["Bu ayın toplam cirosu ne kadar?"],
  },
  {
    id: "total_revenue", name: "Toplam ciro", category: "Finans",
    description: "Tüm zamanlarda yalnızca tamamlanan siparişlerin toplam tutarı.",
    formula: "SUM(orders.total), status = completed",
    synonyms: ["toplam gelir", "genel ciro", "tamamlanan satış tutarı"],
    sampleQuestions: ["Toplam ciro ne kadar?"],
  },
  {
    id: "average_order_value", name: "Ortalama sipariş tutarı", category: "Finans",
    description: "Tamamlanan siparişlerin ortalama sepet değeri.",
    formula: "AVG(orders.total), status = completed",
    synonyms: ["ortalama sepet", "sipariş ortalaması", "ortalama satış tutarı"],
    sampleQuestions: ["Ortalama sipariş tutarı nedir?"],
  },
  {
    id: "units_sold", name: "Satılan ürün adedi", category: "Satış",
    description: "Tamamlanan sipariş kalemlerindeki toplam ürün miktarı.",
    formula: "SUM(order_items.quantity), orders.status = completed",
    synonyms: ["satış adedi", "kaç ürün satıldı", "satılan adet"],
    sampleQuestions: ["Toplam kaç ürün satıldı?"],
  },
  {
    id: "top_selling_products", name: "En çok satan ürünler", category: "Satış",
    description: "Tamamlanan siparişlerde satılan adede göre ürün sıralaması.",
    formula: "SUM(order_items.quantity) GROUP BY products, status = completed",
    synonyms: ["popüler ürünler", "satış liderleri", "en fazla satılan"],
    sampleQuestions: ["En çok satan 5 ürünü göster."],
  },
  {
    id: "active_customers", name: "Aktif müşteri", category: "Müşteri",
    description: "Son 30 günde en az bir tamamlanmış siparişi bulunan tekil müşteri.",
    formula: "COUNT(DISTINCT customer_id), completed, son 30 gün",
    synonyms: ["son 30 gün müşterileri", "aktif kullanıcı", "alışveriş yapan müşteri"],
    sampleQuestions: ["Kaç aktif müşterimiz var?"],
  },
  {
    id: "customer_count", name: "Toplam müşteri", category: "Müşteri",
    description: "Müşteri tablosunda kayıtlı toplam tekil müşteri sayısı.",
    formula: "COUNT(customers.id)",
    synonyms: ["kayıtlı müşteri", "müşteri sayısı"],
    sampleQuestions: ["Kaç müşterimiz var?"],
  },
  {
    id: "low_stock", name: "Kritik stok", category: "Stok",
    description: "Belirtilen eşiğin altında stoğu bulunan ürünler; eşik yazılmazsa 20 kullanılır.",
    formula: "products.stock < eşik (varsayılan 20)",
    synonyms: ["az stok", "düşük stok", "stok uyarısı"],
    sampleQuestions: ["Stoku 20'nin altında olan ürünleri göster."],
  },
  {
    id: "product_count", name: "Toplam ürün", category: "Operasyon",
    description: "Ürün kataloğundaki toplam ürün kaydı.",
    formula: "COUNT(products.id)",
    synonyms: ["ürün sayısı", "katalog büyüklüğü"],
    sampleQuestions: ["Kaç ürün var?"],
  },
  {
    id: "order_count", name: "Toplam sipariş", category: "Operasyon",
    description: "Durumundan bağımsız olarak oluşturulmuş toplam sipariş sayısı.",
    formula: "COUNT(orders.id)",
    synonyms: ["sipariş sayısı", "kaç sipariş var"],
    sampleQuestions: ["Toplam kaç sipariş var?"],
  },
];

type VerifiedMatch = { metricId: string; metricVersion: string; plan: QueryPlan };
type MetricRule = { metricId: string; matches: (question: string) => boolean; build: (question: string) => QueryPlan };
const query = (sql: string, answerTitle: string, explanation: string): QueryPlan => ({ mode: "query", sql, answerTitle, explanation });
const normalized = (question: string) => question.toLocaleLowerCase("tr-TR").replace(/[?!.,]/g, " ").replace(/\s+/g, " ").trim();
const requestedNumber = (question: string, fallback: number, maximum = 50) => Math.min(Math.max(Number(question.match(/\b(\d{1,4})\b/)?.[1] ?? fallback), 1), maximum);

const rules: MetricRule[] = [
  {
    metricId: "monthly_revenue",
    matches: (q) => /(bu ay|aylık|bu ayın)/.test(q) && /(ciro|gelir|satış tutarı)/.test(q),
    build: () => query("SELECT COALESCE(SUM(total),0)::numeric(12,2) AS aylik_ciro FROM orders WHERE status='completed' AND created_at >= date_trunc('month',CURRENT_DATE) AND created_at < date_trunc('month',CURRENT_DATE)+INTERVAL '1 month'", "Bu ayın cirosu", "Bu takvim ayında tamamlanan siparişlerin tutarı toplandı."),
  },
  {
    metricId: "average_order_value",
    matches: (q) => /ortalama/.test(q) && /(sipariş|sepet|satış)/.test(q) && /(tutar|değer|ortalama)/.test(q) && !/(en yüksek|maksimum|max)/.test(q),
    build: () => query("SELECT COALESCE(ROUND(AVG(total),2),0) AS ortalama_tutar FROM orders WHERE status='completed'", "Ortalama sipariş tutarı", "Tamamlanan siparişlerin ortalama tutarı hesaplandı."),
  },
  {
    metricId: "active_customers",
    matches: (q) => /aktif/.test(q) && /müşteri/.test(q),
    build: () => query("SELECT COUNT(DISTINCT customer_id)::int AS aktif_musteri_sayisi FROM orders WHERE status='completed' AND created_at >= CURRENT_DATE-INTERVAL '30 days'", "Aktif müşteri sayısı", "Son 30 günde tamamlanmış siparişi bulunan tekil müşteriler sayıldı."),
  },
  {
    metricId: "units_sold",
    matches: (q) => /(kaç|toplam|adet|sayı)/.test(q) && /(ürün|birim)/.test(q) && /(satıldı|satılan|satış adedi)/.test(q),
    build: () => query("SELECT COALESCE(SUM(oi.quantity),0)::int AS satilan_adet FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status='completed'", "Satılan ürün adedi", "Tamamlanan siparişlerdeki ürün miktarları toplandı."),
  },
  {
    metricId: "top_selling_products",
    matches: (q) => /(en çok|çok satan|en fazla|popüler)/.test(q) && /(ürün|satış|satılan)/.test(q),
    build: (q) => { const limit = requestedNumber(q, 5, 20); return query(`SELECT p.name AS urun,SUM(oi.quantity)::int AS satilan_adet,SUM(oi.quantity*oi.unit_price)::numeric(12,2) AS gelir FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id WHERE o.status='completed' GROUP BY p.id,p.name ORDER BY satilan_adet DESC LIMIT ${limit}`, "En çok satan ürünler", `Tamamlanan siparişlerde satış adedine göre ilk ${limit} ürün listelendi.`); },
  },
  {
    metricId: "low_stock",
    matches: (q) => /stok/.test(q) && /(az|düşük|kritik|alt)/.test(q),
    build: (q) => { const threshold = requestedNumber(q, 20, 10000); return query(`SELECT name AS urun,category AS kategori,stock AS stok FROM products WHERE stock < ${threshold} ORDER BY stock ASC LIMIT 50`, "Kritik stok", `Stoku ${threshold} adedin altında olan ürünler listelendi.`); },
  },
  {
    metricId: "total_revenue",
    matches: (q) => /(ciro|gelir)/.test(q) && /(toplam|genel|tümü|ne kadar)/.test(q) && !/(bu ay|aylık|bu ayın)/.test(q),
    build: () => query("SELECT COALESCE(SUM(total),0)::numeric(12,2) AS toplam_ciro FROM orders WHERE status='completed'", "Toplam ciro", "Tüm zamanlardaki tamamlanan siparişlerin tutarı toplandı."),
  },
  {
    metricId: "product_count",
    matches: (q) => /ürün/.test(q) && /(kaç|ne kadar|sayı|adet)/.test(q) && !/(satıldı|satılan|satış|stok)/.test(q),
    build: () => query("SELECT COUNT(*)::int AS urun_sayisi FROM products", "Ürün sayısı", "Ürün kataloğundaki kayıtlar sayıldı."),
  },
  {
    metricId: "customer_count",
    matches: (q) => /müşteri/.test(q) && /(kaç|ne kadar|sayı|adet)/.test(q) && !/aktif/.test(q),
    build: () => query("SELECT COUNT(*)::int AS musteri_sayisi FROM customers", "Müşteri sayısı", "Kayıtlı müşteriler sayıldı."),
  },
  {
    metricId: "order_count",
    matches: (q) => /sipariş/.test(q) && /(kaç|ne kadar|sayı|adet|toplam)/.test(q) && !/(tutar|ciro|gelir|ortalama|son|yeni)/.test(q),
    build: () => query("SELECT COUNT(*)::int AS siparis_sayisi FROM orders", "Sipariş sayısı", "Oluşturulan tüm siparişler sayıldı."),
  },
];

export function createVerifiedPlan(question: string): VerifiedMatch | null {
  const q = normalized(question);
  const rule = rules.find((candidate) => candidate.matches(q));
  return rule ? { metricId: rule.metricId, metricVersion: METRIC_CATALOG_VERSION, plan: rule.build(q) } : null;
}

export function metricCatalogPrompt() {
  return JSON.stringify({ catalogVersion: METRIC_CATALOG_VERSION, metrics: verifiedMetrics.map(({ id, name, description, formula, synonyms }) => ({ id, name, description, formula, synonyms })) });
}
