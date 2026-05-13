const DEFAULT_PORT = Number(process.env.QIANCHUAN_CDP_PORT || process.env.CDP_PORT || 9222);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`请求失败: ${url} -> ${res.status}`);
  }
  return res.json();
}

async function listTargets(port = DEFAULT_PORT) {
  return fetchJson(`http://127.0.0.1:${port}/json/list`);
}

async function findQianchuanProductTarget(port = DEFAULT_PORT) {
  const targets = await listTargets(port);
  return targets.find((item) =>
    (item.url || "").includes("qianchuan.jinritemai.com/uni-creation/product"),
  );
}

async function connectToTarget(target) {
  if (!target?.webSocketDebuggerUrl) {
    throw new Error("目标 tab 缺少 webSocketDebuggerUrl");
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data.toString());

    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(JSON.stringify(msg.error)));
      } else {
        resolve(msg.result);
      }
      return;
    }

    if (msg.method) events.push(msg);
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const currentId = ++id;
      pending.set(currentId, { resolve, reject });
      ws.send(JSON.stringify({ id: currentId, method, params }));
    });

  const close = () => {
    try {
      ws.close();
    } catch (_) {
      // no-op
    }
  };

  return { ws, send, close, events };
}

async function connectQianchuanProductPage(port = DEFAULT_PORT) {
  const target = await findQianchuanProductTarget(port);
  if (!target) {
    throw new Error("未找到巨量千川商品投放创建页，请先打开 /uni-creation/product?aavid=<aavid>");
  }

  const client = await connectToTarget(target);
  await client.send("Page.enable");
  await client.send("DOM.enable");
  await client.send("Runtime.enable");
  await client.send("Page.bringToFront");
  return { target, ...client };
}

async function evaluate(client, expression, options = {}) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    userGesture: !!options.userGesture,
    awaitPromise: !!options.awaitPromise,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result?.value;
}

function jsString(value) {
  return JSON.stringify(String(value));
}

module.exports = {
  DEFAULT_PORT,
  sleep,
  fetchJson,
  listTargets,
  findQianchuanProductTarget,
  connectToTarget,
  connectQianchuanProductPage,
  evaluate,
  jsString,
};
