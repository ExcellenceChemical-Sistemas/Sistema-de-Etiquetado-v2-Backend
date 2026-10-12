import { alertaSecuenciaConPedido } from './alerta-secuencia';

// Caso real PF01-5118 (12/10/2026, hora Perú): almacén recibió 10:45, el aviso se marcó 13:46.
const RECIBIDO = new Date('2026-10-12T15:45:00Z'); // 10:45 Lima
const AVISO_TARDE = new Date('2026-10-12T18:46:00Z'); // 13:46 Lima
const AVISO_A_TIEMPO = new Date('2026-10-12T14:00:00Z'); // 09:00 Lima

describe('alertaSecuenciaConPedido', () => {
  it('sin pedido relacionado no hay nada que comparar', () => {
    expect(alertaSecuenciaConPedido({ avisoAlmacenEn: AVISO_TARDE }, null)).toBeNull();
  });

  it('aviso registrado después de que almacén recibió → alerta sobre avisoAlmacenEn', () => {
    const alerta = alertaSecuenciaConPedido({ avisoAlmacenEn: AVISO_TARDE }, { recibidoEn: RECIBIDO });
    expect(alerta).toMatchObject({ campo: 'avisoAlmacenEn', tipo: 'FUERA_DE_SECUENCIA' });
    expect(alerta?.motivo).toContain('antes de que se registrara el aviso');
  });

  it('almacén ya recibió y el aviso nunca se registró → alerta', () => {
    const alerta = alertaSecuenciaConPedido({ avisoAlmacenEn: null }, { recibidoEn: RECIBIDO });
    expect(alerta).toMatchObject({ campo: 'avisoAlmacenEn', tipo: 'FUERA_DE_SECUENCIA' });
    expect(alerta?.motivo).toContain('sigue sin registrarse');
  });

  it('aviso antes de la recepción (orden normal) → sin alerta', () => {
    expect(alertaSecuenciaConPedido({ avisoAlmacenEn: AVISO_A_TIEMPO }, { recibidoEn: RECIBIDO })).toBeNull();
  });

  it('misma hora exacta no cuenta como fuera de secuencia', () => {
    expect(alertaSecuenciaConPedido({ avisoAlmacenEn: RECIBIDO }, { recibidoEn: RECIBIDO })).toBeNull();
  });
});