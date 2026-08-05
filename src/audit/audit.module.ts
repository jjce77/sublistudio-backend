import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

// Global: cualquier módulo de negocio (users, resources, payments...) necesita auditar sin
// tener que re-importar este módulo cada vez.
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
