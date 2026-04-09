import "dotenv/config";
import "reflect-metadata";

import cookieParser from "cookie-parser";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";

import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  const databaseService = app.get(DatabaseService);

  app.use(cookieParser());
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await databaseService.enableShutdownHooks(app);
  return app;
}
