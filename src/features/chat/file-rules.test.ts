import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadMethod, filePreviewKind, validateFileChoice, MAX_FILE_BYTES } from "./file-rules";
test("25 MB boundary and one file validation", () => {
  assert.equal(MAX_FILE_BYTES, 26214400);
  assert.equal(validateFileChoice({ name: "document.pdf", size: 26214400 }), null);
  assert.equal(validateFileChoice({ name: "document.pdf", size: 26214401 }), "Файл больше 25 МБ");
});
test("executable and SVG extensions rejected", () => { for (const ext of ["exe","js","html","svg","sh","apk","msi"]) assert.equal(validateFileChoice({ name: `file.${ext}`, size: 10 }), "Этот тип файла запрещён"); });
test("card preview types", () => {
  assert.equal(filePreviewKind("application/pdf"), "pdf"); assert.equal(filePreviewKind("text/plain; charset=utf-8"), "text"); assert.equal(filePreviewKind("text/csv; charset=utf-8"), "text"); assert.equal(filePreviewKind("image/png"), "image"); assert.equal(filePreviewKind("application/zip"), "download");
});
test("iPhone uses file share or open, desktop download", () => { assert.equal(downloadMethod(true,true,true), "share"); assert.equal(downloadMethod(true,false,true), "open"); assert.equal(downloadMethod(false,false,true), "download"); assert.equal(downloadMethod(false,false,false), "open"); });