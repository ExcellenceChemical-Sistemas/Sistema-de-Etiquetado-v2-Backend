import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ProblemaImpresora {
  codigo: string;
  mensaje: string;
  // Un problema bloqueante impide imprimir (sin papel, sin tinta, tapa abierta...).
  bloqueante: boolean;
}

export interface EstadoImpresora {
  ok: boolean;
  problemas: ProblemaImpresora[];
}

export interface AlertaImpresion {
  tipo: 'AGENTE' | 'COLA' | 'IMPRESORA';
  severidad: 'error' | 'aviso';
  mensaje: string;
}

const AGENTE_TIMEOUT_SEG = Number(process.env.AGENTE_TIMEOUT_SEG ?? 60);
const COLA_ALERTA_MIN = Number(process.env.ALERTA_COLA_MINUTOS ?? 5);

// El agente avisa cada pocos segundos cómo está él y la impresora. Se guarda en
// memoria: si el servidor se reinicia, el siguiente aviso lo repone en segundos.
@Injectable()
export class AgenteEstadoService {
  private ultimoContacto: number | null = null;
  private impresora: EstadoImpresora | null = null;
  private readonly arranque = Date.now();

  constructor(private prisma: PrismaService) {}

  registrar(impresora: unknown) {
    this.ultimoContacto = Date.now();
    this.impresora = this.limpiar(impresora);
  }

  // Lo que manda el agente no se toma tal cual: se recorta y se valida la forma.
  private limpiar(entrada: unknown): EstadoImpresora | null {
    const e = entrada as { problemas?: unknown } | null;
    if (!e || !Array.isArray(e.problemas)) return null;
    const problemas: ProblemaImpresora[] = e.problemas.slice(0, 10).map((p: any) => ({
      codigo: String(p?.codigo ?? 'ERROR').slice(0, 40),
      mensaje: String(p?.mensaje ?? '').slice(0, 200),
      bloqueante: !!p?.bloqueante,
    }));
    return { ok: problemas.length === 0, problemas };
  }

  async obtener() {
    const ahora = Date.now();
    const sinContacto = this.ultimoContacto === null ? null : (ahora - this.ultimoContacto) / 1000;
    // Justo después de arrancar el servidor todavía no hubo tiempo de recibir un aviso.
    const enGracia = this.ultimoContacto === null && (ahora - this.arranque) / 1000 < AGENTE_TIMEOUT_SEG * 1.5;
    const conectado = sinContacto !== null && sinContacto <= AGENTE_TIMEOUT_SEG;

    const [pendientes, masAntiguo] = await Promise.all([
      this.prisma.trabajoImpresion.count({ where: { estado: 'PENDIENTE' } }),
      this.prisma.trabajoImpresion.findFirst({
        where: { estado: 'PENDIENTE' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    const minutosEsperando = masAntiguo ? Math.floor((ahora - masAntiguo.createdAt.getTime()) / 60000) : 0;

    const alertas: AlertaImpresion[] = [];
    if (!conectado && !enGracia) {
      alertas.push({
        tipo: 'AGENTE',
        severidad: 'error',
        mensaje:
          sinContacto === null
            ? 'El agente de impresión no ha reportado. Revisa que esté encendido en la PC de la impresora.'
            : `El agente de impresión no responde desde hace ${this.hace(sinContacto)}. Revisa la PC de la impresora.`,
      });
    }
    if (conectado && this.impresora) {
      for (const p of this.impresora.problemas) {
        alertas.push({ tipo: 'IMPRESORA', severidad: p.bloqueante ? 'error' : 'aviso', mensaje: p.mensaje });
      }
    }
    if (pendientes > 0 && minutosEsperando >= COLA_ALERTA_MIN) {
      alertas.push({
        tipo: 'COLA',
        severidad: 'aviso',
        mensaje: `Hay ${pendientes} etiqueta${pendientes === 1 ? '' : 's'} sin imprimir; la más antigua espera hace ${minutosEsperando} min.`,
      });
    }

    return {
      agenteConectado: conectado,
      ultimoContactoHaceSeg: sinContacto === null ? null : Math.round(sinContacto),
      impresora: conectado ? this.impresora : null,
      pendientes,
      minutosEsperando,
      alertas,
    };
  }

  private hace(seg: number): string {
    if (seg < 90) return `${Math.round(seg)} s`;
    const min = Math.round(seg / 60);
    return min < 90 ? `${min} min` : `${Math.round(min / 60)} h`;
  }
}
