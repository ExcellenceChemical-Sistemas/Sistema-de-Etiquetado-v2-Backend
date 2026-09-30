import { horasHabilesEntre } from './horas-habiles';

// Lunes 2026-09-28 y martes 2026-09-29 son días hábiles reales del calendario de este proyecto.
function fecha(dia: number, hora: number, minuto = 0) {
  return new Date(2026, 8, dia, hora, minuto, 0, 0); // setiembre = mes 8
}

const REFRIGERIO_CHARLIE = [{ inicioMinutos: 12 * 60, finMinutos: 13 * 60 }]; // 12pm-1pm
const REFRIGERIO_JOEL = [{ inicioMinutos: 13 * 60, finMinutos: 14 * 60 }]; // 1pm-2pm

describe('horasHabilesEntre', () => {
  it('sin refrigerio, un día completo (7:30 a 17:30) da 10h', () => {
    expect(horasHabilesEntre(fecha(28, 7, 30), fecha(28, 17, 30))).toBeCloseTo(10);
  });

  it('un día completo con un refrigerio da 9h: 10h de jornada menos 1h', () => {
    expect(horasHabilesEntre(fecha(28, 7, 30), fecha(28, 17, 30), REFRIGERIO_CHARLIE)).toBeCloseTo(9);
  });

  it('un rango que cae dentro del refrigerio lo descuenta', () => {
    expect(horasHabilesEntre(fecha(28, 11), fecha(28, 14), REFRIGERIO_CHARLIE)).toBeCloseTo(2); // 3h brutas - 1h
  });

  it('un rango fuera del refrigerio no descuenta nada', () => {
    expect(horasHabilesEntre(fecha(28, 8), fecha(28, 11), REFRIGERIO_CHARLIE)).toBeCloseTo(3);
  });

  it('con varios refrigerios escalonados sin superposición, no descuenta nada (siempre hay alguien)', () => {
    expect(
      horasHabilesEntre(fecha(28, 7, 30), fecha(28, 17, 30), [...REFRIGERIO_CHARLIE, ...REFRIGERIO_JOEL]),
    ).toBeCloseTo(10);
  });

  it('con refrigerios que se superponen, descuenta solo la intersección', () => {
    // Charlie 12-1, otra persona 12:30-1:30 -> intersección 12:30-1
    const refrigerios = [{ inicioMinutos: 12 * 60, finMinutos: 13 * 60 }, { inicioMinutos: 12 * 60 + 30, finMinutos: 13 * 60 + 30 }];
    expect(horasHabilesEntre(fecha(28, 7, 30), fecha(28, 17, 30), refrigerios)).toBeCloseTo(9.5);
  });

  it('cuenta solo horas hábiles a través de un fin de semana', () => {
    // Viernes 25/09 10am -> lunes 28/09 10am: 6.5h del viernes (10am-17:30, -1h refrigerio) + 2.5h del lunes (7:30-10am)
    expect(horasHabilesEntre(fecha(25, 10), fecha(28, 10), REFRIGERIO_CHARLIE)).toBeCloseTo(9);
  });

  it('no cuenta horas negativas si fin es anterior a inicio', () => {
    expect(horasHabilesEntre(fecha(28, 17, 30), fecha(28, 7, 30))).toBe(0);
  });
});
