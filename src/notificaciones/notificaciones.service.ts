import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { armarCorreoPedido, type EtapaAviso } from './correo-pedido';

/** Lo mínimo del pedido (antes y después de un cambio) para decidir si hay que avisar. */
export interface PedidoParaAviso {
  id: number;
  numeroProforma: string;
  tokenSeguimiento: string;
  salioEn: Date | null;
  entregadoEn: Date | null;
  avisoSalioEnviadoEn: Date | null;
  avisoEntregadoEnviadoEn: Date | null;
  categoriaObservacion: string | null;
  cliente: { email: string | null };
}

/**
 * Qué etapas hay que avisar al cliente tras un cambio de pedido.
 *
 * Solo cuenta MARCAR una etapa (antes sin fecha, ahora con fecha): corregir la fecha de
 * una etapa ya marcada no vuelve a avisar. Tampoco se avisa dos veces la misma etapa, ni
 * de un pedido cancelado. Si se marcan las dos a la vez, solo se avisa la entrega: mandar
 * "salió" y "entregado" juntos sería ruido.
 */
export function etapasParaAvisar(antes: PedidoParaAviso, despues: PedidoParaAviso): EtapaAviso[] {
  if (despues.categoriaObservacion === 'CANCELADO') return [];
  const salio = !antes.salioEn && !!despues.salioEn && !despues.avisoSalioEnviadoEn;
  const entregado = !antes.entregadoEn && !!despues.entregadoEn && !despues.avisoEntregadoEnviadoEn;
  if (entregado) return ['ENTREGADO'];
  if (salio) return ['SALIO'];
  return [];
}

const CAMPO_AVISO = {
  SALIO: 'avisoSalioEnviadoEn',
  ENTREGADO: 'avisoEntregadoEnviadoEn',
} as const;

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Sin clave o sin remitente el envío queda apagado: el sistema funciona igual. */
  configurado(): boolean {
    return !!process.env.RESEND_API_KEY && !!process.env.MAIL_REMITENTE;
  }

  /**
   * Envía un correo por la API de Resend (HTTP, no SMTP: Render Free bloquea SMTP).
   * Lanza si falla; quien llama decide qué hacer.
   */
  async enviarCorreo(p: { para: string; asunto: string; texto: string; html: string; idempotencia?: string }) {
    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        // Si el mismo aviso se reintenta, Resend no lo manda dos veces.
        ...(p.idempotencia && { 'Idempotency-Key': p.idempotencia }),
      },
      body: JSON.stringify({
        from: process.env.MAIL_REMITENTE,
        to: [p.para],
        subject: p.asunto,
        text: p.texto,
        html: p.html,
        ...(process.env.MAIL_RESPONDER_A && { reply_to: process.env.MAIL_RESPONDER_A }),
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!respuesta.ok) {
      const detalle = (await respuesta.text().catch(() => '')).slice(0, 200);
      throw new Error(`Resend respondió ${respuesta.status}: ${detalle}`);
    }
  }

  /**
   * Avisa al cliente si el cambio del pedido lo amerita. NUNCA lanza: un problema de correo
   * no debe romper el cambio de etapa que hizo la persona (a lo sumo lo demora hasta 5 s,
   * el tope del envío). Devuelve true solo si el correo salió.
   */
  async avisarPedido(antes: PedidoParaAviso, despues: PedidoParaAviso): Promise<boolean> {
    try {
      const etapas = etapasParaAvisar(antes, despues);
      if (etapas.length === 0) return false;
      const etapa = etapas[0]!;

      const email = despues.cliente.email?.trim();
      if (!email) return false; // sin correo no se avisa, y no es un error
      if (!this.configurado()) {
        this.logger.warn(`Aviso de pedido ${despues.id} (${etapa}) omitido: falta RESEND_API_KEY o MAIL_REMITENTE`);
        return false;
      }
      if (!process.env.FRONTEND_URL) {
        this.logger.warn(`Aviso de pedido ${despues.id} (${etapa}) omitido: falta FRONTEND_URL`);
        return false;
      }

      // Se reserva el aviso ANTES de enviar: si dos cambios llegan a la vez, solo uno gana
      // (updateMany devuelve 0 para el segundo) y el cliente no recibe el correo repetido.
      const campo = CAMPO_AVISO[etapa];
      const reservado = await this.prisma.pedido.updateMany({
        where: { id: despues.id, [campo]: null },
        data: { [campo]: new Date() },
      });
      if (reservado.count === 0) return false;

      const correo = armarCorreoPedido({
        etapa,
        proforma: despues.numeroProforma,
        enlace: `${process.env.FRONTEND_URL.replace(/\/+$/, '')}/p/${despues.tokenSeguimiento}`,
      });
      try {
        await this.enviarCorreo({
          para: email,
          asunto: correo.asunto,
          texto: correo.texto,
          html: correo.html,
          idempotencia: `pedido-${despues.id}-${etapa}`,
        });
        this.logger.log(`Aviso ${etapa} enviado para el pedido ${despues.id}`);
        return true;
      } catch (error) {
        // No se envió: se libera la reserva para que quede como "sin avisar" y se pueda ver/reintentar.
        await this.prisma.pedido.updateMany({ where: { id: despues.id }, data: { [campo]: null } });
        throw error;
      }
    } catch (error) {
      this.logger.error(`No se pudo avisar del pedido ${despues.id}: ${(error as Error).message}`);
      return false;
    }
  }
}
