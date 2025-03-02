#!/usr/bin/env node

/**
 * This script conditionally runs tests based on the file paths
 * It skips tests for utility files in the packages/nestjs-trpc/lib/utils/ directory
 */

const { execSync } = require('child_process');
const path = require('path');

// Get the files from lint-staged - they're passed as arguments to this script
const files = process.argv.slice(2);

// Filter out utils files
const nonUtilsFiles = files.filter(
  (file) => !file.includes('packages/nestjs-trpc/lib/utils/'),
);

// If we have non-utils files, run tests on them
if (nonUtilsFiles.length > 0) {
  try {
    console.log(
      `Running tests for ${nonUtilsFiles.length} files (excluding utils)...`,
    );

    // Set environment variable for TS Jest
    process.env.TS_JEST_DISABLE_VER_CHECKER = 'true';

    // Join the files with spaces for the command
    const fileArgs = nonUtilsFiles.join(' ');

    // Run Jest directly instead of through pnpm
    // This avoids the issue with pnpm not passing --findRelatedTests correctly
    execSync(`npx jest --no-watchman --bail --findRelatedTests ${fileArgs}`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        TS_JEST_DISABLE_VER_CHECKER: 'true',
      },
    });
  } catch (error) {
    // Exit with the same code that the test command exited with
    process.exit(error.status || 1);
  }
} else {
  console.log('No non-utility files to test, skipping tests');
}
