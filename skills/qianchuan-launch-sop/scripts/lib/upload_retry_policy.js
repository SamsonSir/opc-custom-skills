function parseProgress(text) {
  const match = String(text || "").match(/(\d+(?:\.\d+)?)%/);
  return match ? Number(match[1]) : null;
}

function isUploadInProgress(status) {
  const text = String(status?.text || "");
  const progress = parseProgress(text);
  return (
    status?.found &&
    progress != null &&
    progress < 100 &&
    !text.includes("不符合规范")
  );
}

function isUploadSettled(status) {
  const text = String(status?.text || "");
  if (!status?.found) return false;
  if (text.includes("不符合规范")) return true;
  if (text.includes("取消上传")) return false;
  if (/\d+%/.test(text)) return false;
  return true;
}

function updateUploadProgressState(state, statuses, now = Date.now()) {
  for (const status of statuses || []) {
    const name = status?.name;
    if (!name) continue;
    const progress = parseProgress(status.text);
    const previous = state[name] || {
      progress: null,
      changedAt: now,
      retries: 0,
      lastText: "",
    };

    if (progress !== previous.progress || String(status.text || "") !== previous.lastText) {
      previous.progress = progress;
      previous.changedAt = now;
      previous.lastText = String(status.text || "");
    }

    previous.inProgress = isUploadInProgress(status);
    previous.settled = isUploadSettled(status);
    state[name] = previous;
  }
  return state;
}

function getUploadRetryCandidates(state, now = Date.now(), options = {}) {
  const stalledMs = options.stalledMs ?? 20000;
  const maxRetries = options.maxRetries ?? 2;
  return Object.entries(state)
    .filter(([, item]) => (
      item.inProgress &&
      !item.settled &&
      item.retries < maxRetries &&
      now - item.changedAt >= stalledMs
    ))
    .map(([name]) => name);
}

function markUploadRetried(state, names, now = Date.now()) {
  for (const name of names || []) {
    if (!state[name]) continue;
    state[name].retries += 1;
    state[name].changedAt = now;
  }
  return state;
}

module.exports = {
  getUploadRetryCandidates,
  isUploadInProgress,
  isUploadSettled,
  markUploadRetried,
  parseProgress,
  updateUploadProgressState,
};
