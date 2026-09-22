import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';

type EstadoPrevia = 'PENDIENTE' | 'PROCESANDO' | 'LISTA' | 'ERROR';

interface Previa {
  creadoPorId: number;
  datos: Record<string, unknown>;
  estado: EstadoPrevia;
  imagen?: string;
  error?: string;
  creada: number;
}

const VIGENCIA_MS = 3 * 60 * 1000;
const MAXIMO = 50;

// Las vistas previas no se guardan en la base: son efímeras. El agente de
// impresión es quien dibuja la etiqueta (sin imprimirla) y devuelve la imagen.
@Injectable()
export class VistaPreviaService {
  private previas = new Map<string, Previa>();

  crear(datos: Record<string, unknown>, creadoPorId: number): string {
    this.purgar();
    if (this.previas.size >= MAXIMO) {
      const masVieja = [...this.previas.entries()].sort((a, b) => a[1].creada - b[1].creada)[0];
      if (masVieja) this.previas.delete(masVieja[0]);
    }
    const id = randomBytes(9).toString('base64url');
    this.previas.set(id, { creadoPorId, datos, estado: 'PENDIENTE', creada: Date.now() });
    return id;
  }

  // Las que el agente todavía no dibujó. Se marcan para no entregarlas dos veces.
  pendientesParaAgente() {
    this.purgar();
    const salida: Record<string, unknown>[] = [];
    for (const [id, p] of this.previas) {
      if (p.estado !== 'PENDIENTE') continue;
      p.estado = 'PROCESANDO';
      salida.push({ id, ...p.datos });
    }
    return salida;
  }

  guardarImagen(id: string, imagenBase64: string) {
    const p = this.previas.get(id);
    if (!p) throw new NotFoundException('La vista previa ya no existe');
    p.estado = 'LISTA';
    p.imagen = imagenBase64;
  }

  guardarError(id: string, mensaje: string) {
    const p = this.previas.get(id);
    if (!p) return;
    p.estado = 'ERROR';
    p.error = mensaje.slice(0, 300);
  }

  obtener(id: string, usuario: { id: number; esAdmin: boolean }) {
    this.purgar();
    const p = this.previas.get(id);
    if (!p) throw new NotFoundException('La vista previa ya no existe');
    if (p.creadoPorId !== usuario.id && !usuario.esAdmin) throw new ForbiddenException();
    return {
      estado: p.estado,
      imagen: p.estado === 'LISTA' ? `data:image/png;base64,${p.imagen}` : null,
      error: p.error ?? null,
    };
  }

  private purgar() {
    const limite = Date.now() - VIGENCIA_MS;
    for (const [id, p] of this.previas) if (p.creada < limite) this.previas.delete(id);
  }
}
