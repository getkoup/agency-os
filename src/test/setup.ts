const originalDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl)
  throw new Error("TEST_DATABASE_URL is required for tests");
const testName = new URL(testDatabaseUrl).pathname.slice(1);
if (!testName.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must target a database ending in _test");
}
if (originalDatabaseUrl === testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
}
process.env.DATABASE_URL = testDatabaseUrl;
