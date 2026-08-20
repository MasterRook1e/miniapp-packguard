import test from "node:test";
import assert from "node:assert/strict";
import { compileGlobs, globToRegExp, matchesSelection } from "../src/glob.mjs";

test("double-star globs match nested and root files", () => {
  const regex = globToRegExp("**/*.js");
  assert.equal(regex.test("app.js"), true);
  assert.equal(regex.test("pages/home/index.js"), true);
  assert.equal(regex.test("pages/home/index.wxss"), false);
});

test("selection applies include and exclude deterministically", () => {
  const include = compileGlobs(["**/*"]);
  const exclude = compileGlobs(["**/generated/**", "**/*.map"]);
  assert.equal(matchesSelection("app.js", include, exclude), true);
  assert.equal(matchesSelection("generated/app.js", include, exclude), false);
  assert.equal(matchesSelection("app.js.map", include, exclude), false);
});
