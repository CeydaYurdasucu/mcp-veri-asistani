# 4 Dakikalık Sunum Notları

## 1. Problem — 30 saniye

“Veritabanından bilgi almak için kullanıcıların SQL bilmesi gerekiyor. Bu projede kullanıcı Türkçe soru soruyor ve sistem, güvenli bir SQL sorgusu çalıştırarak sonucu tablo halinde gösteriyor.”

## 2. Mimari — 60 saniye

“Frontend React ve TypeScript ile yazıldı. Sorular NestJS REST API'ye gidiyor. Backend veritabanına doğrudan sorgu göndermiyor; MCP istemcisi olarak ayrı MCP sunucusundaki araçları çağırıyor. MCP sunucusu PostgreSQL'e bağlanıyor. OpenAI anahtarı varsa serbest doğal dil, yoksa çevrimdışı kural motoru kullanılıyor.”

## 3. MCP neden var? — 45 saniye

“MCP, yapay zekâ ile dış veri kaynağı arasında standart bir araç sözleşmesi kuruyor. Biz üç araç tanımladık: bağlantı kontrolü, şema okuma ve güvenli sorgu çalıştırma. Böylece yapay zekâ doğrudan veritabanı parolası veya bağlantısıyla uğraşmıyor.”

## 4. Güvenlik — 45 saniye

“Sistem yalnızca SELECT ve WITH sorgularını kabul ediyor. Çoklu statement, sistem tabloları ve veri değiştiren komutlar reddediliyor. Ayrıca veritabanında yalnızca SELECT yetkisi olan ayrı kullanıcı, read-only transaction, 5 saniye timeout ve 50 satır sınırı var.”

## 5. Canlı demo — 45 saniye

1. Bağlantı göstergesinin yeşil olduğunu göster.
2. “Stoku 20'nin altında olan ürünler hangileri?” sorusunu çalıştır.
3. Dönen tabloyu ve “Çalıştırılan SQL” bölümünü aç.
4. Veri Şeması ekranındaki dört tabloyu göster.
5. Swagger sayfasını kısaca göster.

## 6. Kapanış — 15 saniye

“Sonuç olarak SQL bilmeyen bir kullanıcı, doğal dille veritabanını analiz edebiliyor. MCP katmanı erişimi standartlaştırırken çok katmanlı güvenlik verinin değiştirilememesini sağlıyor.”

## Sorulabilecek sorular

**Neden backend doğrudan PostgreSQL'e bağlanmıyor?**  
MCP araç sınırını, şema keşfini ve güvenlik politikasını veritabanından bağımsız bir katmana taşıyor.

**Model yanlış veya tehlikeli SQL üretirse ne olur?**  
MCP doğrulayıcısı sorguyu reddeder. Ayrıca salt-okunur veritabanı kullanıcısı ikinci güvenlik katmanıdır.

**OpenAI anahtarı olmazsa proje çalışıyor mu?**  
Evet. Sekiz veri konusu için çevrimdışı planlayıcı vardır; anahtar yalnızca serbest soru çeşitliliğini genişletir.
