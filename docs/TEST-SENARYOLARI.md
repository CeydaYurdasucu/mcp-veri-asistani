# Test Senaryoları

## Otomatik testler

- Çevrimdışı planlayıcı stok eşiğini sorudan çıkarır.
- Bilinmeyen soruya SQL uydurmaz.
- Tek hücreli sonucu doğal metne çevirir.
- MCP normal `SELECT` ve `WITH` sorgularını kabul eder.
- MCP `DELETE`, çoklu statement, SQL yorumu, sistem kataloğu ve `FOR UPDATE` sorgularını reddeder.

## Manuel kabul testleri

| No | İşlem | Beklenen sonuç |
| --- | --- | --- |
| 1 | `/health` adresini aç | `status: ok`, `mcp: connected`, `databaseStatus: connected` |
| 2 | “Stoku 20'nin altında...” sor | 4 ürün ve stok değerleri görünür |
| 3 | “Kaç ürün var?” sor | `16` cevabı görünür |
| 4 | “Bugün hava nasıl?” sor | Veri şemasıyla cevaplanamayacağı açıklanır |
| 5 | Veri Şeması menüsünü aç | 4 tablo ve sütun tipleri görünür |
| 6 | Backend'i durdur | Bağlantı etiketi kırmızı olur, gönder butonu kapanır |
| 7 | Sayfayı yenile | Sohbet geçmişi korunur |
| 8 | Yeni sohbet'e bas | Geçmiş temizlenir |
| 9 | Swagger'ı aç | Dört endpoint belgelenmiş görünür |

## Güvenlik demosu

MCP testleri güvenli biçimde çalıştırılabilir:

```powershell
cd mcp-server
npm test
```

Testler veri değiştirmez; yalnızca SQL doğrulama fonksiyonunu kontrol eder.
