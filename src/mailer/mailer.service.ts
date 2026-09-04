import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
}

// Interfaz de envío de correo — mismo patrón que la interfaz de storage (driver "local" primero,
// proveedor real después, sin tocar a quien la consume). "console" (default) loguea en vez de
// enviar de verdad; "smtp" (ej. Gmail con una contraseña de aplicación) es el primer driver que
// manda correo real, pensado para desarrollo/pruebas — un proveedor transaccional real (Resend,
// SES...) sería otro `case` más acá, sin tocar `sendMail()` ni a AuthService/UsersService que ya
// están escritos contra esta interfaz.
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  // Se crea una sola vez y se reutiliza entre envíos (crear un transporter por cada correo abre
  // y cierra una conexión SMTP cada vez — innecesariamente caro). `undefined` hasta el primer
  // sendMail con driver "smtp".
  private smtpTransporter?: Transporter;

  constructor(private readonly configService: ConfigService) {}

  async sendMail(options: SendMailOptions): Promise<void> {
    const driver = this.configService.get<string>('mailer.driver') ?? 'console';

    switch (driver) {
      case 'console':
        this.logger.log(
          `[mailer:console] to="${options.to}" subject="${options.subject}"\n${options.text}`,
        );
        return;
      case 'smtp':
        await this.sendViaSmtp(options);
        return;
      default:
        throw new Error(
          `Driver de mailer "${driver}" no implementado todavía.`,
        );
    }
  }

  private async sendViaSmtp(options: SendMailOptions): Promise<void> {
    const transporter = this.getSmtpTransporter();
    const from =
      this.configService.get<string>('mailer.from') ??
      'no-reply@sublistudio.local';

    await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
    });
  }

  private getSmtpTransporter(): Transporter {
    if (this.smtpTransporter) {
      return this.smtpTransporter;
    }

    const host = this.configService.get<string>('mailer.smtp.host');
    const user = this.configService.get<string>('mailer.smtp.user');
    const pass = this.configService.get<string>('mailer.smtp.pass');

    if (!host || !user || !pass) {
      throw new Error(
        'MAILER_DRIVER="smtp" pero faltan SMTP_HOST/SMTP_USER/SMTP_PASS en el entorno.',
      );
    }

    this.smtpTransporter = nodemailer.createTransport({
      host,
      port: this.configService.get<number>('mailer.smtp.port') ?? 587,
      secure: this.configService.get<boolean>('mailer.smtp.secure') ?? false,
      auth: { user, pass },
    });

    return this.smtpTransporter;
  }
}
