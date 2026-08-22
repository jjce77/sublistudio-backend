import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
}

// Interfaz de envío de correo — mismo patrón que la interfaz de storage (driver "local" primero,
// proveedor real después, sin tocar a quien la consume). Hoy solo existe el driver "console"
// (loguea en vez de enviar de verdad): qué proveedor real usar (Resend, SES, SMTP...) es una
// decisión de negocio pendiente, no bloquea el resto de la Fase 1 — AuthService ya está escrito
// contra esta interfaz, así que activar un proveedor real después es cambiar solo este archivo.
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendMail(options: SendMailOptions): Promise<void> {
    const driver = this.configService.get<string>('mailer.driver') ?? 'console';

    switch (driver) {
      case 'console':
        this.logger.log(
          `[mailer:console] to="${options.to}" subject="${options.subject}"\n${options.text}`,
        );
        return;
      default:
        throw new Error(`Driver de mailer "${driver}" no implementado todavía.`);
    }
  }
}
