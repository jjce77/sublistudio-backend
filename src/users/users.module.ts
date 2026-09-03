import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// PrismaModule y AuditModule son @Global() (no hace falta importarlos). MailerModule NO lo es
// — mismo motivo que en AuthModule: UsersService manda correo (alta manual y provisión post-
// pago), así que hay que importarlo acá explícitamente.
//
// No @Global(): a diferencia de GlobalVariablesModule/AuditModule, por ahora ningún otro
// módulo necesita inyectar UsersService — se revisita si el webhook de pagos de Fase 8 termina
// llamando UsersService.provisionFromPayment directo en vez de vía HTTP.
@Module({
  imports: [MailerModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
