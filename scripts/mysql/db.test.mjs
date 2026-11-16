import assert from "node:assert/strict";
import test from "node:test";
import { assertMySql8, getConnectionOptions } from "./db.mjs";

test("requires a MySQL URL with a database name", () => {
  assert.throws(() => getConnectionOptions(undefined), /DATABASE_URL is not set/);
  assert.throws(
    () => getConnectionOptions("postgres://localhost/matchpoin"),
    /must use mysql:\/\//
  );
  assert.throws(
    () => getConnectionOptions("mysql://localhost"),
    /include a host and database name/
  );
});

test("allows local MySQL without remote TLS options", () => {
  const options = getConnectionOptions("mysql://user:password@127.0.0.1:3306/matchpoin", {
    multipleStatements: true,
  });

  assert.equal(options.uri, "mysql://user:password@127.0.0.1:3306/matchpoin");
  assert.equal(options.multipleStatements, true);
});

test("requires verified TLS for remote MySQL connections", () => {
  assert.throws(
    () => getConnectionOptions("mysql://user:password@db.example.com:3306/matchpoin"),
    /must configure TLS/
  );
  assert.throws(
    () => getConnectionOptions("mysql://user:password@db.example.com/matchpoin?ssl=false"),
    /verified TLS configuration/
  );
  assert.throws(
    () =>
      getConnectionOptions(
        "mysql://user:password@db.example.com/matchpoin?ssl=%7B%22rejectUnauthorized%22%3Afalse%7D"
      ),
    /verified TLS configuration/
  );
  assert.doesNotThrow(() =>
    getConnectionOptions(
      "mysql://user:password@db.example.com/matchpoin?ssl=%7B%22rejectUnauthorized%22%3Atrue%7D"
    )
  );
});

test("accepts MySQL 8+ and rejects MariaDB or older versions", async () => {
  const fakeConnection = (version, versionComment) => ({
    query: async () => [[{ version, version_comment: versionComment }], []],
  });

  assert.equal(await assertMySql8(fakeConnection("8.0.36", "MySQL Community Server")), "8.0.36");
  await assert.rejects(
    assertMySql8(fakeConnection("10.6.18-MariaDB", "MariaDB Server")),
    /MariaDB was detected/
  );
  await assert.rejects(
    assertMySql8(fakeConnection("5.7.44", "MySQL Community Server")),
    /MySQL 8.0 or newer is required/
  );
});
