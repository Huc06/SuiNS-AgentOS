export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printError(message: string): never {
  console.error(`agentos: ${message}`);
  process.exit(1);
}
