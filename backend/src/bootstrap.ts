import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/exception.filter';
import { env } from './config/env';
import { LocalStorageService, StorageService } from './storage/storage.service';

/** Aplatis les erreurs de validation : { champ: message }, pour l'affichage dans les formulaires. */
function flatten(errors: ValidationError[], parent = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors) {
    const path = parent ? `${parent}.${e.property}` : e.property;
    if (e.constraints) {
      const msgs = Object.values(e.constraints);
      out[path] = msgs[msgs.length - 1].includes('should not exist') ? 'Champ non autorisé.' : msgs[msgs.length - 1];
    }
    if (e.children?.length) Object.assign(out, flatten(e.children, path));
  }
  return out;
}

export async function createApp(): Promise<NestExpressApplication> {
  const e = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: e.isTest ? ['error'] : ['log', 'warn', 'error'],
    bodyParser: false,
  });

  app.set('trust proxy', e.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '200kb' });
  app.useBodyParser('urlencoded', { limit: '50kb', extended: false });
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || e.corsOrigins.includes(origin.replace(/\/$/, ''))),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    maxAge: 600,
  });

  app.setGlobalPrefix('api/v1', { exclude: ['media/(.*)'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const fields = flatten(errors);
        const first = Object.values(fields)[0] ?? 'Certaines informations sont invalides.';
        return new BadRequestException({ message: first, errors: fields });
      },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // Stockage local (développement) : fichiers servis sans exécution possible.
  const storage = app.get(StorageService);
  if (storage instanceof LocalStorageService) {
    app.use(
      '/media',
      express.static(storage.root, {
        fallthrough: true,
        index: false,
        dotfiles: 'deny',
        maxAge: '7d',
        setHeaders: (res) => {
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        },
      }),
      // Fichier absent (supprimé, jamais traité) : 404 simple, sans passer par le gestionnaire d'erreurs.
      (_req: express.Request, res: express.Response) => res.status(404).end(),
    );
  }

  if (!e.isProd || process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('TogoMobile API')
      .setDescription('API REST de la marketplace TogoMobile. Authentification par cookie de session httpOnly.')
      .setVersion('1.0')
      .addCookieAuth(e.cookieName)
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  app.enableShutdownHooks();
  return app;
}
