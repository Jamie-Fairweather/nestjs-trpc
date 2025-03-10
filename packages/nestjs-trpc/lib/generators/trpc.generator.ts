import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  ConsoleLogger,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { Project, SourceFile } from 'ts-morph';
import { saveOrOverrideFile } from '../utils/ts-morph.util';
import {
  findTsConfigFile,
  resolvePathWithAliases,
} from '../utils/path-resolution.util';
import { RouterGenerator } from './router.generator';
import { SchemaImports, TRPCContext } from '../interfaces';
import { MiddlewareGenerator } from './middleware.generator';
import type { Class } from 'type-fest';
import { ContextGenerator } from './context.generator';
import { RouterFactory } from '../factories/router.factory';
import { MiddlewareFactory } from '../factories/middleware.factory';
import { ProcedureFactory } from '../factories/procedure.factory';
import { TRPC_MODULE_CALLER_FILE_PATH } from '../trpc.constants';
import { SourceFileImportsMap } from '../interfaces/generator.interface';
import { StaticGenerator } from './static.generator';
import { ImportsScanner } from '../scanners/imports.scanner';
import {
  TYPESCRIPT_APP_ROUTER_SOURCE_FILE,
  TYPESCRIPT_PROJECT,
} from './generator.constants';
import * as process from 'node:process';

@Injectable()
export class TRPCGenerator implements OnModuleInit {
  private rootModuleImportsMap!: Map<string, SourceFileImportsMap>;
  private readonly HELPER_TYPES_OUTPUT_FILE = 'index.ts';
  private readonly HELPER_TYPES_OUTPUT_PATH = path.join(__dirname, 'types');

  @Inject(TRPC_MODULE_CALLER_FILE_PATH)
  private readonly moduleCallerFilePath!: string;

  @Inject(TYPESCRIPT_PROJECT)
  private readonly project!: Project;

  @Inject(TYPESCRIPT_APP_ROUTER_SOURCE_FILE)
  private readonly appRouterSourceFile!: SourceFile;

  @Inject(ConsoleLogger)
  private readonly consoleLogger!: ConsoleLogger;

  @Inject(StaticGenerator)
  private readonly staticGenerator!: StaticGenerator;

  @Inject(MiddlewareGenerator)
  private readonly middlewareHandler!: MiddlewareGenerator;

  @Inject(ContextGenerator)
  private readonly contextHandler!: ContextGenerator;

  @Inject(RouterGenerator)
  private readonly serializerHandler!: RouterGenerator;

  @Inject(RouterFactory)
  private readonly routerFactory!: RouterFactory;

  @Inject(ProcedureFactory)
  private readonly procedureFactory!: ProcedureFactory;

  @Inject(MiddlewareFactory)
  private readonly middlewareFactory!: MiddlewareFactory;

  @Inject(ImportsScanner)
  private readonly importsScanner!: ImportsScanner;

  onModuleInit() {
    this.rootModuleImportsMap = this.buildRootImportsMap();
  }

  public async generateSchemaFile(
    schemaImports?: Array<SchemaImports> | undefined,
    injectFiles?: Array<string> | undefined,
  ): Promise<void> {
    try {
      const routers = this.routerFactory.getRouters();
      const mappedRoutesAndProcedures = routers.map((route) => {
        const { instance, name, alias, path } = route;
        const prototype = Object.getPrototypeOf(instance);
        const procedures = this.procedureFactory.getProcedures(
          instance,
          prototype,
        );

        return { name, path, alias, instance: { ...route }, procedures };
      });

      this.staticGenerator.generateStaticDeclaration(this.appRouterSourceFile);

      if (schemaImports != null && schemaImports.length > 0) {
        const schemaImportNames: Array<string> = schemaImports.map(
          (schemaImport) => (schemaImport as any).name,
        );
        this.staticGenerator.addSchemaImports(
          this.appRouterSourceFile,
          schemaImportNames,
          this.rootModuleImportsMap,
        );
      }

      // Handle injected files if specified
      if (injectFiles != null && injectFiles.length > 0) {
        await this.injectFilesContent(injectFiles);
      }

      const routersMetadata = this.serializerHandler.serializeRouters(
        mappedRoutesAndProcedures,
        this.project,
      );

      const routersStringDeclarations =
        this.serializerHandler.generateRoutersStringFromMetadata(
          routersMetadata,
        );

      this.appRouterSourceFile.addStatements(/* ts */ `
        const appRouter = t.router({${routersStringDeclarations}});
        export type AppRouter = typeof appRouter;
      `);

      await saveOrOverrideFile(this.appRouterSourceFile);

      this.consoleLogger.log(
        `AppRouter has been updated successfully at "./${path.relative(process.cwd(), this.appRouterSourceFile.getFilePath())}".`,
        'TRPC Generator',
      );
    } catch (error: unknown) {
      this.consoleLogger.warn('TRPC Generator encountered an error.', error);
    }
  }

