import { Global, Module } from '@nestjs/common';
import { GlobalVariablesController } from './global-variables.controller';
import { GlobalVariablesService } from './global-variables.service';

// Global: cualquier módulo de negocio (ej. el catálogo de proveedores OAuth, ver
// adr-sublistudio.md DEC-05) necesita leer/escribir configuración sin reimportar este módulo
// cada vez — mismo criterio que AuditModule.
@Global()
@Module({
  controllers: [GlobalVariablesController],
  providers: [GlobalVariablesService],
  exports: [GlobalVariablesService],
})
export class GlobalVariablesModule {}
