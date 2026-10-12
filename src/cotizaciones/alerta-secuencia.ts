import type { AlertaCotizacion } from './cotizaciones.service';

// Cotización y Pedido son módulos con encargados distintos y cada uno valida el orden de SUS etapas
// (ver orden-etapas.ts), pero nada comparaba una con la otra. Si almacén ya registró el pedido como
// recibido y en la cotización el aviso a almacén se marcó después (o todavía no se marca), el dato
// no es falso: se registró tarde. Por eso esto NUNCA bloquea; solo deja una alerta visible para que
// un supervisor lo interprete (y para no leer un indicador de "tiempo hasta avisar a almacén"
// inflado sin saber por qué). Misma filosofía que las otras alertas de integridad.
const formato = (d: Date) => d.toLocaleString('es-PE', { timeZone: 'America/Lima' });

export function alertaSecuenciaConPedido(
  cotizacion: { avisoAlmacenEn: Date | null },
  pedido: { recibidoEn: Date } | null,
): AlertaCotizacion | null {
  if (!pedido) return null;

  if (!cotizacion.avisoAlmacenEn) {
    return {
      campo: 'avisoAlmacenEn',
      tipo: 'FUERA_DE_SECUENCIA',
      motivo: `almacén ya recibió el pedido (${formato(pedido.recibidoEn)}) y el aviso a almacén sigue sin registrarse`,
    };
  }

  if (pedido.recibidoEn.getTime() < cotizacion.avisoAlmacenEn.getTime()) {
    return {
      campo: 'avisoAlmacenEn',
      tipo: 'FUERA_DE_SECUENCIA',
      motivo: `almacén recibió el pedido (${formato(pedido.recibidoEn)}) antes de que se registrara el aviso a almacén (${formato(cotizacion.avisoAlmacenEn)})`,
    };
  }

  return null;
}