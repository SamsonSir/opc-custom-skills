#!/usr/bin/env node

const assert = require("assert");
const {
  getUploadRetryCandidates,
  updateUploadProgressState,
} = require("../scripts/lib/upload_retry_policy");

const state = {};
updateUploadProgressState(
  state,
  [
    { name: "ok.mp4", text: "ok.mp4 100%", found: true },
    { name: "stuck.mp4", text: "stuck.mp4 83% 取消上传", found: true },
  ],
  0,
);

updateUploadProgressState(
  state,
  [
    { name: "ok.mp4", text: "ok.mp4 删除", found: true },
    { name: "stuck.mp4", text: "stuck.mp4 83% 取消上传", found: true },
  ],
  21000,
);

assert.deepStrictEqual(
  getUploadRetryCandidates(state, 21000, { stalledMs: 20000, maxRetries: 2 }),
  ["stuck.mp4"],
);

state["stuck.mp4"].retries = 2;
assert.deepStrictEqual(
  getUploadRetryCandidates(state, 42000, { stalledMs: 20000, maxRetries: 2 }),
  [],
);

console.log("upload_retry_policy tests passed");
