import { All, Controller, Inject, OnModuleInit } from '@nestjs/common';
import { renderTrpcPanel } from 'trpc-panel';
import { AnyRouter } from '@trpc/server';
import { AppRouterHost } from 'nestjs-trpc';

@Controller()
export class TrpcPanelController implements OnModuleInit {
  private appRouter?: AnyRouter;

  constructor(
    @Inject(AppRouterHost) private readonly appRouterHost: AppRouterHost,
  ) {}

  onModuleInit() {
    // We'll try to get the router safely without throwing an error
    // This uses the new getRouterSafe method that returns undefined instead of throwing
    try {
      this.appRouter = this.appRouterHost.appRouter;
    } catch (e) {
      // Router not ready yet, we'll get it when the panel is requested
    }
  }

  @All('/panel')
  panel(): string {
    // Check if router is available before using it
    if (!this.appRouter) {
      try {
        this.appRouter = this.appRouterHost.appRouter;
      } catch (e) {
        return 'tRPC Router is not ready yet. Please try again in a moment.';
      }
    }

    return renderTrpcPanel(this.appRouter, {
      url: 'http://localhost:8080/trpc',
    });
  }
}
