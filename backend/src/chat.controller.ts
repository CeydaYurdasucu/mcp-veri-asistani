import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from "class-validator";
import type { AccessRole, AuthHeaders } from "./access-control";
import { ChatService } from "./chat.service";

type CookieResponse = {
  cookie: (name: string, value: string, options: { httpOnly: boolean; sameSite: "strict"; secure: boolean; path: string; maxAge: number }) => void;
  clearCookie: (name: string, options: { httpOnly: boolean; sameSite: "strict"; path: string }) => void;
};

class RegisterDto {
  @ApiProperty({ example: "Nehir Tok", minLength: 2, maxLength: 80 })
  @IsString() @MinLength(2) @MaxLength(80) name!: string;

  @ApiProperty({ example: "nehir@firma.com", maxLength: 180 })
  @IsEmail() @MaxLength(180) email!: string;

  @ApiProperty({ minLength: 8, maxLength: 72, description: "En az bir küçük harf, büyük harf ve rakam" })
  @IsString() @MinLength(8) @MaxLength(72)
  @Matches(/^(?=.*[a-zçğıöşü])(?=.*[A-ZÇĞİÖŞÜ])(?=.*\d).+$/, { message: "Şifre en az bir küçük harf, büyük harf ve rakam içermelidir." })
  password!: string;
}

class LoginDto {
  @ApiProperty({ example: "nehir@firma.com" }) @IsEmail() @MaxLength(180) email!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(72) password!: string;
}

class ProfileDto {
  @ApiProperty({ example: "Nehir Tok" }) @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @ApiProperty({ example: "Veri Analisti" }) @IsString() @MaxLength(80) title!: string;
}

class UserAccessDto {
  @ApiProperty({ enum: ["viewer", "analyst", "admin"] }) @IsIn(["viewer", "analyst", "admin"]) role!: AccessRole;
  @ApiProperty() @IsBoolean() active!: boolean;
}

class FavoriteDto {
  @ApiProperty({ example: "Bu ayın toplam cirosu ne kadar?" }) @IsString() @MinLength(2) @MaxLength(500) question!: string;
}

class ChatHistoryDto {
  @ApiProperty({ enum: ["user", "assistant"] }) @IsIn(["user", "assistant"]) role!: "user" | "assistant";
  @ApiProperty({ maxLength: 3000 }) @IsString() @MinLength(1) @MaxLength(3000) content!: string;
}

class ChatDto {
  @ApiProperty({ example: "Stoku 20'nin altında olan ürünler hangileri?", minLength: 2, maxLength: 500 })
  @IsString() @MinLength(2) @MaxLength(500) question!: string;

  @ApiPropertyOptional({ description: "Kullanıcının kendisine ait sohbet kimliği" })
  @IsOptional() @IsUUID() conversationId?: string;

  @ApiPropertyOptional({ type: [ChatHistoryDto], description: "conversationId verilmezse geriye dönük uyumluluk için son mesajlar" })
  @IsOptional() @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => ChatHistoryDto)
  history: ChatHistoryDto[] = [];
}

