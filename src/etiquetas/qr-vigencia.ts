// Cuánto tiempo después del vencimiento del lote se conserva el enlace del QR
// impreso en una etiqueta, antes de que la página deje de abrir y la limpieza
// diaria borre el trabajo. El margen (no cero) es para no perder trazabilidad
// justo cuando más podría importar: una auditoría o un reclamo de un cliente
// sobre un producto que ya venció.
export const QR_MARGEN_RETENCION_DIAS = Number(process.env.QR_MARGEN_RETENCION_DIAS ?? 365);

// Respaldo para lotes cuya fecha de vencimiento no se pudo parsear
// (fechaVencimientoOrden null — formato raro del COA): sin una fecha de
// vencimiento real de la cual partir, cae al criterio anterior de un plazo
// fijo desde que se imprimió la etiqueta.
export const QR_VIGENCIA_DIAS_FALLBACK = Number(process.env.QR_VIGENCIA_DIAS ?? 730);

interface TrabajoParaVigencia {
  createdAt: Date;
  lote: { fechaVencimientoOrden: Date | null };
}

export function qrVigente(trabajo: TrabajoParaVigencia): boolean {
  const { fechaVencimientoOrden } = trabajo.lote;

  if (fechaVencimientoOrden) {
    const limite = new Date(fechaVencimientoOrden);
    limite.setDate(limite.getDate() + QR_MARGEN_RETENCION_DIAS);
    return new Date() <= limite;
  }

  const limiteFallback = new Date();
  limiteFallback.setDate(limiteFallback.getDate() - QR_VIGENCIA_DIAS_FALLBACK);
  return trabajo.createdAt >= limiteFallback;
}
