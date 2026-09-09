# Test Senaryoları

## Tek komutla otomatik test

Proje ana klasöründe:

```powershell
npm test
```

Bu komut frontend üretim derlemesini, backend Jest testlerini ve MCP AST güvenlik testlerini birlikte çalıştırır. Gerçek PostgreSQL entegrasyonları ayrı komutla çalışır; GitHub Actions her iki akışı da temiz bir ortamda tekrar eder.

Gerçek veritabanı/RBAC testi için, yalnızca geçici ve boş bir veritabanında:

```powershell
npm run test:integration
```

Bu komut `INTEGRATION_APP_DATABASE_URL`, `INTEGRATION_DATABASE_URL` ve `INTEGRATION_ADMIN_DATABASE_URL` değişkenleri tanımlı değilse entegrasyon testlerini atlar. CI bunları PostgreSQL hizmetine yönlendirir.

## Otomatik test kapsamı

| Katman | Otomatik doğrulanan davranış |
| --- | --- |
| Frontend | Üretim derlemesi |
| Backend | Çevrimdışı planlama, sonuç özetleme, oturum belirtecinin sunucuda çözülmesi, rol sınırları ve son yönetici koruması |
| MCP — izin verilen | Tek SELECT, SELECT CTE, join, aggregate, tarih/JSON alt sorguları, UNION, BETWEEN/ILIKE ve string içindeki noktalı virgül |
| MCP — reddedilen | DML, çoklu statement, yorum, bilinmeyen tablo, sistem/özel şema, DML CTE, SELECT INTO, satır kilidi, recursive CTE, tehlikeli/bilinmeyen fonksiyon, tablo fonksiyonu, özel cast, kimlik değeri ve bozuk SQL |
| PostgreSQL/MCP entegrasyonu | Gerçek MCP stdio istemcisiyle izinli tabloların okunması; yetkisiz tablo/şema, çoklu statement ve DML'in AST + `chatbot_reader` rolü tarafından reddedilmesi; şema çıktısının dört tabloyla sınırlı olması |
| Kimlik/RBAC entegrasyonu | Gerçek `app_identity` PostgreSQL tablolarında ilk kayıt yönetici, sonraki kayıt görüntüleyici; görüntüleyicinin `free_chat` yetkisinin 403 karşılığı ve yöneticinin kullanıcı yönetimi yetkisi |

## Manuel kabul testleri

Bu bölüm otomatik test sayısına dahil değildir; çalışan frontend, backend ve PostgreSQL ortamında elle uygulanır.

| No | İşlem | Beklenen sonuç |
| --- | --- | --- |
| 1 | `/health` adresini aç | MCP, iş veritabanı ve kimlik veritabanı durumu bağlı görünür |
| 2 | İlk hesabı oluştur | Hesap Yönetici olur; Kullanıcılar ve Denetim kayıtları menüleri görünür |
| 3 | İkinci hesabı oluştur | Hesap Görüntüleyici rolüyle başlar |
| 4 | Görüntüleyici olarak “Kaç ürün var?” sor | Doğrulanmış metrik çalışır |
| 5 | Görüntüleyici olarak serbest analiz sor | Backend 403 ile engeller ve işlem denetim kaydına düşer |
| 6 | Yönetici ikinci hesabı Analist yapar | Kullanıcı yeniden girişte serbest analiz ve Risk Merkezi'ne erişir |
| 7 | İki hesapta farklı sohbet/favori oluştur | Her hesap yalnız kendi sohbetini ve favorisini görür |
| 8 | “Bu ayın toplam cirosu ne kadar?” sor | Doğrulanmış metrik etiketi, SQL ve KPI sonucu görünür |
| 9 | Karmaşık uygun bir analiz sor | Gemini planı AST doğrulamasından sonra MCP ile çalışır |
| 10 | Risk Merkezi'ni aç | Özet kartları ve aksiyon kayıtları görüntülenir |
| 11 | Yönetici Denetim kayıtlarını aç | Başarılı, engellenen ve hatalı işlemler listelenir; CSV indirilebilir |
| 12 | Backend'i durdur | Bağlantı durumu bozulur ve yeni sorgu kontrollü hata verir |

## Güvenlik regresyon testi

Yalnız MCP AST güvenlik testlerini çalıştırmak için:

```powershell
npm test --prefix mcp-server
```

Başarılı sonuçta `22` testin geçtiği ve `0` testin başarısız olduğu görülmelidir. Testler veritabanına bağlanmaz ve veri değiştirmez; gerçek PostgreSQL parser tarafından üretilen AST üzerinde izin politikalarını doğrular.

Gerçek veritabanı güvenlik testlerinde ise izinli `SELECT`, yetkisiz tablo/şema, çoklu statement, veri değiştiren CTE, doğrudan `INSERT` ve `chatbot_reader` izinleri kontrol edilir. Bu testler yalnızca CI'ın geçici veritabanında veya açıkça ayrılmış boş bir test veritabanında çalıştırılmalıdır.