@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  private auth(authorization?: string, cookie?: string): AuthHeaders { return { authorization, cookie }; }
  private sessionCookie(response: CookieResponse, token: string) {
    response.cookie("veriasistan_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 12 * 60 * 60 * 1000,
    });
  }

  @ApiTags("system") @ApiOperation({ summary: "API, MCP ve PostgreSQL bağlantısını kontrol eder" })
  @Get("health") health() { return this.chat.health(); }

  @ApiTags("authentication") @ApiOperation({ summary: "Gerçek kullanıcı hesabı oluşturur; ilk hesap kurucu yöneticidir" })
  @ApiBody({ type: RegisterDto }) @Post("auth/register")
  async register(@Body() body: RegisterDto, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.chat.register(body.name, body.email, body.password);
    this.sessionCookie(response, result.token);
    return { ...result.payload, firstOrganizationAdmin: result.firstOrganizationAdmin };
  }

  @ApiTags("authentication") @ApiOperation({ summary: "E-posta ve şifreyle güvenli oturum açar" })
  @ApiBody({ type: LoginDto }) @Post("auth/login")
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.chat.login(body.email, body.password);
    this.sessionCookie(response, result.token);
    return result.payload;
  }

  @ApiTags("authentication") @ApiCookieAuth("veriasistan_session") @ApiBearerAuth()
  @ApiOperation({ summary: "Geçerli oturumdaki kullanıcıyı ve izinlerini döndürür" }) @Get("auth/me")
  me(@Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) { return this.chat.me(this.auth(authorization, cookie)); }

  @ApiTags("authentication") @ApiCookieAuth("veriasistan_session") @ApiOperation({ summary: "Oturumu sunucuda iptal eder" })
  @Post("auth/logout") async logout(@Res({ passthrough: true }) response: CookieResponse, @Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) {
    response.clearCookie("veriasistan_session", { httpOnly: true, sameSite: "strict", path: "/" });
    return this.chat.logout(this.auth(authorization, cookie));
  }

  @ApiTags("authentication") @ApiCookieAuth("veriasistan_session") @ApiOperation({ summary: "Kullanıcının adını ve unvanını günceller; rolü değiştirmez" })
  @Patch("auth/profile") updateProfile(@Body() body: ProfileDto, @Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) {
    return this.chat.updateProfile(body.name, body.title, this.auth(authorization, cookie));
  }

  @ApiTags("workspace") @ApiCookieAuth("veriasistan_session") @Get("conversations")
  conversations(@Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) { return this.chat.conversations(this.auth(authorization, cookie)); }

  @ApiTags("workspace") @ApiCookieAuth("veriasistan_session") @Post("conversations")
  createConversation(@Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) { return this.chat.createConversation(this.auth(authorization, cookie)); }

  @ApiTags("workspace") @ApiCookieAuth("veriasistan_session") @Delete("conversations/:id")
  deleteConversation(@Param("id", new ParseUUIDPipe()) id: string, @Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) { return this.chat.deleteConversation(id, this.auth(authorization, cookie)); }

  @ApiTags("workspace") @ApiCookieAuth("veriasistan_session") @Get("favorites")
  favorites(@Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) { return this.chat.favorites(this.auth(authorization, cookie)); }

  @ApiTags("workspace") @ApiCookieAuth("veriasistan_session") @Post("favorites")
  addFavorite(@Body() body: FavoriteDto, @Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) { return this.chat.addFavorite(body.question, this.auth(authorization, cookie)); }

  @ApiTags("workspace") @ApiCookieAuth("veriasistan_session") @Delete("favorites/:id")
  deleteFavorite(@Param("id", new ParseUUIDPipe()) id: string, @Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) { return this.chat.deleteFavorite(id, this.auth(authorization, cookie)); }

  @ApiTags("access") @ApiCookieAuth("veriasistan_session") @ApiOperation({ summary: "Kullanıcıları listeler (yalnızca yönetici)" })
  @Get("users") users(@Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) { return this.chat.users(this.auth(authorization, cookie)); }

  @ApiTags("access") @ApiCookieAuth("veriasistan_session") @ApiOperation({ summary: "Kullanıcı rolünü veya aktifliğini değiştirir (yalnızca yönetici)" })
  @Patch("users/:id/access") updateUserAccess(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: UserAccessDto, @Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) {
    return this.chat.updateUserAccess(id, body.role, body.active, this.auth(authorization, cookie));
  }

  @ApiTags("system") @ApiCookieAuth("veriasistan_session") @ApiOperation({ summary: "İzin verilen veritabanı şemasını döndürür" })
  @Get("schema") schema(@Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) { return this.chat.schema(this.auth(authorization, cookie)); }

  @ApiTags("system") @ApiOperation({ summary: "Chatbot yeteneklerini ve sınırlarını döndürür" })
  @Get("capabilities") capabilities() { return this.chat.capabilities(); }

  @ApiTags("analysis") @ApiCookieAuth("veriasistan_session") @ApiOperation({ summary: "Kurumsal veri sözlüğünü ve doğrulanmış metrikleri döndürür" })
  @Get("metrics") metrics(@Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) { return this.chat.metrics(this.auth(authorization, cookie)); }

  @ApiTags("analysis") @ApiCookieAuth("veriasistan_session") @ApiOperation({ summary: "MCP üzerinden iş risklerini ve önerilen aksiyonları döndürür" })
  @Get("insights") insights(@Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) { return this.chat.insights(this.auth(authorization, cookie)); }

  @ApiTags("access") @ApiCookieAuth("veriasistan_session") @ApiOperation({ summary: "Son denetim ve erişim kayıtlarını döndürür (yalnızca yönetici)" })
  @Get("audit") audit(@Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) { return this.chat.audit(this.auth(authorization, cookie)); }

  @ApiTags("chat") @ApiCookieAuth("veriasistan_session") @ApiOperation({ summary: "Doğal dildeki soruyu kullanıcıya özel sohbet bağlamıyla cevaplar" })
  @ApiBody({ type: ChatDto }) @ApiResponse({ status: 201, description: "Cevap, SQL, sonuç satırları ve kalıcı mesaj kayıtları" })
  @Post("chat") ask(@Body() body: ChatDto, @Headers("authorization") authorization?: string, @Headers("cookie") cookie?: string) {
    return this.chat.ask(body.question, body.history, this.auth(authorization, cookie), body.conversationId);
  }
}
