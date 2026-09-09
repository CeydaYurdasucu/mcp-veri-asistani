# MCP Tabanlı Kurumsal Veri Asistanı — Teknik Proje Raporu

## Özet

VeriAsistan, kullanıcıların SQL bilmeden kurumsal satış verilerini Türkçe sorularla analiz edebilmesini amaçlayan bir web uygulamasıdır. React ve TypeScript arayüzü, istekleri NestJS API'ye iletir. Doğrulanmış metrik kataloğuyla eşleşen sorular deterministik sorgu planına dönüştürülür; diğer uygun sorularda Gemini yapılandırılmış bir SQL planı üretir. SQL doğrudan veritabanına gönderilmez. Model Context Protocol (MCP) sunucusu sorguyu gerçek PostgreSQL parser ile AST'ye çevirir, açık izin listeleriyle doğrular ve yalnız salt-okunur bağlantı üzerinden çalıştırır. Uygulamada gerçek kullanıcı hesabı, rol bazlı erişim, kullanıcıya özel sohbet/favori verisi ve denetim kaydı da bulunmaktadır.

## Amaç ve kapsam

- Doğal dil sorularından açıklanabilir veri analizi üretmek.
- Yapay zekâ ile veritabanı arasına denetlenebilir MCP araç sınırı koymak.
- Sık kullanılan şirket metriklerini doğrulanmış tanımlarla hesaplamak.
- Kullanıcıları ve sohbet verilerini birbirinden ayırmak.
- Rol ve denetim kaydıyla kurumsal erişim modelini göstermek.
- SQL sorgularını fail-closed ve çok katmanlı güvenlik yaklaşımıyla sınırlandırmak.

## Kullanılan teknolojiler

| Teknoloji | Kullanım amacı |
| --- | --- |
| React + TypeScript | Sohbet, metrik, risk, kullanıcı ve denetim arayüzleri |
| NestJS | REST API, kimlik/oturum, RBAC, doğrulanmış metrikler ve Gemini akışı |
| Gemini 3.1 Flash-Lite | Serbest doğal dil sorularından yapılandırılmış SQL planı |
| MCP TypeScript SDK | Backend ile veritabanı aracı arasında standart protokol |
| `pgsql-parser` | Gerçek PostgreSQL grameriyle AST üretimi |
| PostgreSQL 16 | İş verisi ve ayrı uygulama kimlik şeması |
| Docker Compose | Yeniden üretilebilir yerel veritabanı ortamı |
| Jest / Node Test Runner | Backend davranışı ve MCP güvenlik testleri |
| GitHub Actions | Her push ve pull request için otomatik test kanıtı |

## Sistem mimarisi ve sorgu akışı

1. Kullanıcı güvenli sunucu oturumuyla uygulamaya giriş yapar.
2. NestJS, isteğin kullanıcı kimliğini ve rol yetkisini doğrular.
3. Soru doğrulanmış metrik kataloğuyla eşleşirse güvenli plan doğrudan seçilir.
4. Eşleşmeyen uygun soru, yalnız izin verilen şema ve metrik tanımlarıyla Gemini'ye gönderilir. Gemini'nin görevi yalnızca sorgu planı üretmektir; veritabanı bağlantısına erişimi yoktur.
5. NestJS, SQL'i stdio üzerinden MCP `query_database` aracına iletir.
6. MCP sorguyu PostgreSQL AST'sine çevirir ve açık izin listeleriyle doğrular.
7. Geçerli sorgu `chatbot_reader` kullanıcısıyla read-only transaction içinde çalışır.
8. En fazla 50 satırlık sonuç, kaynak ve süre bilgisiyle arayüze döner; işlem denetim kaydına yazılır.

## Kimlik ve rol modeli

İlk kayıt kurucu Yönetici olur; sonraki kullanıcılar Görüntüleyici rolüyle başlar. Görüntüleyici yalnız doğrulanmış metrikleri, Analist serbest analiz ve Risk Merkezi'ni, Yönetici ise bunlara ek olarak kullanıcı/rol yönetimi ile denetim kayıtlarını kullanabilir. Parolalar salt içeren scrypt özetiyle, oturum belirteçleri yalnız SHA-256 özetiyle saklanır. Tarayıcı oturumu `HttpOnly` ve `SameSite=Strict` çerezi kullanır. Kullanıcı sohbetleri, mesajları ve favorileri oturumdaki `user_id` ile filtrelenir.

## Veritabanı tasarımı

İş verisi `public` şemasındaki `products`, `customers`, `orders` ve `order_items` tablolarında tutulur. Müşteri-sipariş ilişkisi bire-çoktur; sipariş ve ürün arasındaki çoktan-çoğa ilişki `order_items` ile çözülür. Kullanıcı, oturum, sohbet, mesaj ve favori kayıtları ayrı `app_identity` şemasındadır. `chatbot_reader` iş tablolarında yalnız SELECT yetkisine, `app_writer` ise yalnız uygulama şemasında gerekli yazma yetkilerine sahiptir.

## SQL güvenliği ve risk değerlendirmesi

İlk sürümde SQL doğrulaması yasaklı kelimeleri arayan regex/blacklist yaklaşımına dayanıyordu. Bu yaklaşım SQL'in sözdizimsel yapısını anlamadığı için öngörülmeyen bir kalıbın uygulama filtresini aşması veya güvenli bir metnin yanlışlıkla reddedilmesi riskini taşıyordu. Veritabanı rolü ve read-only transaction veri değişikliğine karşı bağımsız koruma sağlasa da regex tek başına yeterli bir uygulama güvenlik sınırı değildi.

