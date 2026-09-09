import { ForbiddenException } from "@nestjs/common";
import { Pool } from "pg";
import { AccessControl } from "./access-control";
import { ApplicationStore } from "./application-store";

const integrationUrl = process.env.INTEGRATION_APP_DATABASE_URL;
const describeIntegration = integrationUrl ? describe : describe.skip;

describeIntegration("gerçek PostgreSQL kimlik ve RBAC entegrasyonu", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminEmail = `integration-admin-${suffix}@example.test`;
  const viewerEmail = `integration-viewer-${suffix}@example.test`;
  const password = "Integration123!";
  const store = new ApplicationStore();
  const cleanupPool = new Pool({ connectionString: integrationUrl });
  let adminToken = "";
  let viewerToken = "";

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = integrationUrl;
    const existing = await cleanupPool.query("SELECT COUNT(*)::int AS count FROM app_identity.users");
    if (Number(existing.rows[0]?.count ?? 0) !== 0) {
      throw new Error("Entegrasyon testi yalnızca boş ve geçici bir app_identity veritabanında çalıştırılmalıdır.");
    }

    const admin = await store.register("Integration Admin", adminEmail, password);
    const viewer = await store.register("Integration Viewer", viewerEmail, password);
    expect(admin.user.role).toBe("admin");
    expect(viewer.user.role).toBe("viewer");
    adminToken = admin.token;
    viewerToken = viewer.token;
  });

  afterAll(async () => {
    await cleanupPool.query("DELETE FROM app_identity.users WHERE email = ANY($1::text[])", [[adminEmail, viewerEmail]]);
    await cleanupPool.end();
    await store.close();
  });

  it("ilk kayıt yönetici, sonraki kayıt görüntüleyici olur", () => {
    expect(adminToken).toEqual(expect.any(String));
    expect(viewerToken).toEqual(expect.any(String));
  });

  it("görüntüleyicinin serbest sorgu yetkisini gerçek oturum rolüyle engeller", async () => {
    const access = new AccessControl(store);
    await expect(access.require({ authorization: `Bearer ${viewerToken}` }, "free_chat"))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(access.require({ authorization: `Bearer ${viewerToken}` }, "verified_chat"))
      .resolves.toMatchObject({ email: viewerEmail, role: "viewer" });
  });

  it("yönetici oturumu kullanıcı yönetimi yetkisine erişir", async () => {
    const access = new AccessControl(store);
    await expect(access.require({ authorization: `Bearer ${adminToken}` }, "user_management"))
      .resolves.toMatchObject({ email: adminEmail, role: "admin" });
  });
});
