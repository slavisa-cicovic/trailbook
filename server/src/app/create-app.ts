import "dotenv/config";
import "reflect-metadata";

import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { raw, urlencoded } from "express";
import type { NextFunction, Request, Response } from "express";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";

import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";

const gunzipAsync = promisify(gunzip);

type RequestWithParsedBody = Request & {
  __trailbookBodyParsed?: boolean;
};

function parseBodyLimitBytes(limit: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(limit.trim());
  if (!match) return 50 * 1024 * 1024;

  const value = Number(match[1]);
  const unit = (match[2] ?? "b").toLowerCase();
  const multiplier =
    unit === "gb" ? 1024 * 1024 * 1024 :
    unit === "mb" ? 1024 * 1024 :
    unit === "kb" ? 1024 :
    1;

  return Math.floor(value * multiplier);
}

function isGzipBuffer(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

function jsonBodyParser(limit: string) {
  const limitBytes = parseBodyLimitBytes(limit);
  const rawJsonParser = raw({
    limit,
    type: ["application/json", "application/*+json"],
  });

  return (request: RequestWithParsedBody, response: Response, next: NextFunction) => {
    rawJsonParser(request, response, async (error) => {
      if (error) {
        next(error);
        return;
      }

      if (!Buffer.isBuffer(request.body)) {
        next();
        return;
      }

      try {
        const bodyBuffer = request.body;
        if (bodyBuffer.byteLength === 0) {
          request.body = {};
          request.__trailbookBodyParsed = true;
          next();
          return;
        }

        // express.raw inflates gzip bodies by default, but some clients/proxies
        // can still pass compressed bytes through. Trust the actual bytes, not
        // only Content-Encoding, to avoid double-gunzip on already inflated JSON.
        const shouldGunzip = isGzipBuffer(bodyBuffer);
        const jsonBuffer = shouldGunzip ? await gunzipAsync(bodyBuffer) : bodyBuffer;

        if (jsonBuffer.byteLength > limitBytes) {
          response.status(413).json({ message: "Request body too large" });
          return;
        }

        request.body = JSON.parse(jsonBuffer.toString("utf8"));
        request.__trailbookBodyParsed = true;
        delete request.headers["content-encoding"];
        next();
      } catch {
        response.status(400).json({ message: "Invalid JSON request body" });
      }
    });
  };
}

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
  const bodyLimit = process.env.SERVER_BODY_LIMIT || "50mb";
  const urlencodedParser = urlencoded({ extended: true, limit: bodyLimit });

  app.use(jsonBodyParser(bodyLimit));
  app.use((request: RequestWithParsedBody, response: Response, next: NextFunction) => {
    if (request.__trailbookBodyParsed) {
      next();
      return;
    }

    urlencodedParser(request, response, next);
  });
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
