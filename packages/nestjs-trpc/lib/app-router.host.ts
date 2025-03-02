import { Injectable } from '@nestjs/common';
import { AnyRouter } from '@trpc/server';

@Injectable()
export class AppRouterHost {
  private _appRouter: AnyRouter | undefined;

  set appRouter(schemaRef: AnyRouter) {
    this._appRouter = schemaRef;
  }

  /**
   * Check if the router is ready to be used
   * @returns boolean indicating if the router is initialized
   */
  isRouterReady(): boolean {
    return this._appRouter !== undefined;
  }

  /**
   * Get the tRPC app router
   * @param throwIfNotReady Whether to throw an error if the router isn't ready (defaults to true)
   * @returns The app router, or undefined if not ready and throwIfNotReady is false
   */
  get appRouter(): AnyRouter {
    if (!this._appRouter) {
      throw new Error(
        'TRPC appRouter has not yet been created. ' +
          'Make sure to call the "AppRouterHost#appRouter" getter when the application is already initialized (after the "onModuleInit" hook triggered by either "app.listen()" or "app.init()" method). ' +
          'Alternatively, use AppRouterHost#isRouterReady() to check if the router is available before accessing it.',
      );
    }
    return this._appRouter;
  }

  /**
   * Get the tRPC app router, returning undefined if it's not ready instead of throwing an error
   */
  getRouterSafe(): AnyRouter | undefined {
    return this._appRouter;
  }
}
