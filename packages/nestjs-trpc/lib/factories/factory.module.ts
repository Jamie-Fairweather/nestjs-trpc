import { ConsoleLogger, Module } from '@nestjs/common';
import { MetadataScanner, ModuleRef, ModulesContainer } from '@nestjs/core';
import { TRPCFactory } from './trpc.factory';
import { RouterFactory } from './router.factory';
import { ProcedureFactory } from './procedure.factory';
import { MiddlewareFactory } from './middleware.factory';

@Module({
  imports: [],
  providers: [
    // NestJS Providers
    ConsoleLogger,
    MetadataScanner,
    ModulesContainer,
    {
      provide: ModuleRef,
      useFactory: () => {
        // The actual ModuleRef will be provided by NestJS
        // This is just a placeholder to satisfy the provider requirement
        return {};
      },
    },

    // Local Providers
    TRPCFactory,
    RouterFactory,
    ProcedureFactory,
    MiddlewareFactory,
  ],
  exports: [TRPCFactory, RouterFactory, ProcedureFactory, MiddlewareFactory],
})
export class FactoryModule {}
