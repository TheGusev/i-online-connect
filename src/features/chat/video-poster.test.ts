import assert from "node:assert/strict";
import test from "node:test";
import { videoPosterUrl } from "./video-poster";

const user = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";

test("video poster uses configured API base and parent video identity", () => {
  for (const prefix of ["/media", "/uploads", "/api/media-file"]) {
    assert.equal(videoPosterUrl(`${prefix}/chat/${user}/${id}.mp4`, "https://api.example/api/"),
      `https://api.example/api/chat-video-poster/${user}/${id}.jpg`);
  }
});

test("absolute media URL still builds poster on configured API", () => {
  assert.equal(videoPosterUrl(`https://media.example/media/chat/${user}/${id}.mp4`, "/api"),
    `/api/chat-video-poster/${user}/${id}.jpg`);
});

test("local previews and unrelated paths have no derived poster", () => {
  for (const source of ["blob:test", "data:video/mp4,test", "/assets/movie.mp4",
    `/media/chat/${user}/${id}.webm`, `/media/chat/${user}/../secret.mp4`]) {
    assert.equal(videoPosterUrl(source, "/api"), undefined);
  }
});
