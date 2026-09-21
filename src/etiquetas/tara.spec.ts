import { calcularTara } from './tara';

describe('calcularTara', () => {
  it('resta neto de bruto cuando ambos son pesos', () => {
    expect(calcularTara('1.140', 'KG', '1', 'KG')).toBe('0.140');
    expect(calcularTara('1140', 'GR', '1', 'KG')).toBe('140');
  });

  it('con neto en volumen y sin densidad no calcula', () => {
    expect(calcularTara('1.5', 'KG', '1', 'L')).toBeNull();
    expect(calcularTara('1.5', 'KG', '1', 'L', null)).toBeNull();
  });

  it('con neto en volumen y densidad calcula bruto - neto × densidad', () => {
    // 1 L × 1.2 g/ml = 1200 g; bruto 1.5 kg → tara 0.300 kg
    expect(calcularTara('1.5', 'KG', '1', 'L', 1.2)).toBe('0.300');
    // 500 ml × 0.8 g/ml = 400 g; bruto 620 g → tara 220 g
    expect(calcularTara('620', 'GR', '500', 'ML', 0.8)).toBe('220');
  });

  it('devuelve null si la tara da negativa', () => {
    expect(calcularTara('1', 'KG', '1', 'L', 1.5)).toBeNull();
  });
});
