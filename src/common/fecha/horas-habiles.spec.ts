import { horasHabilesEntre } from './horas-habiles';

// Lunes 2026-09-28 y martes 2026-09-29 son días hábiles reales del calendario de este proyecto.
function fecha(dia: number, hora: number, minuto = 0) {
  return new Date(2026, 8, dia, hora, minuto, 0, 0); // setiembre = mes 8
}

describe('horasHabilesEntre', () => {
  it('un día completo (7:30 a 17:30) da 9h: 10h de jornada menos 1h de refrigerio', () => {
    expect(horasHabilesEntre(fecha(28, 7, 30), fecha(28, 17, 30))).toBeCloseTo(9);
  });

  it('un rango que cae dentro del refrigerio (12-13) lo descuenta', () => {
    expect(horasHabilesEntre(fecha(28, 11), fecha(28, 14))).toBeCloseTo(2); // 3h brutas - 1h refrigerio
  });

  it('un rango fuera del refrigerio no descuenta nada', () => {
    expect(horasHabilesEntre(fecha(28, 8), fecha(28, 11))).toBeCloseTo(3);
  });

  it('cuenta solo horas hábiles a través de un fin de semana', () => {
    // Viernes 25/09 10am -> lunes 28/09 10am: 6.5h del viernes (10am-17:30, -1h refrigerio) + 2.5h del lunes (7:30-10am)
    expect(horasHabilesEntre(fecha(25, 10), fecha(28, 10))).toBeCloseTo(9);
  });

  it('no cuenta horas negativas si fin es anterior a inicio', () => {
    expect(horasHabilesEntre(fecha(28, 17, 30), fecha(28, 7, 30))).toBe(0);
  });
});
