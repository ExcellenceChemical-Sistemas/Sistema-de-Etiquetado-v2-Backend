import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { limiteVigenciaQr } from './qr-vigencia';

@Injectable()
export class EtiquetasPublicasService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
  ) {}

  private async buscarPorToken(token: string) {
    const trabajo = await this.prisma.trabajoImpresion.findUnique({
      where: { token },
      include: { lote: { include: { producto: true, fabricante: true } } },
    });
    // 404 tanto si el token no existe, como si el trabajo nunca llegó a
    // imprimirse o si el enlace ya caducó: desde afuera no se distingue.
    if (!trabajo || trabajo.estado === 'ERROR' || trabajo.createdAt < limiteVigenciaQr()) {
      throw new NotFoundException('Etiqueta no encontrada');
    }
    return trabajo;
  }

  // Solo lo que se ve en la etiqueta impresa; nada de ids internos ni de quién
  // la creó, porque este endpoint no tiene autenticación.
  async obtener(token: string) {
    const t = await this.buscarPorToken(token);
    return {
      producto: t.lote.producto.nombre,
      numeroLote: t.lote.numeroLote,
      fabricante: t.lote.fabricante.nombre,
      fechaFabricacion: t.lote.fechaFabricacion,
      fechaVencimiento: t.lote.fechaVencimiento,
      cantidadNeta: t.cantidadNeta,
      unidadNeta: t.unidadNeta,
      pesoBruto: t.pesoBruto,
      unidadBruto: t.unidadBruto,
      tara: t.tara,
      envaseNumero: t.envaseNumero,
      envaseTotal: t.envaseTotal,
      tieneCoa: !!t.lote.coaUrl,
    };
  }

  async obtenerUrlCoa(token: string, descargar: boolean) {
    const t = await this.buscarPorToken(token);
    if (!t.lote.coaUrl) throw new NotFoundException('Este lote no tiene COA cargado');
    const url = await this.storage.getSignedUrl(t.lote.coaUrl, 300, descargar);
    return { url };
  }
}
