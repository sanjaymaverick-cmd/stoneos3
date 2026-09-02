import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { rateLimit, securityHeaders } from "./common/http-security";
import { parseFrontendOrigins } from "./common/cors";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // One proxy hop, so req.ip is the real client rather than the proxy — the
  // rate limiter buckets on it.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.enableCors({ origin: parseFrontendOrigins(process.env.FRONTEND_URL) });
  app.use(securityHeaders);
  app.use(rateLimit);
  // NOTE: ston3gpt also installs a global ValidationPipe here with
  // { whitelist: true, forbidNonWhitelisted: true }. It is deliberately NOT
  // ported: this codebase has no decorated DTO classes, so that pipe would
  // strip every request body and then reject it as non-whitelisted. It comes
  // in with the DTO layer, not before.
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
