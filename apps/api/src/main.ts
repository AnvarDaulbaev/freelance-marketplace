import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { json, NextFunction, Request, Response, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

const MIN_SECRET_LENGTH = 32;

/** Comma-separated list of origins the browser app is served from. */
function allowedOrigins(): string[] {
  return (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const secret = process.env.JWT_SECRET ?? '';
  if (secret.length < MIN_SECRET_LENGTH || secret.startsWith('change-me')) {
    throw new Error(`JWT_SECRET must be a random string of at least ${MIN_SECRET_LENGTH} characters`);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // Only trust X-Forwarded-For when the API sits behind our own proxy (the
  // Next.js rewrite or nginx). Otherwise clients could spoof their IP and
  // bypass rate limits.
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
  app.use(helmet());
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  // CSRF defence in depth (on top of SameSite=Lax): state-changing requests
  // that carry an Origin header must come from our own web app.
  const origins = allowedOrigins();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (origin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !origins.includes(origin)) {
      res.status(403).json({ statusCode: 403, message: 'origin_not_allowed' });
      return;
    }
    next();
  });

  app.setGlobalPrefix('api');
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 4000));
}
bootstrap();
