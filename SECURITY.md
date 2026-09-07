# Güvenlik modeli

VeriAsistan, model tarafından üretilen SQL'i güvenilir kabul etmez. İş verisine giden sorgular MCP sunucusunda gerçek PostgreSQL ayrıştırıcısıyla AST'ye çevrilir ve açık izin politikası uygulanır.

## Kabul edilen sorgu yüzeyi

- Tek bir `SELECT` veya yalnız `SELECT` içeren, recursive olmayan `WITH` sorgusu.
- Yalnız `public.products`, `public.customers`, `public.orders` ve `public.order_items` tabloları ile sorgu içinde tanımlanan CTE adları.
- `mcp-server/src/security.ts` içinde açıkça izin verilen AST düğümleri, fonksiyonlar, operatörler ve yerleşik veri tipleri.
- SQL yorumları desteklenmez. Tanınmayan her yapı fail-closed reddedilir.

`INSERT`, `UPDATE`, `DELETE`, veri değiştiren CTE, `SELECT INTO`, satır kilidi, recursive CTE, sistem şeması, tablo döndüren fonksiyon, kullanıcı tanımlı fonksiyon ve çoklu statement kabul edilmez.

## Bağımsız savunma katmanları

- PostgreSQL bağlantısı yalnız `SELECT` yetkili `chatbot_reader` rolünü kullanır.
- Her sorgu `BEGIN TRANSACTION READ ONLY` içinde çalışır.
- `search_path`, `pg_catalog, public` ile sınırlandırılır.
- Statement timeout 5 saniye, sonuç sınırı 50 satırdır.
- Sorgular ve engellenen işlemler denetim kaydına alınır.

## Bilinen sınırlar

İlk sürümdeki regex/blacklist doğrulaması SQL'in yapısını anlamadığı için öngörülmeyen sözdizimlerinin filtreyi aşması riskini taşıyordu ve kaldırıldı. AST/izin listesi bu riski önemli ölçüde azaltır; ancak parser bağımlılığındaki bir hata, yanlış genişletilmiş bir izin listesi veya pahalı fakat geçerli bir `SELECT` olasılığını tamamen ortadan kaldırmaz. Bu nedenle AST doğrulaması tek savunma hattı değildir.

Yeni bir SQL özelliği eklenirken genel bir düğüm veya fonksiyon grubuna izin verilmemelidir. Gereken en küçük AST öğesi izin listesine eklenmeli; hem kabul hem saldırı regresyon testi yazılmalı ve `npm test` başarıyla tamamlanmalıdır.

## Doğrulama

```bash
npm test
```

Bu komut frontend kontrolünü, 7 backend testini ve 22 MCP AST güvenlik testini çalıştırır. Aynı akış GitHub Actions üzerinde her push ve pull request için tekrar edilir.
