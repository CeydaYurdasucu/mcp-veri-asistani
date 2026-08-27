import { ForbiddenException } from "@nestjs/common";
import { AccessControl } from "./access-control";
import { ApplicationStore, hashPassword, verifyPassword } from "./application-store";

describe("kurumsal kimlik güvenliği", () => {
  it("şifreyi geri döndürülemez scrypt özeti olarak saklar", async () => {
    const stored = await hashPassword("Guvenli123");
    expect(stored).not.toContain("Guvenli123");
    await expect(verifyPassword("Guvenli123", stored)).resolves.toBe(true);
    await expect(verifyPassword("Yanlis123", stored)).resolves.toBe(false);
  });

  it("HttpOnly çerezdeki oturum belirtecini sunucuda kullanıcıya çözer", async () => {
    const authenticate = jest.fn().mockResolvedValue({ id: "user-1", name: "Ayşe", email: "ayse@firma.com", title: "", role: "viewer", active: true, createdAt: new Date().toISOString() });
    const access = new AccessControl({ authenticate } as unknown as ApplicationStore);
    const user = await access.authenticate({ cookie: "theme=light; veriasistan_session=opaque-token" });
    expect(authenticate).toHaveBeenCalledWith("opaque-token");
    expect(user.id).toBe("user-1");
  });

  it("görüntüleyicinin serbest analiz isteğini backend katmanında engeller", async () => {
    const authenticate = jest.fn().mockResolvedValue({ id: "user-1", name: "Ayşe", email: "ayse@firma.com", title: "", role: "viewer", active: true, createdAt: new Date().toISOString() });
    const access = new AccessControl({ authenticate } as unknown as ApplicationStore);
    await expect(access.require({ authorization: "Bearer opaque-token" }, "free_chat")).rejects.toBeInstanceOf(ForbiddenException);
  });
});
