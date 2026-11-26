import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { configureApp } from './app.factory';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const config = env(); // validate configuration before anything else
  // configureApp also applies TRUST_PROXY, so req.ip is the real client behind the web proxy/LB.
  const app = configureApp(await NestFactory.create(AppModule));
  await app.listen(config.API_PORT);
  Logger.log(`API on http://localhost:${config.API_PORT}  (docs: /docs)`, 'Bootstrap');
}

void bootstrap();
