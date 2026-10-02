import { corteAvisoAlmacenVigente } from './corte-aviso-almacen';

describe('corteAvisoAlmacenVigente', () => {
  it('antes de las 5:30pm hora Perú en un día hábil, el corte vigente es el del día hábil anterior', () => {
    // Jueves 2026-10-01, 10:00am hora Perú (15:00 UTC).
    const ahora = new Date('2026-10-01T15:00:00.000Z');
    // Miércoles 2026-09-30, 5:30pm hora Perú = 22:30 UTC.
    expect(corteAvisoAlmacenVigente(ahora)).toEqual(new Date('2026-09-30T22:30:00.000Z'));
  });

  it('entre las 5pm y las 5:30pm hora Perú, el corte de hoy todavía no llegó', () => {
    // Jueves 2026-10-01, 5:15pm hora Perú (22:15 UTC) — Joel sigue dentro de su ventana normal.
    const ahora = new Date('2026-10-01T22:15:00.000Z');
    // Miércoles 2026-09-30, 5:30pm hora Perú = 22:30 UTC.
    expect(corteAvisoAlmacenVigente(ahora)).toEqual(new Date('2026-09-30T22:30:00.000Z'));
  });

  it('después de las 5:30pm hora Perú, el corte vigente es el de hoy', () => {
    // Jueves 2026-10-01, 6:00pm hora Perú (23:00 UTC).
    const ahora = new Date('2026-10-01T23:00:00.000Z');
    expect(corteAvisoAlmacenVigente(ahora)).toEqual(new Date('2026-10-01T22:30:00.000Z'));
  });

  it('justo en el instante del corte, ese instante cuenta como vigente (no hay que esperar al minuto siguiente)', () => {
    const corte = new Date('2026-10-01T22:30:00.000Z'); // jueves, exactamente 5:30pm Perú
    expect(corteAvisoAlmacenVigente(corte)).toEqual(corte);
  });

  it('un lunes a la mañana, se salta el fin de semana y el corte vigente es el del viernes', () => {
    // Lunes 2026-10-05, 9:00am hora Perú (14:00 UTC).
    const ahora = new Date('2026-10-05T14:00:00.000Z');
    // Viernes 2026-10-02, 5:30pm hora Perú = 22:30 UTC.
    expect(corteAvisoAlmacenVigente(ahora)).toEqual(new Date('2026-10-02T22:30:00.000Z'));
  });

  it('un feriado no tiene corte propio: se salta hasta el día hábil anterior', () => {
    // Año Nuevo, jueves 2026-01-01, 10:00am hora Perú (15:00 UTC) — feriado, no hábil.
    const ahora = new Date('2026-01-01T15:00:00.000Z');
    // Miércoles 2025-12-31 (hábil, no feriado), 5:30pm hora Perú = 22:30 UTC.
    expect(corteAvisoAlmacenVigente(ahora)).toEqual(new Date('2025-12-31T22:30:00.000Z'));
  });
});
