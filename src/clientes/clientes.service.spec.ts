import { ClientesService } from './clientes.service';

function crearServicio(existente: any = null) {
  const create = jest.fn(({ data }: any) => Promise.resolve({ id: 1, ...data }));
  const update = jest.fn(({ data }: any) => Promise.resolve({ id: 1, ...existente, ...data }));
  const findUnique = jest.fn(() => Promise.resolve(existente));
  const servicio = new ClientesService({ cliente: { create, update, findUnique } } as any);
  return { servicio, create, update };
}

describe('ClientesService — autorización de contacto', () => {
  it('al crear con la casilla marcada guarda la fecha', async () => {
    const { servicio, create } = crearServicio();
    await servicio.create({ nombre: 'Farmacia', celular: '987654321', autorizaContacto: true });
    expect(create.mock.calls[0][0].data.autorizaContactoEn).toBeInstanceOf(Date);
  });

  it('al crear sin marcarla no guarda fecha', async () => {
    const { servicio, create } = crearServicio();
    await servicio.create({ nombre: 'Farmacia' });
    expect(create.mock.calls[0][0].data.autorizaContactoEn).toBeNull();
  });

  it('al editar y marcarla por primera vez guarda la fecha', async () => {
    const { servicio, update } = crearServicio({ id: 1, autorizaContactoEn: null });
    await servicio.update(1, { autorizaContacto: true });
    expect(update.mock.calls[0][0].data.autorizaContactoEn).toBeInstanceOf(Date);
  });

  it('al editar con la casilla ya marcada conserva la fecha original', async () => {
    const antes = new Date('2026-01-10T00:00:00Z');
    const { servicio, update } = crearServicio({ id: 1, autorizaContactoEn: antes });
    await servicio.update(1, { autorizaContacto: true });
    expect(update.mock.calls[0][0].data.autorizaContactoEn).toBe(antes);
  });

  it('al desmarcarla retira la fecha', async () => {
    const { servicio, update } = crearServicio({ id: 1, autorizaContactoEn: new Date() });
    await servicio.update(1, { autorizaContacto: false });
    expect(update.mock.calls[0][0].data.autorizaContactoEn).toBeNull();
  });

  it('si el cambio no menciona la casilla, no toca la fecha', async () => {
    const { servicio, update } = crearServicio({ id: 1, autorizaContactoEn: new Date() });
    await servicio.update(1, { direccion: 'Av. Perú 123' });
    expect('autorizaContactoEn' in update.mock.calls[0][0].data).toBe(false);
  });
});
