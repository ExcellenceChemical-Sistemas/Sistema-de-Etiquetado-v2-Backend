import { etapasParaAvisar, NotificacionesService, type PedidoParaAviso } from './notificaciones.service';

const F = new Date('2026-09-02T10:00:00Z');

const BASE: PedidoParaAviso = {
  id: 7,
  numeroProforma: 'PF-0042',
  tokenSeguimiento: 'tok123',
  salioEn: null,
  entregadoEn: null,
  avisoSalioEnviadoEn: null,
  avisoEntregadoEnviadoEn: null,
  categoriaObservacion: null,
  cliente: { email: 'cliente@empresa.com' },
};
const con = (c: Partial<PedidoParaAviso>): PedidoParaAviso => ({ ...BASE, ...c });

describe('etapasParaAvisar', () => {
  it('marcar "salió" avisa SALIO', () => {
    expect(etapasParaAvisar(BASE, con({ salioEn: F }))).toEqual(['SALIO']);
  });

  it('marcar "entregado" avisa ENTREGADO', () => {
    expect(etapasParaAvisar(con({ salioEn: F }), con({ salioEn: F, entregadoEn: F }))).toEqual(['ENTREGADO']);
  });

  it('marcar las dos a la vez avisa solo la entrega', () => {
    expect(etapasParaAvisar(BASE, con({ salioEn: F, entregadoEn: F }))).toEqual(['ENTREGADO']);
  });

  it('corregir la fecha de una etapa ya marcada NO vuelve a avisar', () => {
    const otraFecha = new Date('2026-09-03T10:00:00Z');
    expect(etapasParaAvisar(con({ salioEn: F }), con({ salioEn: otraFecha }))).toEqual([]);
  });

  it('un cambio que no toca esas etapas no avisa', () => {
    expect(etapasParaAvisar(BASE, con({ categoriaObservacion: 'OTRO' }))).toEqual([]);
  });

  it('no avisa dos veces la misma etapa', () => {
    expect(etapasParaAvisar(BASE, con({ salioEn: F, avisoSalioEnviadoEn: F }))).toEqual([]);
  });

  it('un pedido cancelado no avisa', () => {
    expect(etapasParaAvisar(BASE, con({ salioEn: F, categoriaObservacion: 'CANCELADO' }))).toEqual([]);
  });
});

describe('NotificacionesService.avisarPedido', () => {
  const entorno = { ...process.env };
  let fetchMock: jest.Mock;

  function crear(reservas = 1) {
    const prisma: any = { pedido: { updateMany: jest.fn(() => Promise.resolve({ count: reservas })) } };
    return { servicio: new NotificacionesService(prisma), prisma };
  }

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_prueba';
    process.env.MAIL_REMITENTE = 'Excellence Chemical <pedidos@excellencechemical.com>';
    process.env.FRONTEND_URL = 'https://excellencechemical.vercel.app/';
    delete process.env.MAIL_RESPONDER_A;
    fetchMock = jest.fn(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') }));
    (global as any).fetch = fetchMock;
  });
  afterAll(() => {
    process.env = entorno;
  });

  it('envía el correo al cliente con el enlace de seguimiento y marca el aviso', async () => {
    const { servicio, prisma } = crear();
    const ok = await servicio.avisarPedido(BASE, con({ salioEn: F }));

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_prueba');
    expect(init.headers['Idempotency-Key']).toBe('pedido-7-SALIO');
    const cuerpo = JSON.parse(init.body);
    expect(cuerpo.to).toEqual(['cliente@empresa.com']);
    expect(cuerpo.from).toContain('pedidos@excellencechemical.com');
    expect(cuerpo.text).toContain('https://excellencechemical.vercel.app/p/tok123'); // sin doble barra
    expect(prisma.pedido.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 7, avisoSalioEnviadoEn: null },
      data: { avisoSalioEnviadoEn: expect.any(Date) },
    });
  });

  it('sin correo del cliente no envía y no es un error', async () => {
    const { servicio } = crear();
    expect(await servicio.avisarPedido(BASE, con({ salioEn: F, cliente: { email: null } }))).toBe(false);
    expect(await servicio.avisarPedido(BASE, con({ salioEn: F, cliente: { email: '  ' } }))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin RESEND_API_KEY el envío queda apagado (y no marca nada como avisado)', async () => {
    delete process.env.RESEND_API_KEY;
    const { servicio, prisma } = crear();
    expect(await servicio.avisarPedido(BASE, con({ salioEn: F }))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.pedido.updateMany).not.toHaveBeenCalled();
  });

  it('si otro cambio ya reservó el aviso (concurrencia), no envía de nuevo', async () => {
    const { servicio } = crear(0);
    expect(await servicio.avisarPedido(BASE, con({ salioEn: F }))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si Resend falla NO lanza, devuelve false y libera la reserva', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, text: () => Promise.resolve('correo inválido') });
    const { servicio, prisma } = crear();
    await expect(servicio.avisarPedido(BASE, con({ salioEn: F }))).resolves.toBe(false);
    // 1ª llamada: reservar; 2ª: liberar (queda "sin avisar")
    expect(prisma.pedido.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.pedido.updateMany.mock.calls[1][0]).toEqual({
      where: { id: 7 },
      data: { avisoSalioEnviadoEn: null },
    });
  });

  it('si la red se cae tampoco lanza', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    const { servicio } = crear();
    await expect(servicio.avisarPedido(BASE, con({ salioEn: F }))).resolves.toBe(false);
  });

  it('una etapa que no corresponde no toca la red ni la base', async () => {
    const { servicio, prisma } = crear();
    await servicio.avisarPedido(BASE, con({ categoriaObservacion: 'OTRO' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.pedido.updateMany).not.toHaveBeenCalled();
  });

  it('manda reply_to solo si está configurado', async () => {
    process.env.MAIL_RESPONDER_A = 'ventas@excellencechemical.com';
    const { servicio } = crear();
    await servicio.avisarPedido(BASE, con({ entregadoEn: F }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reply_to).toBe('ventas@excellencechemical.com');
  });
});
