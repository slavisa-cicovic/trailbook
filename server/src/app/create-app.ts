import "dotenv/config";
import "reflect-metadata";

import { json, urlencoded } from "express";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";

import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";

function isAllowedDevOrigin(origin: string) {
  return /^http:\/\/(localhost|127\.0\.0\.1):3000$/.test(origin) || /^http:\/\/192\.168\.\d+\.\d+:3000$/.test(origin) || /^http:\/\/10\.\d+\.\d+\.\d+:3000$/.test(origin) || /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+:3000$/.test(origin);
}

function getAllowedOrigins() {
  const configuredOrigins = [
    process.env.WEB_ALLOWED_ORIGIN,
    process.env.WEB_ALLOWED_ORIGINS,
    process.env.WEB_APP_URL,
  ]
    .filter(Boolean)
    .flatMap((value) => value!.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set(configuredOrigins);
}

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const databaseService = app.get(DatabaseService);
  const allowedOrigins = getAllowedOrigins();
  const bodyLimit = process.env.SERVER_BODY_LIMIT || "10mb";

  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.has(origin) || isAllowedDevOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true,
  });
  app.setGlobalPrefix("api/v1");

  await databaseService.enableShutdownHooks(app);
  return app;
}
