export function isConfigured(value: string | undefined) {
  return Boolean(value?.trim()) && !/^(replace-me|your-|changeme|placeholder)/i.test(value?.trim() ?? "");
}
