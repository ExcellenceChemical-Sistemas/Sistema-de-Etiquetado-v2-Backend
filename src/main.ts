import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
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

  // La imagen de la vista previa (PNG en base64) que devuelve el agente pesa más que el límite por defecto.
  app.useBodyParser('json', { limit: '10mb' });

  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001', process.env.FRONTEND_URL].filter((o): o is string => !!o),
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();