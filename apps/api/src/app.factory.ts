import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { requestContextMiddleware } from './common/request-context';
import { env } from './config/env';

/** Shared app setup for main.ts and the e2e tests, so tests exercise the real pipeline. */
export function configureApp(app: INestApplication): INestApplication {
  const config = env();
  // Must be set before anything reads req.ip (request context, rate limits, audit log).
  app.getHttpAdapter().getInstance().set('trust proxy', config.TRUST_PROXY);
  app.use(requestContextMiddleware);
  app.use(helmet());
  app.enableCors({ origin: config.CORS_ORIGINS, credentials: true });
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.enableShutdownHooks();

  const swaggerEnabled = config.SWAGGER_ENABLED
    ? config.SWAGGER_ENABLED === 'true'
    : config.NODE_ENV !== 'production';
  if (swaggerEnabled) setupSwagger(app);
  return app;
}

/** API docs at /docs. Off in production by default: it maps every endpoint for attackers. */
function setupSwagger(app: INestApplication) {
  const document = new DocumentBuilder()
    .setTitle('FitFlow API')
    .setDescription('Gym management SaaS API. Log in via /v1/auth/login, then Authorize.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, document));
}
