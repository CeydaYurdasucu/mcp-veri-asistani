import { createOfflinePlan, summarizeRows } from "./query-planner";
describe("çevrimdışı sorgu planlayıcı", () => {
  it("stok eşiğini sorudan alır", () => { expect(createOfflinePlan("Stoku 10'un altında olanlar")?.sql).toContain("stock < 10"); });
  it("müşteri sayısını planlar", () => { expect(createOfflinePlan("Kaç müşterimiz var?")?.sql).toContain("COUNT(*)"); });
  it("bilinmeyen soruya plan uydurmaz", () => { expect(createOfflinePlan("Bugün hava nasıl?")).toBeNull(); });
  it("tek hücrelik sonucu doğal cevaplar", () => { const plan = createOfflinePlan("Kaç ürün var?")!; expect(summarizeRows(plan, [{ urun_sayisi: 8 }])).toContain("8"); });
});
