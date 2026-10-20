import { test } from "node:test";
import assert from "node:assert/strict";

import { isNearBottom } from "./scroll";

test("isNearBottom: у самого низа", () => assert.equal(isNearBottom(600, 400, 1000), true));
test("isNearBottom: в пределах 120 px", () => assert.equal(isNearBottom(480, 400, 1000), true));
test("isNearBottom: дальше 120 px", () => assert.equal(isNearBottom(479, 400, 1000), false));
test("isNearBottom: свой порог", () => assert.equal(isNearBottom(500, 400, 1000, 50), false));
