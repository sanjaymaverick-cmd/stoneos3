// Load packages/backend/.env BEFORE anything reads process.env.
//
// This has to be the first statement in the file: PrismaClient reads
// DATABASE_URL when it is constructed, which happens inside
// NestFactory.create() below. Without this the app only ever started when
// every variable was exported on the command line by hand, and failed with a
// bare "Environment variable not found: DATABASE_URL" otherwise.
//
// In production nothing is read from a file — the host supplies real
// environment variables and dotenv simply finds no .env to load.
import * as dotenv from "dotenv";
dotenv.config();

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
