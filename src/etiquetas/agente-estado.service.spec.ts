import { AgenteEstadoService } from './agente-estado.service';

function crear(pendientes = 0, minutosAntiguo = 0) {
  const prisma: any = {
    trabajoImpresion: {
      count: jest.fn().mockResolvedValue(pendientes),
      findFirst: jest
        .fn()
        .mockResolvedValue(pendientes ? { createdAt: new Date(Date.now() - minutosAntiguo * 60000) } : null),
    },
  };
  return new AgenteEstadoService(prisma);
}

describe('AgenteEstadoService', () => {
  afterEach(() => jest.useRealTimers());

  it('sin contacto del agente y pasado el margen de arranque, alerta que no responde', async () => {
    jest.useFakeTimers();
    const s = crear();
    jest.setSystemTime(Date.now() + 10 * 60 * 1000);
    const r = await s.obtener();
    expect(r.agenteConectado).toBe(false);
    expect(r.alertas).toEqual([expect.objectContaining({ tipo: 'AGENTE', severidad: 'error' })]);
  });

  it('recién arrancado el servidor no da falsa alarma', async () => {
    const r = await crear().obtener();
    expect(r.alertas).toEqual([]);
  });

  it('agente conectado y sin problemas: sin alertas', async () => {
    const s = crear();
    s.registrar({ ok: true, problemas: [] });
    const r = await s.obtener();
    expect(r.agenteConectado).toBe(true);
    expect(r.alertas).toEqual([]);
  });

  it('problemas de la impresora: los bloqueantes son error y los demás aviso', async () => {
    const s = crear();
    s.registrar({
      problemas: [
        { codigo: 'SIN_PAPEL', mensaje: 'Sin papel', bloqueante: true },
        { codigo: 'POCA_TINTA', mensaje: 'Poca tinta', bloqueante: false },
      ],
    });
    const r = await s.obtener();
    expect(r.alertas).toEqual([
      { tipo: 'IMPRESORA', severidad: 'error', mensaje: 'Sin papel' },
      { tipo: 'IMPRESORA', severidad: 'aviso', mensaje: 'Poca tinta' },
    ]);
  });

  it('si el agente dejó de avisar, ya no se muestran los problemas viejos de la impresora', async () => {
    jest.useFakeTimers();
    const s = crear();
    s.registrar({ problemas: [{ codigo: 'SIN_PAPEL', mensaje: 'Sin papel', bloqueante: true }] });
    jest.setSystemTime(Date.now() + 5 * 60 * 1000);
    const r = await s.obtener();
    expect(r.alertas.map((a) => a.tipo)).toEqual(['AGENTE']);
    expect(r.impresora).toBeNull();
  });

  it('avisa cuando hay etiquetas esperando más del límite', async () => {
    const s = crear(3, 7);
    s.registrar({ problemas: [] });
    const r = await s.obtener();
    expect(r.alertas).toEqual([expect.objectContaining({ tipo: 'COLA', severidad: 'aviso' })]);
    expect(r.alertas[0].mensaje).toContain('3 etiquetas');
    expect(r.minutosEsperando).toBe(7);
  });

  it('no alerta por una cola reciente', async () => {
    const s = crear(2, 1);
    s.registrar({ problemas: [] });
    expect((await s.obtener()).alertas).toEqual([]);
  });

  it('ignora datos mal formados del agente', async () => {
    const s = crear();
    s.registrar('basura');
    const r = await s.obtener();
    expect(r.agenteConectado).toBe(true);
    expect(r.impresora).toBeNull();
  });
});
