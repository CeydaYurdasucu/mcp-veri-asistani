import "dotenv/config";
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: (process.env.FRONTEND_URL ?? "http://localhost:3000").split(","), methods: ["GET", "POST", "PATCH", "DELETE"], allowedHeaders: ["Content-Type", "Authorization"], credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const config = new DocumentBuilder().setTitle("MCP Veri Asistanı API").setDescription("PostgreSQL tabanlı gerçek kullanıcı hesapları, sunucu oturumları, rol bazlı erişim ve denetim kaydıyla doğal dil sorularını MCP üzerinden güvenli sorgulara dönüştürür.").setVersion("3.0").addBearerAuth().addCookieAuth("veriasistan_session").addTag("authentication").addTag("workspace").addTag("chat").addTag("analysis").addTag("access").addTag("system").build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
