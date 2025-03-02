import {
  All,
  Controller,
  Inject,
  OnModuleInit,
  Response,
} from '@nestjs/common';
import { renderTrpcPanel } from 'trpc-panel';
import type { AnyRouter } from '@trpc/server';
import { AppRouterHost } from 'nestjs-trpc';
import type { FastifyReply } from 'fastify';

@Controller()
export class TrpcPanelController implements OnModuleInit {
  private appRouter?: AnyRouter;

  constructor(
    @Inject(AppRouterHost) private readonly appRouterHost: AppRouterHost,
  ) {}

  onModuleInit() {
    // We'll try to get the router safely without throwing an error
    // This uses the new getRouterSafe method that returns undefined instead of throwing
    this.appRouter = this.appRouterHost.getRouterSafe();
  }

  @All('/panel')
  panel(@Response() res: FastifyReply) {
    // Check if router is available before using it
    if (!this.appRouter) {
      // Check if it's ready now (may have been initialized after our onModuleInit)
      if (this.appRouterHost.isRouterReady()) {
        this.appRouter = this.appRouterHost.appRouter;
      } else {
        return res
          .type('text/html')
          .send('tRPC Router is not ready yet. Please try again in a moment.');
      }
    }

    res.type('text/html').send(
      renderTrpcPanel(this.appRouter, {
        url: 'http://localhost:8080/trpc',
      }),
    );
  }
}
