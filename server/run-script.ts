/**
 * Runs a script's `main`, prints a failure as one readable message and exits non-zero. The repository is CommonJS
 * (no "type": "module"), so a script cannot use top-level await under tsx.
 */
export function runScript(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
