# Sistem Mimarisi

```mermaid
flowchart LR
    U[Kullanıcı] --> F[React + TypeScript]
    F -->|POST /chat| B[NestJS API]
    B -->|SQL planı| A[OpenAI veya kural motoru]
    B -->|MCP stdio| M[MCP sunucusu]
    M -->|Salt okunur SQL| P[(PostgreSQL)]
    P --> M --> B --> F
```

## Bileşen sorumlulukları

| Katman | Sorumluluk |
| --- | --- |
| React | Soruyu alma, bağlantı durumunu gösterme, geçmişi cihazda saklama, SQL ve tablo sonucunu sunma |
| NestJS | Girdi doğrulama, soru planlama, MCP istemciliği, hata yönetimi, Swagger |
| OpenAI / kural motoru | Doğal dil sorusundan güvenli SQL planı üretme |
| MCP sunucusu | Araç sözleşmesi, SQL güvenlik kontrolü, sorgu sınırları ve PostgreSQL erişimi |
| PostgreSQL | Ürün, müşteri, sipariş ve sipariş kalemi verilerini saklama |

## Veritabanı ilişkileri

```mermaid
erDiagram
    CUSTOMERS ||--o{ ORDERS : verir
    ORDERS ||--|{ ORDER_ITEMS : icerir
    PRODUCTS ||--o{ ORDER_ITEMS : satilir
    CUSTOMERS { int id PK string name string email string city }
    PRODUCTS { int id PK string name string category decimal price int stock }
    ORDERS { int id PK int customer_id FK decimal total string status datetime created_at }
    ORDER_ITEMS { int id PK int order_id FK int product_id FK int quantity decimal unit_price }
```

## Güvenlik katmanları

1. DTO doğrulaması soruyu 2–500 karakterle sınırlar.
2. Model yalnızca izin verilen şemayı görür ve Structured Outputs ile plan döndürür.
3. MCP yalnızca `SELECT` veya `WITH` ile başlayan tek statement kabul eder.
4. Yorumlar, veri değiştiren anahtar kelimeler, satır kilitleri ve sistem katalogları reddedilir.
5. PostgreSQL bağlantısı `chatbot_reader` isimli yalnızca-okuma kullanıcısıyla kurulur.
6. Sorgu read-only transaction içinde, 5 saniye zaman aşımıyla çalışır.
7. Sorgu bir alt sorgu olarak sarılır ve sonuç en fazla 50 satır olur.
