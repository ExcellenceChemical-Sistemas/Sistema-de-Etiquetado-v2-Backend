import { QR_MARGEN_RETENCION_DIAS, QR_VIGENCIA_DIAS_FALLBACK, qrVigente } from './qr-vigencia';

const DIA_MS = 24 * 60 * 60 * 1000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA_MS);

describe('qrVigente — con fecha de vencimiento del lote', () => {
  it('un lote que aún no vence tiene el QR vigente', () => {
    const lote = { fechaVencimientoOrden: hace(-30) };
    expect(qrVigente({ createdAt: hace(1), lote })).toBe(true);
  });

  it('sigue vigente dentro del margen de retención después de vencer', () => {
    const lote = { fechaVencimientoOrden: hace(QR_MARGEN_RETENCION_DIAS - 5) };
    expect(qrVigente({ createdAt: hace(1000), lote })).toBe(true);
  });

  it('deja de ser vigente una vez pasado el margen', () => {
    const lote = { fechaVencimientoOrden: hace(QR_MARGEN_RETENCION_DIAS + 5) };
    expect(qrVigente({ createdAt: hace(1), lote })).toBe(false);
  });

  it('la vigencia depende del vencimiento del lote, no de cuándo se imprimió', () => {
    const lote = { fechaVencimientoOrden: hace(-100) };
    // impresa hace mucho más que el plazo de respaldo, pero el lote no vence todavía
    expect(qrVigente({ createdAt: hace(QR_VIGENCIA_DIAS_FALLBACK + 500), lote })).toBe(true);
  });
});

describe('qrVigente — lote sin fecha de vencimiento parseable', () => {
  const lote = { fechaVencimientoOrden: null };

  it('cae al plazo fijo desde la impresión: reciente = vigente', () => {
    expect(qrVigente({ createdAt: hace(10), lote })).toBe(true);
  });

  it('pasado el plazo fijo deja de ser vigente', () => {
    expect(qrVigente({ createdAt: hace(QR_VIGENCIA_DIAS_FALLBACK + 5), lote })).toBe(false);
  });
});
