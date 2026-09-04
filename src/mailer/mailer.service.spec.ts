const sendMailMock = jest.fn().mockResolvedValue(undefined);
const createTransportMock = jest.fn(() => ({ sendMail: sendMailMock }));

// Se mockea el módulo completo — los tests no deben abrir una conexión SMTP real.
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: (...args: unknown[]) => createTransportMock(...args),
  },
}));

import { MailerService } from './mailer.service';

describe('MailerService', () => {
  beforeEach(() => {
    sendMailMock.mockClear();
    createTransportMock.mockClear();
  });

  // ConfigService real usa dot-path ('mailer.driver', 'mailer.smtp.host', ...) — el mock
  // resuelve esos mismos paths contra un objeto plano, en vez de responder siempre el mismo
  // valor sin importar la key pedida (lo que rompería la config SMTP, que necesita varias keys
  // distintas en la misma llamada a sendMail).
  function buildService(config: Record<string, unknown>) {
    const configService = {
      get: jest.fn((key: string) => config[key]),
    };
    return new MailerService(configService as never);
  }

  it('con el driver "console" (default) no lanza y no requiere configuración adicional', async () => {
    const service = buildService({});

    await expect(
      service.sendMail({
        to: 'ana@example.com',
        subject: 'Asunto',
        text: 'Cuerpo del correo',
      }),
    ).resolves.toBeUndefined();
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('rechaza un driver no implementado en vez de fallar en silencio', async () => {
    const service = buildService({ 'mailer.driver': 'sendgrid' });

    await expect(
      service.sendMail({
        to: 'ana@example.com',
        subject: 'Asunto',
        text: 'Cuerpo del correo',
      }),
    ).rejects.toThrow(/sendgrid/);
  });

  describe('driver "smtp"', () => {
    const smtpConfig = {
      'mailer.driver': 'smtp',
      'mailer.from': 'no-reply@sublistudio.local',
      'mailer.smtp.host': 'smtp.gmail.com',
      'mailer.smtp.port': 587,
      'mailer.smtp.secure': false,
      'mailer.smtp.user': 'cuenta@gmail.com',
      'mailer.smtp.pass': 'app-password-de-16-caracteres',
    };

    it('crea el transporter con host/puerto/credenciales y manda el correo', async () => {
      const service = buildService(smtpConfig);

      await service.sendMail({
        to: 'ana@example.com',
        subject: 'Asunto',
        text: 'Cuerpo del correo',
      });

      expect(createTransportMock).toHaveBeenCalledWith({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: 'cuenta@gmail.com',
          pass: 'app-password-de-16-caracteres',
        },
      });
      expect(sendMailMock).toHaveBeenCalledWith({
        from: 'no-reply@sublistudio.local',
        to: 'ana@example.com',
        subject: 'Asunto',
        text: 'Cuerpo del correo',
      });
    });

    it('reutiliza el mismo transporter entre envíos en vez de crear uno nuevo cada vez', async () => {
      const service = buildService(smtpConfig);

      await service.sendMail({
        to: 'a@example.com',
        subject: 'S1',
        text: 'T1',
      });
      await service.sendMail({
        to: 'b@example.com',
        subject: 'S2',
        text: 'T2',
      });

      expect(createTransportMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock).toHaveBeenCalledTimes(2);
    });

    it('lanza un error claro si falta host/usuario/contraseña en vez de fallar silenciosamente', async () => {
      const service = buildService({ 'mailer.driver': 'smtp' });

      await expect(
        service.sendMail({ to: 'ana@example.com', subject: 'S', text: 'T' }),
      ).rejects.toThrow(/SMTP_HOST|SMTP_USER|SMTP_PASS/);
      expect(createTransportMock).not.toHaveBeenCalled();
    });
  });
});
