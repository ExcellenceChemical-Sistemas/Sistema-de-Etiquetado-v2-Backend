import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { derivarEstado } from './pedidos.service';

// Cuánto tiempo después de la entrega sigue abriendo el enlace de seguimiento.
// Un pedido que aún no se entregó se ve siempre.
export const SEGUIMIENTO_DIAS_TRAS_ENTREGA = Number(process.env.SEGUIMIENTO_DIAS_TRAS_ENTREGA ?? 90);

export function seguimientoVigente(entregadoEn: Date | null, ahora = new Date()): boolean {
  if (!entregadoEn) return true;
  const limite = new Date(entregadoEn);
  limite.setDate(limite.getDate() + SEGUIMIENTO_DIAS_TRAS_ENTREGA);
  return ahora <= limite;
}

@Injectable()
export class PedidosPublicosService {
  constructor(private readonly prisma: PrismaService) {}

  // Sin autenticación: la única credencial es el token del enlace. Por eso el `select`
  // es una lista cerrada de lo que el cliente puede ver; nunca se devuelve el pedido
  // entero (ni cliente, ni quién lo creó, ni la observación, ni ids internos).
  async obtener(token: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { tokenSeguimiento: token },
      select: {
        numeroProforma: true,
        recibidoEn: true,
        inicioPreparacionEn: true,
        preparadoEn: true,
        salioEn: true,
        entregadoEn: true,
      },
    });
    // Mismo 404 si no existe o si ya caducó: desde afuera no se distingue.
    if (!pedido || !seguimientoVigente(pedido.entregadoEn)) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return { ...pedido, estado: derivarEstado(pedido) };
  }
}
