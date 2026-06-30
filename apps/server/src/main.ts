import path from 'node:path';
import { config } from 'dotenv';

// Load repo root .env when running from apps/server (e.g. pnpm dev from root)
const cwd = process.cwd();
const serverRoot = cwd.endsWith('dist') ? path.resolve(cwd, '..') : cwd;
if (serverRoot.endsWith('server')) {
  config({ path: path.resolve(serverRoot, '../../.env') });
}
config(); // then cwd .env so local overrides win

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import fastifyHelmet from '@fastify/helmet';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module.js';
import { serverEnvSchema } from '@bunker46/config';
import { installProcessGuards } from './common/process-guards.js';

async function bootstrap() {
  // Survive transient relay errors thrown asynchronously by nostr-tools (otherwise a flaky relay
  // can crash the whole bunker); exit on any genuine fault so the container restarts cleanly.
  installProcessGuards();

  const env = serverEnvSchema.parse(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: env.NODE_ENV === 'development',
      trustProxy: env.TRUST_PROXY,
    }),
  );

  await app.getHttpAdapter().getInstance().register(fastifyHelmet);
  await app.getHttpAdapter().getInstance().register(fastifyCookie);

  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Bunker46 API')
      .setDescription('NIP-46 Nsec Bunker Management API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen({ port: env.PORT, host: env.HOST });
  console.warn(`Bunker46 server running on http://${env.HOST}:${env.PORT}`);
}

bootstrap();
