import { BadRequestException } from '@nestjs/common';
import { validarOrdenCronologico } from './orden-etapas';

describe('validarOrdenCronologico', () => {
  it('etapas en orden no rechaza', () => {
    expect(() =>
      validarOrdenCronologico([
        { label: 'A', valor: new Date('2026-09-01T10:00:00Z') },
        { label: 'B', valor: new Date('2026-09-02T10:00:00Z') },
      ]),
    ).not.toThrow();
  });

  it('dos etapas en el mismo instante no rechaza (igualdad permitida)', () => {
    const fecha = new Date('2026-09-01T10:00:00Z');
    expect(() =>
      validarOrdenCronologico([
        { label: 'A', valor: fecha },
        { label: 'B', valor: fecha },
      ]),
    ).not.toThrow();
  });

  it('una etapa intermedia null no rompe la comparación entre las que sí están', () => {
    expect(() =>
      validarOrdenCronologico([
        { label: 'A', valor: new Date('2026-09-01T10:00:00Z') },
        { label: 'B', valor: null },
        { label: 'C', valor: new Date('2026-09-02T10:00:00Z') },
      ]),
    ).not.toThrow();
  });

  it('una etapa posterior con fecha anterior a la previa → BadRequest con ambos nombres en el mensaje', () => {
    expect(() =>
      validarOrdenCronologico([
        { label: 'Recibido', valor: new Date('2026-09-02T20:30:00Z') },
        { label: 'Preparado', valor: new Date('2026-09-02T20:00:00Z') },
      ]),
    ).toThrow(BadRequestException);
    try {
      validarOrdenCronologico([
        { label: 'Recibido', valor: new Date('2026-09-02T20:30:00Z') },
        { label: 'Preparado', valor: new Date('2026-09-02T20:00:00Z') },
      ]);
    } catch (e) {
      expect((e as BadRequestException).message).toContain('Recibido');
      expect((e as BadRequestException).message).toContain('Preparado');
    }
  });
});
