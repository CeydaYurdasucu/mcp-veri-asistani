# MCP Veri Asistanı

[![CI](https://github.com/CeydaYurdasucu/mcp-veri-asistani/actions/workflows/ci.yml/badge.svg)](https://github.com/CeydaYurdasucu/mcp-veri-asistani/actions/workflows/ci.yml)

React, TypeScript, NestJS, PostgreSQL, Gemini ve Model Context Protocol (MCP) ile geliştirilmiş kurumsal veri analiz uygulaması. Kullanıcı Türkçe soru sorar; doğrulanmış metrikler doğrudan güvenli sorgu planına, diğer uygun sorular Gemini ile yapılandırılmış SQL planına dönüşür. SQL, PostgreSQL AST ayrıştırması ve açık izin listelerinden geçmeden çalıştırılmaz.

## Özellikler

- Gerçek kullanıcı kaydı, güvenli giriş/çıkış ve `HttpOnly` sunucu oturumu.
- Görüntüleyici, Analist ve Yönetici rolleriyle backend tarafından uygulanan RBAC.
- Kullanıcıya özel sohbet geçmişi, mesajlar, favoriler ve profil.
- Yöneticiye özel kullanıcı/rol yönetimi ve denetim kayıtları.
- Gemini 3.1 Flash-Lite ile serbest doğal dil soruları.
- Gemini kotası kullanmayan doğrulanmış kurumsal metrik kataloğu.
- API anahtarı olmadığında temel sorular için çevrimdışı kural motoru.
- Risk ve Aksiyon Merkezi.
- MCP araçları: `health_check`, `get_schema`, `query_database`.
- PostgreSQL AST + tablo/fonksiyon/operatör/tip izin listesi.
- KPI kartları, tablo, otomatik grafik, CSV dışa aktarma ve SQL kopyalama.
- Swagger API dokümantasyonu.
- Kayıt, giriş ve sohbet uçlarında IP tabanlı süreç içi rate limiting.
- Doğrulanmış metrik kataloğu sürümleme ve sohbet/denetim kayıtlarında sürüm izi.
- GitHub Actions ile otomatik derleme ve test.

## Mimari

```text
React + TypeScript
        │
        ▼
NestJS REST API ──► Kimlik, oturum, RBAC ve denetim kaydı
        │
        ├──► Doğrulanmış metrik / çevrimdışı planlayıcı
        └──► Gemini yapılandırılmış SQL planı
        │
        ▼
MCP query_database
        │
        ├──► PostgreSQL AST ayrıştırma
        ├──► Açık izin listeleri
        └──► Read-only transaction + 5 sn timeout + 50 satır
        │
        ▼
PostgreSQL
```

Gemini veritabanına bağlanmaz. İş verileri yalnızca MCP ve `chatbot_reader` üzerinden okunur. Kullanıcı/oturum/sohbet verileri ayrı `app_identity` şemasında `app_writer` tarafından yönetilir.

Ayrıntılar: [`docs/MIMARI.md`](docs/MIMARI.md)

## Gerekenler

- Node.js 22 veya üzeri
- npm
- Docker Desktop
- Serbest sorular için Gemini API anahtarı

## Windows / PowerShell kurulumu

Proje ana klasöründe PostgreSQL'i başlatın:

```powershell
docker compose up -d postgres
docker compose ps
```

İlk kurulumda üyelik şemasını oluşturun:

```powershell
docker compose cp .\database\002-identity-and-user-data.sql postgres:/tmp/identity.sql
$dbUser = (docker compose exec -T postgres printenv POSTGRES_USER).Trim()
$dbName = (docker compose exec -T postgres printenv POSTGRES_DB).Trim()
docker compose exec -T postgres psql -U $dbUser -d $dbName -f /tmp/identity.sql
```

Mevcut bir veritabanında MCP okuyucu yetkisini dört iş tablosuyla sınırlamak için ayrıca:

```powershell
docker compose cp .\database\003-reader-grants.sql postgres:/tmp/reader-grants.sql
docker compose exec -T postgres psql -U $dbUser -d $dbName -f /tmp/reader-grants.sql

docker compose cp .\database\004-metric-version.sql postgres:/tmp/metric-version.sql
docker compose exec -T postgres psql -U $dbUser -d $dbName -f /tmp/metric-version.sql
```

Bağımlılıkları ve MCP derlemesini hazırlayın:

```powershell
npm install
npm install --prefix backend
npm install --prefix mcp-server
npm run build --prefix mcp-server
```

`.env.example` dosyasını `backend/.env` olarak kopyalayın ve kendi Gemini anahtarınızı ekleyin:

```env
GEMINI_API_KEY=KENDI_ANAHTARINIZ
GEMINI_MODEL=gemini-3.1-flash-lite
```

Backend'i çalıştırın:

```powershell
cd backend
npm run dev
```

Yeni terminalde frontend'i çalıştırın:

```powershell
cd C:\projenin\bulundugu\klasor\MCP-Veri-Asistani
npm run dev
```

Adresler:

- Arayüz: http://localhost:3000
- API: http://localhost:3001
- Sağlık kontrolü: http://localhost:3001/health
- Swagger: http://localhost:3001/docs

İlk oluşturulan hesap kurucu Yönetici olur; sonraki hesaplar Görüntüleyici rolüyle başlar.

## Güvenlik modeli

SQL güvenliği bir yasaklı kelime listesine dayanmaz. MCP katmanı şu sırayla fail-closed doğrulama yapar:

1. Sorgu gerçek PostgreSQL ayrıştırıcısıyla AST'ye çevrilir.
2. Yalnızca tek bir kök `SelectStmt` kabul edilir; `WITH` içindeki bütün CTE'ler de SELECT olmalıdır.
3. Yalnızca `products`, `customers`, `orders`, `order_items` tabloları ve sorguda tanımlanan CTE'ler kullanılabilir.
4. AST düğümleri, fonksiyonlar, operatörler ve veri tipleri açık izin listeleriyle doğrulanır.
5. `SELECT INTO`, recursive CTE, satır kilitleme, başka şemalar, sistem katalogları, tablo fonksiyonları ve bilinmeyen yapılar reddedilir.
6. PostgreSQL oturumunda `search_path = pg_catalog, public` sabitlenir.
7. `chatbot_reader` yalnız `SELECT` yetkilidir; sorgu read-only transaction içinde, 5 saniye zaman aşımıyla çalışır ve sonuç 50 satırla sınırlandırılır.
8. Kayıt (5/15 dk), giriş (10/15 dk) ve sohbet (30/dk) istekleri IP başına süreç içi kayan pencereyle sınırlandırılır; dağıtık üretim için merkezi Redis/ağ geçidi gerekir.

AST doğrulaması uygulama katmanındaki ana kontroldür; veritabanı rolü ve read-only transaction bağımsız ikinci savunma hattıdır. Yeni bir SQL özelliği gerektiğinde genel erişim açmak yerine ilgili AST düğümü/fonksiyonu testle birlikte izin listesine eklenmelidir.

Tehdit modeli ve kalan riskler: [`SECURITY.md`](SECURITY.md)

## Testler

Frontend, backend ve MCP statik güvenlik kontrolleri tek komutla çalışır:

```powershell
npm test
```

Test grupları:

- Frontend üretim derlemesi.
- Backend planlayıcı, oturum, rol sınırı, rate limit ve metrik katalog sürümü testleri.
- 22 MCP güvenlik testi: normal SELECT/CTE/aggregate senaryoları ile çoklu statement, DML CTE, `SELECT INTO`, kilitleme, recursive CTE, sistem şeması, bilinmeyen tablo/fonksiyon, tablo fonksiyonu, tehlikeli cast ve bozuk SQL saldırı örnekleri.

Gerçek PostgreSQL entegrasyon testleri, Docker üzerinde geçici bir veritabanıyla ayrıca çalıştırılır:

```powershell
docker compose up -d postgres
# database/init.sql, database/002-identity-and-user-data.sql,
# database/003-reader-grants.sql ve database/004-metric-version.sql
# geçişlerini uyguladıktan sonra:
npm run test:integration
```

Bu akış; MCP istemcisinin gerçek `chatbot_reader` rolüyle dört izinli tabloyu okuyabildiğini, yetkisiz tablo/şema ve DML sorgularının MCP + PostgreSQL tarafından reddedildiğini, ayrıca gerçek oturumlarla ilk hesabın yönetici ve sonraki hesabın görüntüleyici olduğunu doğrular. Entegrasyon testi güvenlik nedeniyle yalnızca boş ve geçici `app_identity` veritabanında çalışır. GitHub Actions her push ve pull request'te PostgreSQL hizmeti başlatır, geçişleri uygular ve bu testi otomatik çalıştırır.

`npm audit --audit-level=moderate --omit=dev` kök üretim bağımlılıklarında temiz sonuç verir; backend ve MCP tarafında NestJS/multer ve Hono'nun transitive uyarıları görülebilir. `npm audit fix --force` gibi kırıcı ana sürüm yükseltmeleri uygulanmamış; bu uyarılar üretim öncesi bağımlılık yükseltme planında izlenmektedir.

Her `main` push'u ve pull request için aynı komut `.github/workflows/ci.yml` tarafından çalıştırılır. Manuel kabul senaryoları: [`docs/TEST-SENARYOLARI.md`](docs/TEST-SENARYOLARI.md)

## Klasörler

- `app/`: React + TypeScript arayüzü
- `backend/`: NestJS API, Gemini entegrasyonu, kimlik/RBAC ve MCP istemcisi
- `mcp-server/`: MCP araçları, AST güvenlik katmanı ve salt-okunur PostgreSQL erişimi
- `database/`: İş verisi ve `app_identity` şeması geçişleri
- `docs/`: Mimari, teknik rapor ve test belgeleri

## Örnek sorular

- Bu ayın toplam cirosu ne kadar?
- Stoku 20'nin altında olan ürünler hangileri?
- En çok satış yapılan 5 ürünü göster.
- Tamamlanan siparişlerin ortalama ve en yüksek tutarını göster.
- Kategorilere göre ürün sayılarını listele.

## Bilinen sınırlar

- E-posta doğrulama, parola sıfırlama ve kurumsal SSO bu sürümün kapsamında değildir.
- Gemini yalnız izin listesinin desteklediği SQL alt kümesini kullanabilir; desteklenmeyen güvenli bir SQL yapısı da fail-closed reddedilebilir.
- Demo parolaları yalnız yerel geliştirme içindir. Üretimde secret manager, TLS, güçlü parolalar ve merkezi kimlik sağlayıcısı kullanılmalıdır.
