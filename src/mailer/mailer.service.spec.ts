import { MailerService } from './mailer.service';

describe('MailerService', () => {
  const buildService = (driver?: string) =>
    new MailerService({
      get: jest.fn(() => driver),
    } as never);

  it('con el driver "console" (default) no lanza y no requiere configuración adicional', async () => {
    const service = buildService(undefined);

    await expect(
      service.sendMail({
        to: 'ana@example.com',
        subject: 'Asunto',
        text: 'Cuerpo del correo',
      }),
    ).resolves.toBeUndefined();
  });

  it('rechaza un driver no implementado en vez de fallar en silencio', async () => {
    const service = buildService('sendgrid');

    await expect(
      service.sendMail({
        to: 'ana@example.com',
        subject: 'Asunto',
        text: 'Cuerpo del correo',
      }),
    ).rejects.toThrow(/sendgrid/);
  });
});