Güncel sürümde sorgu gerçek PostgreSQL parser ile AST'ye dönüştürülür ve aşağıdaki açık izin politikası uygulanır:

- Yalnız tek bir kök `SelectStmt` kabul edilir.
- `WITH` içindeki her CTE yine yalnız SELECT olabilir; recursive CTE reddedilir.
- Fiziksel tablo erişimi dört iş tablosuyla sınırlıdır; yalnız `public` şeması kabul edilir.
- AST düğümleri, fonksiyonlar, operatörler ve cast veri tipleri açık izin listelerindedir.
- `SELECT INTO`, satır kilitleme, DML CTE, sistem şemaları, tablo fonksiyonları, kullanıcı tanımlı fonksiyonlar ve bilinmeyen AST düğümleri fail-closed reddedilir.
- PostgreSQL `search_path` değeri `pg_catalog, public` olarak sabitlenir.
- Sorgu yalnız SELECT yetkili kullanıcıyla read-only transaction içinde çalışır; statement timeout 5 saniye, sonuç sınırı 50 satırdır.

AST katmanı riski önemli ölçüde azaltır ancak tek savunma değildir. Parser bağımlılığında keşfedilecek bir hata, izin listesine yanlışlıkla eklenen bir fonksiyon veya pahalı fakat geçerli bir analitik ifade artık risk olarak kabul edilir. Bu nedenle en az yetkili veritabanı rolü, read-only transaction, zaman aşımı, satır sınırı, denetim kaydı ve saldırı testleri korunur. Yeni SQL yeteneği yalnız test eşliğinde izin listesine eklenmelidir.

## Test kapsamı ve kanıt

`npm test` komutu üç ayrı grubu tek akışta çalıştırır:

- Frontend üretim derlemesi.
- 7 backend testi: planlayıcı, kullanıcı kimliği, oturum ve rol sınırları.
- 22 MCP güvenlik testi: normal SELECT/CTE/aggregate örnekleri ile çoklu statement, yorum, bilinmeyen tablo, başka şema, DML CTE, `SELECT INTO`, satır kilidi, recursive CTE, sistem/gecikme fonksiyonları, kullanıcı tanımlı fonksiyon, tablo fonksiyonu, tehlikeli cast, kimlik değeri ve bozuk SQL örnekleri.

`npm run test:integration` ayrı bir geçici PostgreSQL ortamında iki gerçek entegrasyon grubunu çalıştırır:

- MCP/PostgreSQL: gerçek MCP stdio istemcisiyle dört izinli tablonun okunması; yetkisiz tablo/şema, çoklu statement ve veri değiştiren CTE'nin AST tarafından reddedilmesi; doğrudan `chatbot_reader` bağlantısında yetkisiz tablo ve `INSERT` işleminin PostgreSQL izinleriyle reddedilmesi.
- Kimlik/RBAC: gerçek `app_identity` tablolarında ilk kayıt yönetici, sonraki kayıt görüntüleyici olur; görüntüleyicinin `free_chat` yetkisi engellenir, doğrulanmış metrik yetkisi kabul edilir ve yönetici kullanıcı yönetimi yetkisine erişir.

Entegrasyon testleri yalnızca boş ve geçici bir veritabanında çalışacak şekilde tasarlanmıştır. `.github/workflows/ci.yml`, her `main` push'u ve pull request'te PostgreSQL hizmeti başlatır, üç geçiş dosyasını uygular, önce `npm test` sonra `npm run test:integration` çalıştırır. Böylece testlerin yalnızca kaynak kodda bulunması değil, gerçek parser + MCP + PostgreSQL + oturum/RBAC sınırlarında çalıştırılması da GitHub Actions geçmişinde görülebilir. `docs/TEST-SENARYOLARI.md` içindeki arayüz kabul senaryoları ayrıca manuel olarak işaretlenmiştir; otomatik test sayısına dahil değildir.

Üç paket alanında `npm audit --audit-level=moderate` sonucu 0 güvenlik açığıdır. Ana sürüm zorlayan `npm audit fix --force` uygulanmamış, bağımlılık sürümleri kilit dosyalarıyla korunmuştur.

## Sınırlılıklar ve gelecek çalışmalar

- E-posta doğrulama, parola sıfırlama ve kurumsal SSO henüz yoktur.
- AST izin listesi bilinmeyen fakat güvenli bir SQL yapısını da reddedebilir; politika bilinçli olarak fail-closed tasarlanmıştır.
- Sohbet istekleri için merkezi rate limit ve dağıtık oturum deposu eklenebilir.
- Model doğruluğu, gecikme ve maliyet metrikleri daha uzun süreli veriyle ölçülebilir.
- Üretimde TLS, secret manager, yönetilen PostgreSQL ve merkezi gözlemleme kullanılmalıdır.

## Sonuç

VeriAsistan; doğal dil analizi, doğrulanmış kurumsal metrikler, MCP araç sınırı, gerçek kimlik/rol yönetimi ve denetim kaydını tek bir prototipte birleştirir. Güvenlik geri bildirimi sonrasında regex tabanlı doğrulama kaldırılmış, yapısal PostgreSQL AST ve açık izin listesi uygulanmış, AST saldırı testleri gerçek MCP/PostgreSQL yetki testleriyle tamamlanmış, kimlik/RBAC entegrasyonları otomatikleştirilmiş ve CI kanıtı eklenmiştir. Böylece proje yalnız çalışan bir demo olmaktan çıkarak güvenlik tercihlerini, sınırlarını ve kalan riskleri açıkça belgeleyen daha denetlenebilir bir mühendislik çalışmasına dönüşmüştür.
