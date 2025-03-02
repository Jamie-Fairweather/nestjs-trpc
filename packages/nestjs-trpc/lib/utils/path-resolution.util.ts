/**
 * Path resolution utilities for handling TypeScript path aliases and tsconfig.json files
 *
 * This module provides helper functions for:
 * - Finding the nearest tsconfig.json file
 * - Resolving file paths based on TypeScript path mappings
 * - Handling relative and absolute paths
 *
 * Used primarily by the file injection feature to correctly resolve paths in monorepo projects.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { ConsoleLogger } from '@nestjs/common';

/**
 * Finds the nearest tsconfig.json file starting from the given file path
 * by traversing up the directory tree until a tsconfig.json is found or the root is reached.
 *
 * @param startPath The file path to start the search from
 * @param logger Optional logger for debugging information
 * @returns The path to the nearest tsconfig.json file or null if not found
 */
export function findTsConfigFile(
  startPath: string,
  logger?: ConsoleLogger,
): string | null {
  if (logger) {
    logger.log(
      `Looking for tsconfig.json starting from: ${startPath}`,
      'Path Resolution',
    );
  }

  let currentDir = path.dirname(startPath);
  const root = path.parse(currentDir).root;

  if (logger) {
    logger.log(`Root directory: ${root}`, 'Path Resolution');
  }

  while (currentDir !== root) {
    const tsConfigPath = path.join(currentDir, 'tsconfig.json');

    try {
      // Check if file exists
      if (fs.existsSync(tsConfigPath)) {
        if (logger) {
          logger.log(
            `Found tsconfig.json at: ${tsConfigPath}`,
            'Path Resolution',
          );
        }
        return tsConfigPath;
      }
    } catch (error) {
      if (logger) {
        logger.warn(
          `Error checking for tsconfig.json at ${tsConfigPath}: ${error}`,
          'Path Resolution',
        );
      }
    }

    if (logger) {
      logger.log(
        `No tsconfig.json found at: ${currentDir}, moving up...`,
        'Path Resolution',
      );
    }
    currentDir = path.dirname(currentDir);
  }

  if (logger) {
    logger.warn(
      `Could not find tsconfig.json in any parent directory of: ${startPath}`,
      'Path Resolution',
    );
  }
  return null;
}

/**
 * Resolves a file path with TypeScript path aliases from tsconfig
 *
 * This function handles the following path types:
 * 1. Path aliases (e.g., "@/folder/file.ts" → "./src/folder/file.ts")
 * 2. Relative paths (e.g., "./folder/file.ts")
 * 3. Absolute paths (e.g., "/usr/folder/file.ts" or "C:\folder\file.ts")
 *
 * Path aliases are resolved based on the tsconfig.json path mappings.
 * For example, with the following tsconfig.json paths:
 * ```json
 * {
 *   "compilerOptions": {
 *     "paths": {
 *       "@/*": ["./src/*"]
 *     }
 *   }
 * }
 * ```
 *
 * A path like "@/zod/index.ts" will be resolved to "./src/zod/index.ts"
 * relative to the tsconfig.json file location.
 *
 * @param filePath The file path to resolve
 * @param pathAliases The path aliases from tsconfig.json
 * @param basePath The base path (usually the directory of tsconfig.json)
 * @param logger Optional logger for debugging information
 * @returns The resolved absolute path or null if it couldn't be resolved
 */
export function resolvePathWithAliases(
  filePath: string,
  pathAliases: Record<string, string[]>,
  basePath: string,
  logger?: ConsoleLogger,
): string | null {
  try {
    // If it's already an absolute path, return it
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    // Special handling for alias paths like @/path or ~/*
    for (const [alias, targets] of Object.entries(pathAliases)) {
      if (!targets.length) continue;

      // Convert path patterns to match the file path format
      // e.g., "@/*" becomes "@/" for checking if filePath starts with it
      const aliasPrefix = alias.replace(/\/\*$/, '/');

      if (filePath.startsWith(aliasPrefix)) {
        // Get the part of the file path after the alias prefix
        // e.g., for "@/foo/bar.ts" and "@/" prefix, get "foo/bar.ts"
        const pathSuffix = filePath.slice(aliasPrefix.length);

        // Get the first target path pattern
        const targetPattern = targets[0];

        // Convert target pattern by removing trailing /* if present
        // e.g., "./src/*" becomes "./src/"
        const targetPrefix = targetPattern.replace(/\/\*$/, '/');

        // Combine the target prefix with the path suffix
        // e.g., "./src/" + "foo/bar.ts" becomes "./src/foo/bar.ts"
        const relativePath = targetPrefix + pathSuffix;

        // Resolve relative to the tsconfig directory
        const fullPath = path.resolve(basePath, relativePath);

        if (logger) {
          logger.log(
            `Resolved alias path: 
            - Original: ${filePath}
            - Alias: ${alias} -> ${targetPattern}
            - Path suffix: ${pathSuffix}
            - Relative path: ${relativePath}
            - Full resolved path: ${fullPath}`,
            'Path Resolution',
          );
        }

        return fullPath;
      }
    }

    // Handle regular relative paths
    if (filePath.startsWith('./') || filePath.startsWith('../')) {
      const fullPath = path.resolve(basePath, filePath);
      if (logger) {
        logger.log(
          `Resolved relative path: ${filePath} -> ${fullPath}`,
          'Path Resolution',
        );
      }
      return fullPath;
    }

    // For non-relative and non-alias paths, try to resolve relative to basePath
    const fullPath = path.resolve(basePath, filePath);
    if (logger) {
      logger.log(
        `Resolved non-alias path: ${filePath} -> ${fullPath}`,
        'Path Resolution',
      );
    }
    return fullPath;
  } catch (error) {
    if (logger) {
      logger.warn(
        `Error resolving path alias for ${filePath}: ${error}`,
        'Path Resolution',
      );
    }
    return null;
  }
}
