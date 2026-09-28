import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');

  // Detrás del proxy de Render, sin esto req.ip es la IP del proxy y el límite de
  // peticiones (ThrottlerGuard) sería compartido por todos los clientes. Un salto de confianza.
  app.set('trust proxy', 1);

  // Cabeceras de seguridad. La API solo sirve JSON; el frontend (otro origen) la consume
  // por fetch/CORS, así que se permite el uso entre orígenes de sus recursos.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Solo la imagen de la vista previa (PNG en base64) que devuelve el agente pesa más que el
  // límite por defecto; ese cuerpo grande se admite únicamente en esa ruta. El resto de la
  // API queda con el límite normal (100 kb), porque el límite alto no debe estar disponible
  // para cualquiera que pueda llegar a cualquier endpoint.
  app.use(/^\/api\/etiquetas\/vista-previa\/[^/]+\/imagen\/?$/, json({ limit: '10mb' }));
  // Va después de la ruta grande: el primer parser que lee el cuerpo es el que manda.
  app.useBodyParser('json', { limit: '100kb' });

  // FRONTEND_URLS acepta varios orígenes separados por coma (útil durante una migración de
  // hosting, cuando el frontend vive temporalmente en dos dominios a la vez). FRONTEND_URL
  // (singular) se mantiene por compatibilidad con la configuración actual de Render.
  const origenesFrontend = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen.length > 0);

  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001', ...origenesFrontend],
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();