import { parsearFechaVencimiento } from './parsear-fecha-vencimiento';

describe('parsearFechaVencimiento', () => {
  it('DD/MM/AAAA se toma tal cual', () => {
    const f = parsearFechaVencimiento('15/03/2027')!;
    expect([f.getFullYear(), f.getMonth() + 1, f.getDate()]).toEqual([2027, 3, 15]);
  });

  it('acepta día y mes de un solo dígito', () => {
    const f = parsearFechaVencimiento('5/3/2027')!;
    expect([f.getFullYear(), f.getMonth() + 1, f.getDate()]).toEqual([2027, 3, 5]);
  });

  it('MM/AAAA usa el último día de ese mes', () => {
    const feb = parsearFechaVencimiento('02/2028')!; // 2028 es bisiesto
    expect([feb.getMonth() + 1, feb.getDate()]).toEqual([2, 29]);

    const abr = parsearFechaVencimiento('04/2027')!;
    expect([abr.getMonth() + 1, abr.getDate()]).toEqual([4, 30]);
  });

  it('tolera espacios alrededor', () => {
    expect(parsearFechaVencimiento('  03/2027 ')).not.toBeNull();
  });

  it('un formato que no reconoce devuelve null', () => {
    expect(parsearFechaVencimiento('marzo 2027')).toBeNull();
    expect(parsearFechaVencimiento('2027-03-15')).toBeNull();
    expect(parsearFechaVencimiento('')).toBeNull();
  });
});
