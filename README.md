# MCP Veri Asistanı v2

React + TypeScript, NestJS, PostgreSQL ve Model Context Protocol (MCP) ile geliştirilmiş doğal dilde veri analiz uygulaması. Kullanıcı Türkçe soru sorar; backend güvenli bir SQL planı üretir, MCP sunucusu sorguyu salt-okunur PostgreSQL kullanıcısıyla çalıştırır ve sonuç arayüzde tablo olarak gösterilir.

## Neler var?

- Canlı MCP/PostgreSQL sağlık kontrolü; arayüzdeki bağlantı etiketi gerçek API sonucudur.
- OpenAI anahtarı varsa serbest doğal dil desteği, yoksa 8 konu başlığında çevrimdışı soru motoru.
- MCP araçları: `health_check`, `get_schema`, `query_database`.
- SQL güvenliği: yalnızca `SELECT/WITH`, tek statement, sistem tabloları engeli, salt-okunur transaction, 5 saniye zaman aşımı ve 50 satır sınırı.
- Tarayıcıda saklanan son 40 mesaj ve son sorular.
- Canlı veritabanı şeması ekranı.
- Swagger API dokümantasyonu.
- Backend ve MCP güvenlik testleri.
- Windows uyumlu çalıştırma komutları.

## Mimari

```text
React + TypeScript → NestJS REST API → MCP istemcisi → MCP sunucusu → PostgreSQL
                                      ↘ OpenAI Responses API (isteğe bağlı)
```

Ayrıntılı mimari ve ER diyagramı: [`docs/MIMARI.md`](docs/MIMARI.md)

## Gerekenler

- Node.js 22.13 veya üzeri
- npm
- Docker Desktop (çalışır durumda)

## Windows / PowerShell kurulumu

### v1'den v2'ye geçiyorsanız

Yeni ZIP'i ayrı bir klasöre çıkarın. Eski Docker volume'unda `chatbot_reader` kullanıcısı yoksa v2'nin salt-okunur bağlantısı kurulamaz. Bir defaya mahsus şu komutlarla örnek veritabanını yeniden oluşturun (yalnızca projenin örnek verisini siler):

```powershell
docker compose down -v
docker compose up -d
```

İlk kez kuruyorsanız aşağıdan devam edin.

Ana proje klasöründe:

```powershell
docker compose up -d
docker compose ps
```

`postgres` servisinin durumu `healthy` olduktan sonra MCP sunucusunu derleyin:

```powershell
cd .\mcp-server
npm install --prefer-online
npm run build
cd ..
```

Backend'i hazırlayın:

```powershell
cd .\backend
npm install --prefer-online
Copy-Item ..\.env.example .env
npm run dev
```

Backend terminalini açık bırakın. Yeni terminalde frontend'i çalıştırın:

```powershell
cd C:\projenin\bulundugu\klasor\MCP-Veri-Asistani
npm install --prefer-online
npm run dev
```

Adresler:

- Arayüz: http://localhost:3000
- Sağlık kontrolü: http://localhost:3001/health
- Swagger: http://localhost:3001/docs
- Şema API'si: http://localhost:3001/schema

## OpenAI ile serbest soru desteği

Anahtar zorunlu değildir. Anahtar yoksa stok, satış, ciro, ürün, kategori, müşteri, sipariş ve fiyat konularındaki yaygın sorular çevrimdışı çalışır.

Serbest sorular için `backend/.env` dosyasını açın:

```env
OPENAI_API_KEY=sk-proje-anahtariniz
OPENAI_MODEL=gpt-4o-mini
```

Anahtarı koda, Git deposuna veya ekran görüntüsüne eklemeyin. Değişiklikten sonra backend'i yeniden başlatın. En güncel entegrasyon, OpenAI'nin yeni projeler için önerdiği Responses API ve JSON Schema tabanlı Structured Outputs kullanır:

- https://developers.openai.com/api/docs/guides/migrate-to-responses
- https://developers.openai.com/api/docs/guides/structured-outputs

## Örnek sorular

- Stoku 10'un altında olan ürünler hangileri?
- En çok satış yapılan 5 ürünü göster.
- En az satılan ürünleri listele.
- Bu ayın toplam cirosu ne kadar?
- Ortalama ürün fiyatı nedir?
- En pahalı 5 ürün hangisi?
- Kategorilere göre ürün sayılarını göster.
- Kaç müşterimiz var?
- Son 10 siparişi göster.

## Testler

```powershell
cd .\backend
npm test

cd ..\mcp-server
npm test
```

Manuel test listesi: [`docs/TEST-SENARYOLARI.md`](docs/TEST-SENARYOLARI.md)

## Klasörler

- `app/`: React + TypeScript kullanıcı arayüzü
- `backend/`: NestJS REST API, OpenAI entegrasyonu ve MCP istemcisi
- `mcp-server/`: PostgreSQL MCP araçları ve SQL güvenlik katmanı
- `database/`: PostgreSQL şeması ve örnek veriler
- `docs/`: mimari, test ve sunum dokümanları

## Teslimde anlatılacak kısa akış

1. Kullanıcı doğal dilde soru gönderir.
2. NestJS, OpenAI veya çevrimdışı planlayıcıyla salt-okunur SQL üretir.
3. Backend veritabanına doğrudan sorgu göndermez; MCP istemcisi `query_database` aracını çağırır.
4. MCP sunucusu SQL'i doğrular ve PostgreSQL'de read-only transaction içinde çalıştırır.
5. Cevap, kullanılan SQL, çalışma modu, süre ve sonuç satırlarıyla arayüzde gösterilir.

Sunum konuşma metni: [`docs/SUNUM-NOTLARI.md`](docs/SUNUM-NOTLARI.md)
