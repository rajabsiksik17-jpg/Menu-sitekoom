/**
 * Creates (or resets) a platform administrator:
 *   npm run admin:create -- owner@sitekoom.com "Mohammad" "a-long-password"
 * Passing the password on the command line leaves it in the shell history; you can omit it and set ADMIN_PASSWORD instead.
 */
async function main() {
  const [email, name, passwordArg] = process.argv.slice(2);
  const password = passwordArg ?? process.env.ADMIN_PASSWORD;
  if (!email || !name || !password) {
    console.error('Usage: npm run admin:create -- <email> "<name>" [password]   (or ADMIN_PASSWORD=...)');
    process.exit(2);
  }
  const { getDb } = await import("../src/db");
  const { createAdmin } = await import("../src/server/admins");
  const a = await createAdmin(await getDb(), email, name, password);
  console.log(`Administrator ready: ${a.email}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

export {};
