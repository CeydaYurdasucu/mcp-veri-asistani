import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ApplicationStore, type ApplicationUser } from "./application-store";

export type AccessRole = "viewer" | "analyst" | "admin";
export type AccessResource = "verified_chat" | "free_chat" | "metrics" | "schema" | "insights" | "audit" | "user_management";
export type UserContext = { id: string; name: string; role: AccessRole };
export type AuthHeaders = { authorization?: string; cookie?: string };

export const rolePermissions: Record<AccessRole, AccessResource[]> = {
  viewer: ["verified_chat", "metrics"],
  analyst: ["verified_chat", "free_chat", "metrics", "schema", "insights"],
  admin: ["verified_chat", "free_chat", "metrics", "schema", "insights", "audit", "user_management"],
};

export const roleLabels: Record<AccessRole, string> = {
  viewer: "Görüntüleyici",
  analyst: "Analist",
  admin: "Yönetici",
};

export class AccessControl {
  constructor(private readonly store: ApplicationStore) {}

  token(headers?: AuthHeaders) {
    const bearer = headers?.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (bearer) return bearer;
    const cookie = headers?.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("veriasistan_session="));
    const value = cookie?.slice("veriasistan_session=".length);
    if (!value) throw new UnauthorizedException("Oturum bulunamadı. Lütfen giriş yap.");
    return decodeURIComponent(value);
  }

  async authenticate(headers?: AuthHeaders): Promise<ApplicationUser> {
    return this.store.authenticate(this.token(headers));
  }

  async require(headers: AuthHeaders | undefined, resource: AccessResource) {
    const user = await this.authenticate(headers);
    if (!rolePermissions[user.role].includes(resource)) {
      throw new ForbiddenException(`${roleLabels[user.role]} rolünün bu işlem için yetkisi yok.`);
    }
    return user;
  }

  sessionPayload(user: ApplicationUser, expiresAt?: string) {
    return {
      user,
      roleLabel: roleLabels[user.role],
      permissions: rolePermissions[user.role],
      expiresAt,
      authentication: "server-session",
    };
  }
}
