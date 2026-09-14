export function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && "code" in err && err.code === "ENOENT";
}
