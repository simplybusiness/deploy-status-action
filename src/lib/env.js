// Ruby's ENV.fetch: only a missing variable is an error, an empty one is fine
export function fetchEnv(name) {
  const value = process.env[name];
  if (value === undefined) throw new Error(`key not found: "${name}"`);
  return value;
}
