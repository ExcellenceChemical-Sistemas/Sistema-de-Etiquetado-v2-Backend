// src/carpetas/carpetas.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccesoDocumentosService } from './acceso-documentos.service';
import { TipoCarpeta } from '../generated/prisma';

type UsuarioReq = { id: number; esAdmin: boolean };

@Injectable()
export class CarpetasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accesoDocumentos: AccesoDocumentosService,
  ) {}

  /** Carpetas raíz (carpetaPadreId = null), filtradas: solo módulos a los que el usuario tiene algún acceso. */
  async listarRaices(usuario: UsuarioReq) {
    const raices = await this.prisma.carpeta.findMany({
      where: { carpetaPadreId: null },
      orderBy: { nombre: 'asc' },
    });

    const visibles = await Promise.all(
      raices.map(async (r) => ({
        raiz: r,
        visible: await this.accesoDocumentos.tieneAccesoModulo(usuario, r.modulo),
      })),
    );

    return visibles.filter((v) => v.visible).map((v) => v.raiz);
  }

  /**
   * Contenido de una carpeta: subcarpetas + archivos directos.
   * Las subcarpetas se filtran por acceso real (ej. procesos de KPIS que el
   * usuario no tiene, o "Obsoleto" si no tiene edición total de ISO no aparecen).
   * El acceso a la carpeta pedida (`carpetaId`) ya fue validado por el guard.
   */
  async listarContenido(carpetaId: number, usuario: UsuarioReq) {
    const carpeta = await this.prisma.carpeta.findUnique({ where: { id: carpetaId } });
    if (!carpeta) throw new NotFoundException('Carpeta no encontrada');

    const [subcarpetas, archivos] = await Promise.all([
      this.prisma.carpeta.findMany({
        where: { carpetaPadreId: carpetaId },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.archivo.findMany({
        where: { carpetaId },
        orderBy: { nombre: 'asc' },
      }),
    ]);

    const [subcarpetasVisibles, archivosVisibles] = await Promise.all([
      Promise.all(
        subcarpetas.map(async (s) => ({
          carpeta: s,
          visible: await this.accesoDocumentos.puedeVer(usuario, s.id),
        })),
      ),
      // §1.1 punto 2: en ISO un Word/Excel/PowerPoint no se lista para quien
      // solo tiene puedeVer — puedeVerArchivo aplica la regla por tipo.
      Promise.all(
        archivos.map(async (a) => ({
          archivo: a,
          visible: await this.accesoDocumentos.puedeVerArchivo(usuario, a.id),
        })),
      ),
    ]);

    return {
      carpeta,
      subcarpetas: subcarpetasVisibles.filter((s) => s.visible).map((s) => s.carpeta),
      archivos: archivosVisibles.filter((a) => a.visible).map((a) => a.archivo),
    };
  }

  /** Ruta completa desde la raíz hasta esta carpeta (para el breadcrumb del explorador). */
  async obtenerRuta(carpetaId: number) {
    // `tipo` viaja para que el breadcrumb pueda detectar que una carpeta está
    // anidada dentro de Obsoleto: la anidada tiene `tipo: null`, así que la
    // única pista está en sus ancestros (uno con tipo OBSOLETO en la ruta).
    const ruta: { id: number; nombre: string; tipo: TipoCarpeta | null }[] = [];
    let actualId: number | null = carpetaId;

    while (actualId !== null) {
      const carpeta = await this.prisma.carpeta.findUnique({
        where: { id: actualId },
        select: { id: true, nombre: true, tipo: true, carpetaPadreId: true },
      });
      if (!carpeta) throw new NotFoundException('Carpeta no encontrada');
      ruta.unshift({ id: carpeta.id, nombre: carpeta.nombre, tipo: carpeta.tipo });
      actualId = carpeta.carpetaPadreId;
    }

    return ruta;
  }
}