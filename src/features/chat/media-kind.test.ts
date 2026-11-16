import assert from "node:assert/strict";
import test from "node:test";
import { chatMediaKind, CHAT_VIDEO_EXTENSIONS } from "./media-kind";

test("video MIME accepts QuickTime and codec parameters", () => {
  assert.equal(chatMediaKind({ name: "clip.mov", type: "video/quicktime" }), "video");
  assert.equal(chatMediaKind({ name: "clip", type: "Video/MP4; codecs=avc1" }), "video");
});

test("video extensions work with empty and generic MIME", () => {
  for (const ext of CHAT_VIDEO_EXTENSIONS) {
    for (const type of ["", "application/octet-stream"]) {
      assert.equal(chatMediaKind({ name: `CLIP.${ext.toUpperCase()}`, type }), "video");
    }
  }
  assert.equal(chatMediaKind({ name: "clip.m4v", type: "application/mp4" }), "video");
});

test("images and documents remain distinct", () => {
  assert.equal(chatMediaKind({ name: "photo.heic", type: "" }), "image");
  assert.equal(chatMediaKind({ name: "photo", type: "image/jpeg" }), "image");
  assert.equal(chatMediaKind({ name: "report.pdf", type: "application/pdf" }), null);
  assert.equal(chatMediaKind({ name: "clip.mov.exe", type: "" }), null);
  assert.equal(chatMediaKind({ name: "clip.mov", type: "application/x-msdownload" }), null);
});
