# MCP Tabanlı Doğal Dil Veri Asistanı — Proje Raporu

## Özet

Bu projede kullanıcıların SQL bilmeden kurumsal satış verilerini sorgulayabilmesi amaçlanmıştır. React ve TypeScript ile geliştirilen web arayüzü, soruları NestJS API'ye iletir. API, isteğe bağlı OpenAI Responses API veya yerel kural motoruyla bir SQL planı oluşturur. Oluşturulan plan doğrudan veritabanına gönderilmez; Model Context Protocol istemcisi üzerinden ayrı bir MCP sunucusuna aktarılır. MCP sunucusu güvenlik doğrulamasından geçen sorguyu salt-okunur PostgreSQL bağlantısıyla çalıştırır.

## Amaç ve kapsam

Proje aşağıdaki hedefleri karşılar:

- Doğal dil sorularından veri analizi yapmak.
- Yapay zekâ ile veritabanı arasındaki erişimi MCP araçlarıyla standartlaştırmak.
- Üretilen SQL'i kullanıcıya göstererek açıklanabilirlik sağlamak.
- Verinin değiştirilmesini çok katmanlı güvenlikle önlemek.
- Yapay zekâ API anahtarı olmadan da gösterilebilir bir çevrimdışı mod sunmak.

## Kullanılan teknolojiler

| Teknoloji | Kullanım amacı |
| --- | --- |
| React + TypeScript | Etkileşimli, tip güvenli kullanıcı arayüzü |
| NestJS | REST API, doğrulama, Swagger ve iş akışı yönetimi |
| MCP TypeScript SDK | Backend ile veri aracı arasında standart protokol |
| PostgreSQL 16 | İlişkisel satış veritabanı |
| Docker Compose | Tek komutla yeniden üretilebilir veritabanı ortamı |
| OpenAI Responses API | Serbest doğal dil sorularından yapılandırılmış SQL planı |
| Jest / Node Test Runner | Planlayıcı ve SQL güvenlik testleri |

## Uygulama akışı

Kullanıcı sorusu `POST /chat` endpoint'ine ulaşır. DTO katmanı uzunluk ve tür kontrolü uygular. API anahtarı varsa OpenAI'ye yalnızca izin verilen şema gönderilir ve JSON Schema'ya uyan bir sorgu planı alınır. Anahtar yoksa çevrimdışı planlayıcı, sorudaki konu ve sayısal eşiklere göre önceden tanımlı güvenli sorgulardan birini seçer. NestJS MCP istemcisi, `query_database` aracını stdio üzerinden çağırır. MCP sunucusu sorguyu doğrular, sınırlar ve PostgreSQL'de çalıştırır. Sonuç süre ve kaynak bilgisiyle frontend'e döner.

## Veritabanı tasarımı

Veritabanında ürünler, müşteriler, siparişler ve sipariş kalemleri tabloları bulunur. Müşteri-sipariş ilişkisi bire-çoktur. Sipariş ile ürün arasındaki çoktan-çoğa ilişki `order_items` tablosuyla çözülmüştür. Örnek veri setinde 16 ürün, 10 müşteri ve farklı durum/tarihlerde 14 sipariş bulunur.

## Güvenlik değerlendirmesi

Yalnızca prompt ile güvenlik sağlanmamıştır. SQL metni MCP katmanında ikinci kez doğrulanır. Veri değiştiren komutlar, çoklu statement, SQL yorumları, sistem katalogları ve satır kilitleri reddedilir. Veritabanı kullanıcısına yalnızca `SELECT` yetkisi verilmiştir. Sorgular read-only transaction içinde ve 5 saniye timeout ile çalıştırılır. Sonuç seti her koşulda 50 satırla sınırlandırılır.

## Test ve sonuç

Backend planlayıcı testleri stok eşiği çıkarma, farklı konu planları, bilinmeyen soru davranışı ve sonuç özetlemeyi doğrular. MCP güvenlik testleri izin verilen sorguların kabulünü ve tehlikeli SQL örneklerinin reddini doğrular. Üç uygulama katmanı TypeScript/üretim derlemesinden geçmektedir. Manuel senaryolar sağlık kontrolü, sohbet, şema görünümü, bağlantı kesintisi, kalıcı geçmiş ve Swagger arayüzünü kapsar.

## Sınırlılıklar ve gelecek çalışmalar

- Kullanıcı kimlik doğrulaması ve rol bazlı tablo erişimi eklenebilir.
- Büyük sonuç kümeleri için sayfalama ve CSV dışa aktarma geliştirilebilir.
- Grafik üretimi ve otomatik içgörü özelliği eklenebilir.
- Sohbet geçmişi tarayıcı yerine veritabanında kullanıcı bazlı saklanabilir.
- Model sorguları için maliyet ve doğruluk ölçümleri eklenebilir.

## Sonuç

Proje, doğal dil ile ilişkisel veri analizi yapılabildiğini ve MCP'nin yapay zekâ ile veritabanı arasında denetlenebilir bir araç sınırı oluşturduğunu göstermektedir. Çevrimdışı mod sayesinde temel demo dış servise bağımlı değildir; OpenAI entegrasyonu ise soru çeşitliliğini genişletir.
