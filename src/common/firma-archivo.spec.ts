import { BadRequestException } from '@nestjs/common';
import { coincideFirma, exigirFirma } from './firma-archivo';

const pdf = Buffer.from('%PDF-1.7\n...');
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]);
const html = Buffer.from('<html><script>alert(1)</script></html>');
const OOXML = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('coincideFirma', () => {
  it('acepta cada formato con su firma real', () => {
    expect(coincideFirma('application/pdf', pdf)).toBe(true);
    expect(coincideFirma(OOXML, zip)).toBe(true);
    expect(coincideFirma('application/msword', ole)).toBe(true);
    expect(coincideFirma('image/png', png)).toBe(true);
    expect(coincideFirma('image/jpeg', jpeg)).toBe(true);
    expect(coincideFirma('image/webp', webp)).toBe(true);
  });

  it('rechaza contenido que no es lo que dice ser', () => {
    expect(coincideFirma('application/pdf', html)).toBe(false);
    expect(coincideFirma('application/pdf', zip)).toBe(false);
    expect(coincideFirma('image/png', jpeg)).toBe(false);
    expect(coincideFirma(OOXML, pdf)).toBe(false);
    expect(coincideFirma('image/webp', Buffer.from('RIFF....WAVEfmt '))).toBe(false);
  });

  it('rechaza archivos vacíos, cortos o de tipo desconocido', () => {
    expect(coincideFirma('application/pdf', Buffer.alloc(0))).toBe(false);
    expect(coincideFirma('image/png', Buffer.from([0x89]))).toBe(false);
    expect(coincideFirma('text/html', html)).toBe(false);
  });
});

describe('exigirFirma', () => {
  it('lanza 400 si no coincide y no hace nada si coincide', () => {
    expect(() => exigirFirma({ mimetype: 'application/pdf', buffer: html })).toThrow(BadRequestException);
    expect(() => exigirFirma({ mimetype: 'application/pdf', buffer: pdf })).not.toThrow();
  });
});
