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
      tieneCoa: !!t.lote.coaUrl,
      tieneFds: !!t.lote.producto.fichaSeguridadUrl,
      pictogramasGhs: t.lote.producto.pictogramasGhs,
      palabraAdvertencia: t.lote.producto.palabraAdvertencia,
      frasesH: t.lote.producto.frasesH,
      frasesP: t.lote.producto.frasesP,
      // Línea de tiempo: solo hechos que ya están en la etiqueta o en el sistema,
      // sin nombres de personas (endpoint sin autenticación).
      etiquetadoEn: t.createdAt,
      impreso: t.estado === 'IMPRESO',
    };
  }

  async obtenerUrlCoa(token: string, descargar: boolean) {
    const t = await this.buscarPorToken(token);
    if (!t.lote.coaUrl) throw new NotFoundException('Este lote no tiene COA cargado');
    const url = await this.storage.getSignedUrl(t.lote.coaUrl, 300, descargar);
    return { url };
  }

  async obtenerUrlFds(token: string, descargar: boolean) {
    const t = await this.buscarPorToken(token);
    const path = t.lote.producto.fichaSeguridadUrl;
    if (!path) throw new NotFoundException('Este producto no tiene ficha de seguridad');
    const url = await this.storage.getSignedUrl(path, 300, descargar);
    return { url };
  }
}
