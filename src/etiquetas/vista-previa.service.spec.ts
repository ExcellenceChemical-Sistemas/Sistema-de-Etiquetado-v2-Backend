import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { VistaPreviaService } from './vista-previa.service';

const usuario = { id: 1, esAdmin: false };

describe('VistaPreviaService', () => {
  afterEach(() => jest.useRealTimers());

  it('el agente recibe cada vista previa una sola vez y la devuelve lista', () => {
    const s = new VistaPreviaService();
    const id = s.crear({ producto: 'X' }, 1);
    expect(s.obtener(id, usuario).estado).toBe('PENDIENTE');

    const primera = s.pendientesParaAgente();
    expect(primera).toEqual([{ id, producto: 'X' }]);
    expect(s.pendientesParaAgente()).toEqual([]);
    expect(s.obtener(id, usuario).estado).toBe('PROCESANDO');

    s.guardarImagen(id, 'AAAA');
    expect(s.obtener(id, usuario)).toEqual({ estado: 'LISTA', imagen: 'data:image/png;base64,AAAA', error: null });
  });

  it('un error del agente se devuelve a quien la pidió', () => {
    const s = new VistaPreviaService();
    const id = s.crear({}, 1);
    s.guardarError(id, 'falló el render');
    expect(s.obtener(id, usuario)).toEqual({ estado: 'ERROR', imagen: null, error: 'falló el render' });
  });

  it('solo la ve quien la creó (o un admin)', () => {
    const s = new VistaPreviaService();
    const id = s.crear({}, 1);
    expect(() => s.obtener(id, { id: 2, esAdmin: false })).toThrow(ForbiddenException);
    expect(s.obtener(id, { id: 2, esAdmin: true }).estado).toBe('PENDIENTE');
  });

  it('vence a los pocos minutos', () => {
    jest.useFakeTimers();
    const s = new VistaPreviaService();
    const id = s.crear({}, 1);
    jest.setSystemTime(Date.now() + 4 * 60 * 1000);
    expect(() => s.obtener(id, usuario)).toThrow(NotFoundException);
  });

  it('no acepta imagen de una vista previa inexistente', () => {
    expect(() => new VistaPreviaService().guardarImagen('nada', 'AAAA')).toThrow(NotFoundException);
  });
});
