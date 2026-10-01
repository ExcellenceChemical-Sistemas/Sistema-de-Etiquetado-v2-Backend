import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export interface PushPayload {
  titulo: string;
  cuerpo: string;
  url?: string;
}

// Envío de Web Push nativo del navegador, para que una alerta llegue aunque el usuario no tenga
// la pestaña de Mensajería abierta. Complementa a Notificacion (que sigue siendo la fuente de
// verdad, visible en la campana) — el push es "mejor esfuerzo": si falla o no hay VAPID
// configurado, la notificación en campana ya quedó guardada igual.
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly habilitado: boolean;

  constructor(private prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    this.habilitado = Boolean(publicKey && privateKey);
    if (this.habilitado) {
      const subject = process.env.VAPID_SUBJECT ?? 'mailto:sistemas@excellencechemical.com';
      webpush.setVapidDetails(subject, publicKey!, privateKey!);
    } else {
      this.logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no configuradas: Web Push deshabilitado');
    }
  }

  vapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY ?? null;
  }

  async suscribir(usuarioId: number, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return this.prisma.suscripcionPush.upsert({
      where: { endpoint: sub.endpoint },
      update: { usuarioId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      create: { usuarioId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
  }

  async desuscribir(usuarioId: number, endpoint: string) {
    await this.prisma.suscripcionPush.deleteMany({ where: { usuarioId, endpoint } });
    return { ok: true };
  }

  // Nunca lanza: un fallo de push no debe tumbar el flujo (cron de alertas, etc.) que ya guardó
  // la Notificacion correspondiente en BD.
  async enviarA(usuarioIds: number[], payload: PushPayload) {
    if (!this.habilitado || !usuarioIds.length) return;

    const suscripciones = await this.prisma.suscripcionPush.findMany({
      where: { usuarioId: { in: usuarioIds } },
    });
    if (!suscripciones.length) return;

    const body = JSON.stringify({
      title: payload.titulo,
      body: payload.cuerpo,
      url: payload.url ?? '/mensajeria',
    });

    await Promise.all(
      suscripciones.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
        } catch (err: any) {
          // 404/410: el navegador invalidó la suscripción (desinstaló, limpió datos de sitio,
          // etc.) — se borra para no seguir intentando contra un endpoint muerto.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await this.prisma.suscripcionPush.deleteMany({ where: { id: s.id } });
          } else {
            this.logger.warn(`Push falló para suscripción ${s.id}: ${err?.message ?? err}`);
          }
        }
      }),
    );
  }
}