  /**
   * Injects the contents of specified files into the generated output
   * It resolves file paths based on the TypeScript path aliases from tsconfig
   * and handles duplicate imports
   */
  private async injectFilesContent(filePaths: Array<string>): Promise<void> {
    try {
      // Get tsconfig for resolving path aliases
      const tsConfigFilePath = findTsConfigFile(
        this.moduleCallerFilePath,
        this.consoleLogger,
      );

      if (tsConfigFilePath) {
        const tsConfigContent = fs.readFileSync(tsConfigFilePath, 'utf8');
        const tsConfigObj = JSON.parse(tsConfigContent);
        const pathAliases = tsConfigObj.compilerOptions?.paths || {};

        this.consoleLogger.log(
          `Found path aliases in tsconfig: ${JSON.stringify(pathAliases)}`,
          'TRPC Generator',
        );

        for (const filePath of filePaths) {
          this.consoleLogger.log(
            `Resolving file path: ${filePath}`,
            'TRPC Generator',
          );

          // Resolve the file path using TypeScript path aliases
          const resolvedPath = resolvePathWithAliases(
            filePath,
            pathAliases,
            path.dirname(tsConfigFilePath),
            this.consoleLogger,
          );

          this.consoleLogger.log(
            `Resolved path: ${resolvedPath || 'null'}`,
            'TRPC Generator',
          );

          if (resolvedPath && fs.existsSync(resolvedPath)) {
            try {
              // Instead of loading with ts-morph, read file directly
              this.consoleLogger.log(
                `Reading file: ${resolvedPath}`,
                'TRPC Generator',
              );

              // Read the file content directly - much faster than ts-morph parsing
              const fileContent = fs.readFileSync(resolvedPath, 'utf8');

              // Simple regex-based extraction of imports
              const existingImports = new Set<string>();
              this.appRouterSourceFile
                .getImportDeclarations()
                .forEach((importDecl) => {
                  const moduleSpecifier = importDecl.getModuleSpecifierValue();
                  existingImports.add(moduleSpecifier);

                  importDecl.getNamedImports().forEach((namedImport) => {
                    existingImports.add(
                      `${moduleSpecifier}:${namedImport.getName()}`,
                    );
                  });
                });

              // Extract and process imports with regex
              const importRegex =
                /import\s+{([^}]*)}\s+from\s+['"]([^'"]+)['"];?\s*/g;
              let match;
              let nonImportContent = fileContent;

              // Process all imports first
              const processedImports = new Set<string>();
              while ((match = importRegex.exec(fileContent)) !== null) {
                const namedImportsText = match[1];
                const moduleSpecifier = match[2];

                // Mark this part to be removed from content
                processedImports.add(match[0]);

                // Process each named import
                const namedImports = namedImportsText
                  .split(',')
                  .map((imp) => imp.trim())
                  .filter((imp) => imp !== '');

                namedImports.forEach((namedImport) => {
                  const importKey = `${moduleSpecifier}:${namedImport}`;

                  if (!existingImports.has(importKey)) {
                    if (!existingImports.has(moduleSpecifier)) {
                      // Create new import declaration
                      this.appRouterSourceFile.addImportDeclaration({
                        moduleSpecifier,
                        namedImports: [namedImport],
                      });
                      existingImports.add(moduleSpecifier);
                    } else {
                      // Add to existing import declaration
                      const existingImport =
                        this.appRouterSourceFile.getImportDeclaration(
                          (decl) =>
                            decl.getModuleSpecifierValue() === moduleSpecifier,
                        );
                      if (existingImport) {
                        existingImport.addNamedImport(namedImport);
                      }
                    }
                    existingImports.add(importKey);
                  }
                });
              }

              // Remove all imports from content
              processedImports.forEach((importStatement) => {
                nonImportContent = nonImportContent.replace(
                  importStatement,
                  '',
                );
              });

              // Clean up orphaned semicolons and extra whitespace
              nonImportContent = nonImportContent
                .replace(/;\s*;/g, ';') // Replace multiple semicolons with a single one
                .replace(/^\s*;/gm, '') // Remove semicolons at the beginning of lines
                .replace(/\s*;\s*\n/g, '\n'); // Remove trailing semicolons at the end of lines

              // Add remaining non-import content
              const cleanedContent = nonImportContent.trim();
              if (cleanedContent) {
                this.appRouterSourceFile.addStatements(cleanedContent);
              }

              this.consoleLogger.log(
                `Successfully injected content from ${filePath} (resolved to ${resolvedPath})`,
                'TRPC Generator',
              );
            } catch (error) {
              this.consoleLogger.warn(
                `Error injecting file ${filePath} (resolved to ${resolvedPath}): ${error}`,
                'TRPC Generator',
              );
            }
          } else {
            this.consoleLogger.warn(
              `Could not resolve path for ${filePath} or file doesn't exist`,
              'TRPC Generator',
            );
          }
        }
      } else {
        this.consoleLogger.warn(
          'Could not find tsconfig.json file',
          'TRPC Generator',
        );
      }
    } catch (error) {
      this.consoleLogger.warn(
        `Error injecting files: ${error}`,
        'TRPC Generator',
      );
    }
  }

  public async generateHelpersFile(
    context?: Class<TRPCContext>,
  ): Promise<void> {
    try {
      const middlewares = this.middlewareFactory.getMiddlewares();
      const helperTypesSourceFile = this.project.createSourceFile(
        path.resolve(
          this.HELPER_TYPES_OUTPUT_PATH,
          this.HELPER_TYPES_OUTPUT_FILE,
        ),
        undefined,
        { overwrite: true },
      );

      if (context != null) {
        const contextImport = this.rootModuleImportsMap.get(context.name);

        if (contextImport == null) {
          throw new Error('Could not find context import declaration.');
        }

        const contextType = await this.contextHandler.getContextInterface(
          contextImport.sourceFile,
          context,
        );

        helperTypesSourceFile.addTypeAlias({
          isExported: true,
          name: 'Context',
          type: contextType ?? '{}',
        });
      }

      for (const middleware of middlewares) {
        const middlewareInterface =
          await this.middlewareHandler.getMiddlewareInterface(
            middleware.path,
            middleware.instance,
            this.project,
          );

        if (middlewareInterface != null) {
          helperTypesSourceFile.addInterface({
            isExported: true,
            name: `${middlewareInterface.name}Context`,
            extends: ['Context'],
            properties: middlewareInterface.properties,
          });
        }
      }

      await saveOrOverrideFile(helperTypesSourceFile);

      this.consoleLogger.log(
        `Helper types has been updated successfully at "nestjs-trpc/types".`,
        'TRPC Generator',
      );
    } catch (e: unknown) {
      this.consoleLogger.warn('TRPC Generator encountered an error.', e);
    }
  }

  private buildRootImportsMap(): Map<string, SourceFileImportsMap> {
    // This also needs optimization but we'll handle it differently since we need the sourceFile
    const rootModuleSourceFile = this.project.addSourceFileAtPathIfExists(
      this.moduleCallerFilePath,
    );

    if (rootModuleSourceFile == null) {
      throw new Error('Could not access root module file.');
    }

    return this.importsScanner.buildSourceFileImportsMap(
      rootModuleSourceFile,
      this.project,
    );
  }
}
