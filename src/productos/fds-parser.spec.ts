import { clasificarDesdeTexto } from './fds-parser';

describe('clasificarDesdeTexto', () => {
  const fds = `SECCIÓN 1: Identificación Uso H2O y P2O5.
SECCIÓN 2: Identificación de los peligros
Palabra de advertencia: Peligro
Indicaciones de peligro
H314 Provoca quemaduras graves en la piel y lesiones oculares graves.
H315 Provoca irritación cutánea.
H410
Consejos de prudencia
P280 Llevar guantes de protección.
P305 + P351 + P338 EN CASO DE CONTACTO CON LOS OJOS: aclarar con agua.
2.3 Otros peligros: ninguno
SECCIÓN 3: Composición
H302 Nocivo en caso de ingestión.`;

  it('lee pictogramas, palabra y frases solo de la sección 2', () => {
    const r = clasificarDesdeTexto(fds);
    expect(r.pictogramasGhs).toEqual(['GHS05', 'GHS09']);
    expect(r.palabraAdvertencia).toBe('PELIGRO');
    expect(r.frasesH.map((f) => f.split(':')[0])).toEqual(['H314', 'H315', 'H410']);
    expect(r.frasesH[2]).toContain('Muy tóxico para los organismos acuáticos');
    expect(r.frasesP).toEqual([
      'P280: Llevar guantes de protección.',
      'P305+P351+P338: EN CASO DE CONTACTO CON LOS OJOS: aclarar con agua.',
    ]);
  });

  it('no repite exclamación por irritación si hay corrosivo, ni por nocivo si hay tóxico', () => {
    expect(clasificarDesdeTexto('SECCIÓN 2 H314 H319').pictogramasGhs).toEqual(['GHS05']);
    expect(clasificarDesdeTexto('SECCIÓN 2 H301 H302').pictogramasGhs).toEqual(['GHS06']);
  });

  it('sin clasificación devuelve vacío', () => {
    const r = clasificarDesdeTexto('SECCIÓN 2 Producto no peligroso');
    expect(r).toEqual({ pictogramasGhs: [], palabraAdvertencia: null, frasesH: [], frasesP: [] });
  });
});
