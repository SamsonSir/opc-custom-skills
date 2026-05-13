#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  getUploadRetryCandidates,
  isUploadSettled,
  markUploadRetried,
  updateUploadProgressState,
} = require("./lib/upload_retry_policy");

const files = process.argv.slice(2);
const CDP_PORT = Number(process.env.QIANCHUAN_CDP_PORT || process.env.CDP_PORT || 9222);

if (files.length === 0) {
  console.error("用法: node upload_local_videos.js <file1> [file2 ...]");
  process.exit(1);
}

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`文件不存在: ${file}`);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function centerOf(rect) {
  return {
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2),
  };
}

async function waitFor(send, expression, timeoutMs = 15000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    if (result.result?.value) return true;
    await sleep(intervalMs);
  }
  return false;
}

async function dispatchMouseClick(send, rect) {
  const { x, y } = centerOf(rect);
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`请求失败: ${url} -> ${res.status}`);
  }
  return res.json();
}

async function resolveFileInputBackendNodeId(send) {
  const evalResult = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const all = Array.from(document.querySelectorAll('input[type="file"]'));
        return all.find(visible) || all[0] || null;
      })()
    `,
    returnByValue: false,
  });
  const objectId = evalResult.result?.objectId;
  if (!objectId) return null;

  try {
    const nodeRef = await send("DOM.requestNode", { objectId });
    if (!nodeRef?.nodeId) return null;
    const desc = await send("DOM.describeNode", { nodeId: nodeRef.nodeId });
    return desc?.node?.backendNodeId || null;
  } finally {
    await send("Runtime.releaseObject", { objectId }).catch(() => {});
  }
}

async function clickUploadTrigger(send) {
  return send("Runtime.evaluate", {
    expression: `
      (() => {
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        const clickMouse = (el) => {
          el.scrollIntoView({ block: 'center' });
          ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) =>
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
          );
          if (typeof el.click === 'function') el.click();
        };
        const candidates = Array.from(document.querySelectorAll('button,span,div,a')).filter((el) => {
          if (!visible(el)) return false;
          const text = textOf(el);
          return text === '点击上传' || text.includes('点击上传') || text === '本地上传';
        });
        const target = candidates.sort((a, b) => textOf(a).length - textOf(b).length)[0] || null;
        if (!target) return { ok: false, reason: 'upload trigger not found' };
        clickMouse(target);
        return { ok: true, text: textOf(target) };
      })()
    `,
    returnByValue: true,
    userGesture: true,
  });
}

async function setUploadFiles(send, uploadFiles) {
  let backendNodeId = await resolveFileInputBackendNodeId(send);
  if (!backendNodeId) {
    await clickUploadTrigger(send);
    await sleep(500);
    backendNodeId = await resolveFileInputBackendNodeId(send);
  }
  if (!backendNodeId) {
    throw new Error(`重传失败：未找到 file input，文件: ${uploadFiles.map((file) => path.basename(file)).join(", ")}`);
  }
  await send("DOM.setFileInputFiles", {
    files: uploadFiles,
    backendNodeId,
  });
}

async function deleteUploadRows(send, names) {
  return send("Runtime.evaluate", {
    expression: `
      (() => {
        const names = ${JSON.stringify(names)};
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        const clickMouse = (el) => {
          el.scrollIntoView({ block: 'center' });
          ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) =>
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
          );
          if (typeof el.click === 'function') el.click();
        };
        const pickNameNode = (layer, name) => {
          const exact = Array.from(layer.querySelectorAll('*')).filter((el) => visible(el) && textOf(el) === name);
          if (exact.length) return exact.sort((a, b) => textOf(a).length - textOf(b).length)[0];
          const fuzzy = Array.from(layer.querySelectorAll('*')).filter((el) => visible(el) && textOf(el).includes(name));
          return fuzzy.sort((a, b) => textOf(a).length - textOf(b).length)[0] || null;
        };
        const pickRowNode = (nameNode) => {
          let current = nameNode;
          for (let i = 0; i < 10 && current; i += 1) {
            const txt = textOf(current);
            if (txt && (txt.includes('删除') || txt.includes('取消上传') || current.querySelector('input[type="checkbox"]'))) {
              return current;
            }
            current = current.parentElement;
          }
          return nameNode;
        };
        const layer = Array.from(
          document.querySelectorAll('[role="dialog"], .ovui-drawer, .ovui-modal, .ovui-drawer-wrapper'),
        ).find((el) => visible(el) && ['我的视频', '上传视频', '点击上传'].some((text) => textOf(el).includes(text))) || document;

        const results = [];
        for (const name of names) {
          const anchor = pickNameNode(layer, name);
          if (!anchor) {
            results.push({ name, ok: false, reason: 'row not found' });
            continue;
          }
          const row = pickRowNode(anchor);
          const controls = Array.from(row.querySelectorAll('button,span,div,a,iconpark-icon,svg')).filter(visible);
          const target =
            controls.find((el) => textOf(el) === '删除') ||
            controls.find((el) => textOf(el).includes('删除')) ||
            controls.find((el) => textOf(el).includes('取消上传')) ||
            controls.find((el) => /delete|trash|close|remove/.test(String(el.className || ''))) ||
            null;
          if (!target) {
            results.push({ name, ok: false, reason: 'delete control not found', rowText: textOf(row).slice(0, 160) });
            continue;
          }
          clickMouse(target);
          results.push({ name, ok: true, action: textOf(target) || String(target.className || '') });
        }
        return results;
      })()
    `,
    returnByValue: true,
    userGesture: true,
  });
}

async function main() {
  const basenames = files.map((file) => path.basename(file));
  const fileByBasename = new Map(basenames.map((name, index) => [name, files[index]]));
  const targets = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const page = targets.find((item) =>
    (item.url || "").includes("qianchuan.jinritemai.com/uni-creation/product"),
  );

  if (!page) {
    throw new Error(`未找到巨量千川商品投放页面，请先在 ${CDP_PORT} 浏览器中打开创建页。`);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  let chooserEvent = null;
  const pending = new Map();

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

    if (msg.method === "Page.fileChooserOpened") {
      chooserEvent = msg.params;
    }
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

  await send("Page.enable");
  await send("DOM.enable");
  await send("Runtime.enable");
  await send("Page.bringToFront");
  await send("Page.setInterceptFileChooserDialog", { enabled: true });

  const clickSetupExpr = `
    (() => {
      const names = ${JSON.stringify(basenames)};
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      const clickMouse = (el) => {
        ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) =>
          el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
        );
        if (typeof el.click === 'function') el.click();
      };
      const pickExact = (text, preferredTag) => {
        const matches = Array.from(document.querySelectorAll('button,*')).filter(
          (node) => visible(node) && textOf(node) === text,
        );
        return matches.find((node) => node.tagName === preferredTag) || matches[0] || null;
      };
      const pickContains = (text, preferredTag) => {
        const matches = Array.from(document.querySelectorAll('button,div,span,a,*')).filter(
          (node) => visible(node) && textOf(node).includes(text),
        );
        return matches.find((node) => node.tagName === preferredTag) || matches[0] || null;
      };

      const actions = [];
      const addVideo = pickContains('添加视频', 'BUTTON') || pickContains('添加素材', 'BUTTON');
      const pageText = document.body?.innerText || '';
      if (addVideo && !pageText.includes('我的视频')) {
        clickMouse(addVideo);
        actions.push({ step: 'open_add_video', rect: addVideo.getBoundingClientRect().toJSON() });
      }

      const pickNameNode = (layer, name) => {
        const exact = Array.from(layer.querySelectorAll('*')).filter((el) => visible(el) && textOf(el) === name);
        if (exact.length) return exact.sort((a, b) => textOf(a).length - textOf(b).length)[0];
        const fuzzy = Array.from(layer.querySelectorAll('*')).filter((el) => visible(el) && textOf(el).includes(name));
        return fuzzy.sort((a, b) => textOf(a).length - textOf(b).length)[0] || null;
      };
      const pickRowNode = (nameNode) => {
        let current = nameNode;
        for (let i = 0; i < 8 && current; i += 1) {
          const txt = textOf(current);
          if (txt && (txt.includes('删除') || txt.includes('取消上传') || current.querySelector('input[type="checkbox"]'))) {
            return current;
          }
          current = current.parentElement;
        }
        return nameNode;
      };
      const layer = Array.from(
        document.querySelectorAll('[role="dialog"], .ovui-drawer, .ovui-modal, .ovui-drawer-wrapper'),
      ).find((el) => visible(el) && ['我的视频', '上传视频', '点击上传'].some((text) => textOf(el).includes(text))) || null;
      const existingReady = !!layer && names.every((name) => {
        const anchor = pickNameNode(layer, name);
        if (!anchor) return false;
        const rowText = textOf(pickRowNode(anchor));
        return !rowText.includes('取消上传') && !/\\d+%/.test(rowText);
      });
      if (existingReady) {
        return {
          actions: [...actions, { step: 'reuse_existing_videos' }],
          existingReady: true,
          uploadTrigger: null,
        };
      }

      const uploadTab = pickExact('上传视频', 'DIV') || pickContains('上传视频', 'BUTTON') || pickContains('上传视频', 'DIV');
      if (uploadTab && !/tab--active|ovui-tabs__tab--active/.test(uploadTab.className || '')) {
        clickMouse(uploadTab);
        actions.push({ step: 'switch_upload_tab', rect: uploadTab.getBoundingClientRect().toJSON() });
      }

      const uploadTrigger =
        pickExact('点击上传', 'SPAN') ||
        pickContains('点击上传', 'DIV') ||
        pickContains('本地上传', 'BUTTON') ||
        pickContains('上传视频', 'BUTTON');
      if (uploadTrigger) {
        clickMouse(uploadTrigger);
        actions.push({ step: 'click_upload_trigger', rect: uploadTrigger.getBoundingClientRect().toJSON() });
      }
      return {
        actions,
        existingReady: false,
        uploadTrigger: uploadTrigger
          ? { rect: uploadTrigger.getBoundingClientRect().toJSON(), tag: uploadTrigger.tagName, text: textOf(uploadTrigger) }
          : null,
      };
    })()
  `;

  let setupResult = await send("Runtime.evaluate", {
    expression: clickSetupExpr,
    returnByValue: true,
    userGesture: true,
  });

  for (
    let attempt = 0;
    attempt < 3 && !setupResult.result.value?.uploadTrigger && !setupResult.result.value?.existingReady;
    attempt += 1
  ) {
    await sleep(800);
    setupResult = await send("Runtime.evaluate", {
      expression: clickSetupExpr,
      returnByValue: true,
      userGesture: true,
    });
  }

  const triggerRect = setupResult.result.value?.uploadTrigger?.rect;
  if (triggerRect) {
    const { x, y } = centerOf(triggerRect);
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
  }

  const chooserStart = Date.now();
  while (!chooserEvent && Date.now() - chooserStart < 5000) {
    await sleep(100);
  }

  let backendNodeId = chooserEvent?.backendNodeId || null;
  if (!backendNodeId) {
    backendNodeId = await resolveFileInputBackendNodeId(send);
  }

  let reuseExistingVisible = false;
  if (!backendNodeId) {
    const existingRowsResult = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const names = ${JSON.stringify(basenames)};
          const visible = (el) => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          };
          const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
          const pickNameNode = (layer, name) => {
            const exact = Array.from(layer.querySelectorAll('*')).filter((el) => visible(el) && textOf(el) === name);
            if (exact.length) return exact.sort((a, b) => textOf(a).length - textOf(b).length)[0];
            const fuzzy = Array.from(layer.querySelectorAll('*')).filter((el) => visible(el) && textOf(el).includes(name));
            return fuzzy.sort((a, b) => textOf(a).length - textOf(b).length)[0] || null;
          };
          const pickRowNode = (nameNode) => {
            let current = nameNode;
            for (let i = 0; i < 8 && current; i += 1) {
              const txt = textOf(current);
              if (txt && (txt.includes('删除') || txt.includes('取消上传') || current.querySelector('input[type="checkbox"]'))) {
                return current;
              }
              current = current.parentElement;
            }
            return nameNode;
          };
          const layer = Array.from(
            document.querySelectorAll('[role="dialog"], .ovui-drawer, .ovui-modal, .ovui-drawer-wrapper'),
          ).find((el) => visible(el) && ['我的视频', '上传视频', '点击上传'].some((text) => textOf(el).includes(text))) || null;
          if (!layer) return false;
          return names.every((name) => {
            const anchor = pickNameNode(layer, name);
            if (!anchor) return false;
            const row = pickRowNode(anchor);
            const rowText = textOf(row);
            return !rowText.includes('取消上传') && !/\\d+%/.test(rowText);
          });
        })()
      `,
      returnByValue: true,
    });
    reuseExistingVisible = !!existingRowsResult.result?.value;
  }

  if (!backendNodeId && !reuseExistingVisible) {
    throw new Error("没有拦截到文件选择器，且未找到可用 file input，请确认页面已打开“添加视频”抽屉并切到“上传视频”。");
  }

  if (backendNodeId) {
    await send("DOM.setFileInputFiles", {
      files,
      backendNodeId,
    });
  }

  const statusExpr = `
    (() => {
      const names = ${JSON.stringify(basenames)};
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      const clickMouse = (el) => {
        ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) =>
          el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
        );
        if (typeof el.click === 'function') el.click();
      };
      const checkboxTarget = (input) => {
        let current = input;
        for (let i = 0; i < 6 && current; i += 1) {
          if (visible(current)) {
            const cls = String(current.className || '');
            const role = current.getAttribute?.('role') || '';
            if (
              current.tagName === 'LABEL' ||
              role === 'checkbox' ||
              /checkbox|label|wrapper|inner/.test(cls)
            ) {
              return current;
            }
          }
          current = current.parentElement;
        }
        return input?.parentElement || input;
      };
      const checkboxInput = (node) => (
        node?.matches?.('input[type="checkbox"]')
          ? node
          : node?.querySelector?.('input[type="checkbox"]') || null
      );
      const isChecked = (node) => {
        const input = checkboxInput(node);
        return !!(
          input?.checked ||
          node?.getAttribute?.('aria-checked') === 'true' ||
          /checked|selected/.test(String(node?.className || ''))
        );
      };
      const pickNameNode = (name) => {
        const exact = Array.from(document.querySelectorAll('*')).filter(
          (el) => visible(el) && textOf(el) === name,
        );
        if (exact.length) {
          return exact.sort((a, b) => textOf(a).length - textOf(b).length)[0];
        }
        const fuzzy = Array.from(document.querySelectorAll('*')).filter(
          (el) => visible(el) && textOf(el).includes(name),
        );
        if (!fuzzy.length) return null;
        return fuzzy.sort((a, b) => textOf(a).length - textOf(b).length)[0];
      };
      const pickRowNode = (nameNode) => {
        let current = nameNode;
        for (let i = 0; i < 8 && current; i += 1) {
          const txt = textOf(current);
          if (
            txt &&
            (txt.includes('删除') || txt.includes('取消上传') || !!current.querySelector('input[type="checkbox"]'))
          ) {
            return current;
          }
          current = current.parentElement;
        }
        return nameNode;
      };
      return names.map((name) => {
        const node = pickNameNode(name);
        const rowNode = node ? pickRowNode(node) : null;
        const nodeText = rowNode ? textOf(rowNode) : '';
        return {
          name,
          text: nodeText.length > 160 ? nodeText.slice(0, 160) : nodeText,
          found: !!node,
        };
      });
    })()
  `;

  let statuses = [];
  const progressState = {};
  const retryEvents = [];
  const uploadDeadline = Date.now() + 10 * 60 * 1000;

  while (Date.now() < uploadDeadline) {
    const result = await send("Runtime.evaluate", {
      expression: statusExpr,
      returnByValue: true,
    });
    statuses = result.result.value || [];
    const now = Date.now();
    updateUploadProgressState(progressState, statuses, now);

      const retryNames = getUploadRetryCandidates(progressState, now, {
        stalledMs: 3 * 60 * 1000,
        maxRetries: 2,
      });
    if (retryNames.length) {
      const deleteResult = await deleteUploadRows(send, retryNames);
      await sleep(800);
      const retryFiles = retryNames
        .map((name) => fileByBasename.get(name))
        .filter(Boolean);
      if (retryFiles.length) {
        await setUploadFiles(send, retryFiles);
      }
      markUploadRetried(progressState, retryNames, Date.now());
      retryEvents.push({
        names: retryNames,
        deleteResult: deleteResult.result?.value || [],
        retryFiles: retryFiles.map((file) => path.basename(file)),
      });
      await sleep(1000);
      continue;
    }

    const settled = statuses.every(isUploadSettled);

    if (settled) {
      break;
    }

    await sleep(1000);
  }

  const selectAllTargetResult = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        const checkboxInput = (node) => (
          node?.matches?.('input[type="checkbox"]')
            ? node
            : node?.querySelector?.('input[type="checkbox"]') || null
        );
        const checkboxTarget = (input) => {
          let current = input;
          for (let i = 0; i < 6 && current; i += 1) {
            if (visible(current)) {
              const cls = String(current.className || '');
              const role = current.getAttribute?.('role') || '';
              if (
                current.tagName === 'LABEL' ||
                role === 'checkbox' ||
                /checkbox|label|wrapper|inner/.test(cls)
              ) {
                return current;
              }
            }
            current = current.parentElement;
          }
          return input?.parentElement || input;
        };
        const layer = Array.from(
          document.querySelectorAll('[role="dialog"], .ovui-drawer, .ovui-modal, .ovui-drawer-wrapper'),
        ).find((el) => visible(el) && ['我的视频', '上传视频', '点击上传'].some((text) => textOf(el).includes(text))) || null;
        if (!layer) return { ok: false, reason: 'drawer not found before select-all' };

        const controls = Array.from(
          layer.querySelectorAll('label,[role="checkbox"],.ovui-checkbox,input[type="checkbox"]'),
        )
          .map((node) => checkboxTarget(node))
          .filter((node, index, arr) => {
            if (!node || !visible(node)) return false;
            const input = checkboxInput(node);
            if (input?.disabled) return false;
            return arr.indexOf(node) === index;
          })
          .sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return ar.top - br.top || ar.left - br.left;
          });

        const target = controls[0] || null;
        if (!target) return { ok: false, reason: 'select-all control not found' };
        const rect = target.getBoundingClientRect();
        return {
          ok: true,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          text: textOf(target),
        };
      })()
    `,
    returnByValue: true,
  });

  if (!selectAllTargetResult.result?.value?.ok) {
    throw new Error(`上传完成后未找到全选控件: ${selectAllTargetResult.result?.value?.reason || "unknown"}`);
  }

  await sleep(200);
  await dispatchMouseClick(send, selectAllTargetResult.result.value.rect);

  const selectedReady = await waitFor(
    send,
    `(() => {
      const names = ${JSON.stringify(basenames)};
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      const isChecked = (node) => {
        const input = node?.matches?.('input[type="checkbox"]')
          ? node
          : node?.querySelector?.('input[type="checkbox"]');
        return !!(
          input?.checked ||
          node?.getAttribute?.('aria-checked') === 'true' ||
          /checked|selected/.test(String(node?.className || ''))
        );
      };
      const pickNameNode = (layer, name) => {
        const exact = Array.from(layer.querySelectorAll('*')).filter((el) => visible(el) && textOf(el) === name);
        if (exact.length) return exact.sort((a, b) => textOf(a).length - textOf(b).length)[0];
        const fuzzy = Array.from(layer.querySelectorAll('*')).filter((el) => visible(el) && textOf(el).includes(name));
        return fuzzy.sort((a, b) => textOf(a).length - textOf(b).length)[0] || null;
      };
      const pickRowNode = (nameNode) => {
        let current = nameNode;
        for (let i = 0; i < 8 && current; i += 1) {
          const txt = textOf(current);
          if (txt && (txt.includes('删除') || txt.includes('取消上传') || current.querySelector('input[type="checkbox"]'))) {
            return current;
          }
          current = current.parentElement;
        }
        return nameNode;
      };
      const layer = Array.from(
        document.querySelectorAll('[role="dialog"], .ovui-drawer, .ovui-modal, .ovui-drawer-wrapper'),
      ).find((el) => visible(el) && ['我的视频', '上传视频', '点击上传'].some((text) => textOf(el).includes(text))) || document;
      return names.every((name) => {
        const anchor = pickNameNode(layer, name);
        if (!anchor) return false;
        const row = pickRowNode(anchor);
        const rowText = textOf(row);
        if (rowText.includes('不符合规范') || rowText.includes('取消上传') || /\\d+%/.test(rowText)) return false;
        const checkbox =
          row?.querySelector?.('input[type="checkbox"]') ||
          row?.querySelector?.('[role="checkbox"]') ||
          row?.querySelector?.('.ovui-checkbox') ||
          null;
        return !!checkbox && isChecked(checkbox);
      });
    })()`,
    5000,
    200,
  );

  const selectedNamesResult = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const names = ${JSON.stringify(basenames)};
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        const isChecked = (node) => {
          const input = node?.matches?.('input[type="checkbox"]')
            ? node
            : node?.querySelector?.('input[type="checkbox"]');
          return !!(
            input?.checked ||
            node?.getAttribute?.('aria-checked') === 'true' ||
            /checked|selected/.test(String(node?.className || ''))
          );
        };
        const pickNameNode = (layer, name) => {
          const exact = Array.from(layer.querySelectorAll('*')).filter((el) => visible(el) && textOf(el) === name);
          if (exact.length) return exact.sort((a, b) => textOf(a).length - textOf(b).length)[0];
          const fuzzy = Array.from(layer.querySelectorAll('*')).filter((el) => visible(el) && textOf(el).includes(name));
          return fuzzy.sort((a, b) => textOf(a).length - textOf(b).length)[0] || null;
        };
        const pickRowNode = (nameNode) => {
          let current = nameNode;
          for (let i = 0; i < 8 && current; i += 1) {
            const txt = textOf(current);
            if (txt && (txt.includes('删除') || txt.includes('取消上传') || current.querySelector('input[type="checkbox"]'))) {
              return current;
            }
            current = current.parentElement;
          }
          return nameNode;
        };
        const layer = Array.from(
          document.querySelectorAll('[role="dialog"], .ovui-drawer, .ovui-modal, .ovui-drawer-wrapper'),
        ).find((el) => visible(el) && ['我的视频', '上传视频', '点击上传'].some((text) => textOf(el).includes(text))) || document;
        return names.filter((name) => {
          const anchor = pickNameNode(layer, name);
          if (!anchor) return false;
          const row = pickRowNode(anchor);
          const rowText = textOf(row);
          if (rowText.includes('不符合规范') || rowText.includes('取消上传') || /\\d+%/.test(rowText)) return false;
          const checkbox =
            row?.querySelector?.('input[type="checkbox"]') ||
            row?.querySelector?.('[role="checkbox"]') ||
            row?.querySelector?.('.ovui-checkbox') ||
            null;
          return !!checkbox && isChecked(checkbox);
        });
      })()
    `,
    returnByValue: true,
  });

  const selectedNames = selectedNamesResult.result.value || [];
  if (!selectedNames.length) {
    throw new Error("上传完成后未选中任何可用视频，无法回填到主页面");
  }

  const getMainStateExpr = `
    (() => {
      const text = document.body?.innerText || '';
      const match = text.match(/视频\\s*\\((\\d+)\\)/);
      const count = match ? Number(match[1]) : 0;

      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      const drawerVisible = Array.from(
        document.querySelectorAll('[role="dialog"], .ovui-drawer, .ovui-modal, .ovui-drawer-wrapper'),
      ).some((el) => {
        if (!isVisible(el)) return false;
        const t = textOf(el);
        return t.includes('我的视频') || t.includes('上传视频') || t.includes('点击上传');
      });

      return { count, drawerVisible };
    })()
  `;

  const confirmTargetResult = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        const layer = Array.from(
          document.querySelectorAll('[role="dialog"], .ovui-drawer, .ovui-modal, .ovui-drawer-wrapper'),
        ).find((el) => isVisible(el) && ['我的视频', '上传视频', '点击上传'].some((text) => textOf(el).includes(text))) || null;
        if (!layer) return { ok: false, reason: 'drawer not found before confirm' };
        const confirm = Array.from(layer.querySelectorAll('button')).find((btn) => (
          isVisible(btn) &&
          ['确定', '完成'].includes(textOf(btn)) &&
          !btn.disabled &&
          btn.getAttribute('aria-disabled') !== 'true' &&
          !/disabled/.test(String(btn.className || ''))
        )) || null;
        if (!confirm) return { ok: false, reason: 'confirm button not ready' };
        confirm.scrollIntoView({ block: 'center' });
        const rect = confirm.getBoundingClientRect();
        return {
          ok: true,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          text: textOf(confirm),
        };
      })()
    `,
    returnByValue: true,
  });

  if (confirmTargetResult.result?.value?.ok) {
    await sleep(200);
    await dispatchMouseClick(send, confirmTargetResult.result.value.rect);
  }

  let mainCountReady = await waitFor(
    send,
    `(() => {
      const text = document.body?.innerText || '';
      const match = text.match(/视频\\s*\\((\\d+)\\)/);
      const count = match ? Number(match[1]) : 0;
      return count >= ${selectedNames.length};
    })()`,
    20000,
    500,
  );

  if (!mainCountReady) {
    const confirmSelection = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const isVisible = (el) => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          };
          const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
          const clickMouse = (el) => {
            ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) =>
              el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
            );
            if (typeof el.click === 'function') el.click();
          };

          const layers = Array.from(document.querySelectorAll('[role="dialog"], .ovui-modal, .ovui-drawer')).filter(isVisible);
          const targetLayer =
            layers.find((el) => {
              const t = textOf(el);
              return t.includes('我的视频') || t.includes('上传视频') || t.includes('点击上传');
            }) || layers[0] || null;

          const scope = targetLayer || document;
          const buttons = Array.from(scope.querySelectorAll('button,span,div')).filter(isVisible);
          const confirm = buttons.find((el) => textOf(el) === '确定');
          const close = buttons.find((el) => textOf(el) === '关闭' || /close|关闭/.test(el.className || ''));

          const actions = [];
          if (confirm) {
            clickMouse(confirm);
            actions.push('click_confirm');
          } else if (close) {
            clickMouse(close);
            actions.push('click_close');
          }
          return { actions };
        })()
      `,
      userGesture: true,
      returnByValue: true,
    });

    const confirmActions = confirmSelection.result?.value?.actions || [];
    mainCountReady = await waitFor(
      send,
      `(() => {
        const text = document.body?.innerText || '';
        const match = text.match(/视频\\s*\\((\\d+)\\)/);
        const count = match ? Number(match[1]) : 0;
        return count >= ${selectedNames.length};
      })()`,
      confirmActions.includes("click_confirm") ? 20000 : 15000,
      500,
    );

    if (!mainCountReady && confirmActions.includes("click_confirm")) {
      const afterConfirmState = await send("Runtime.evaluate", {
        expression: getMainStateExpr,
        returnByValue: true,
      });
      if (!afterConfirmState.result?.value?.drawerVisible) {
        mainCountReady = await waitFor(
          send,
          `(() => {
            const text = document.body?.innerText || '';
            const match = text.match(/视频\\s*\\((\\d+)\\)/);
            const count = match ? Number(match[1]) : 0;
            return count >= ${selectedNames.length};
          })()`,
          15000,
          500,
        );
      }
    }
  }

  const mainCountExpr = `
    (() => {
      const text = document.body?.innerText || '';
      const match = text.match(/视频\\s*\\((\\d+)\\)/);
      return match ? Number(match[1]) : null;
    })()
  `;

  let mainCountResult = await send("Runtime.evaluate", {
    expression: mainCountExpr,
    returnByValue: true,
  });
  let mainStateResult = await send("Runtime.evaluate", {
    expression: getMainStateExpr,
    returnByValue: true,
  });
  const closeAttempts = [];

  if (mainStateResult.result.value?.drawerVisible) {
    const closeByControls = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const isVisible = (el) => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          };
          const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
          const clickMouse = (el) => {
            ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) =>
              el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
            );
            if (typeof el.click === 'function') el.click();
          };

          const layers = Array.from(
            document.querySelectorAll('[role="dialog"], .ovui-drawer, .ovui-modal, .ovui-drawer-wrapper'),
          ).filter(isVisible);
          const layer =
            layers.find((el) => {
              const t = textOf(el);
              return t.includes('我的视频') || t.includes('上传视频') || t.includes('点击上传');
            }) || layers[0] || null;
          if (!layer) return { ok: false, reason: 'drawer not found' };

          const controls = Array.from(layer.querySelectorAll('button,span,div')).filter(isVisible);
          const confirm = controls.find((el) => textOf(el) === '确定');
          const cancel = controls.find((el) => textOf(el) === '取消');
          const closeIcon = controls.find((el) => /close|关闭/.test(el.className || '') || textOf(el) === '关闭');

          const actions = [];
          if (confirm) {
            clickMouse(confirm);
            actions.push('confirm');
          } else if (cancel) {
            clickMouse(cancel);
            actions.push('cancel');
          }
          if (closeIcon) {
            clickMouse(closeIcon);
            actions.push('close_icon');
          }
          return { ok: true, actions };
        })()
      `,
      userGesture: true,
      returnByValue: true,
    });
    closeAttempts.push({
      method: "controls",
      actions: closeByControls.result?.value?.actions || [],
    });

    await waitFor(
      send,
      `(() => {
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        const visibleDrawer = Array.from(
          document.querySelectorAll('[role="dialog"], .ovui-drawer, .ovui-modal, .ovui-drawer-wrapper'),
        ).some((el) => {
          if (!isVisible(el)) return false;
          const t = textOf(el);
          return t.includes('我的视频') || t.includes('上传视频') || t.includes('点击上传');
        });
        return !visibleDrawer;
      })()`,
      8000,
      400,
    );

    mainStateResult = await send("Runtime.evaluate", {
      expression: getMainStateExpr,
      returnByValue: true,
    });
    mainCountResult = await send("Runtime.evaluate", {
      expression: mainCountExpr,
      returnByValue: true,
    });
  }

  if (mainStateResult.result.value?.drawerVisible) {
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 53,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 53,
    });
    closeAttempts.push({ method: "escape" });

    await waitFor(
      send,
      `(() => {
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        const visibleDrawer = Array.from(
          document.querySelectorAll('[role="dialog"], .ovui-drawer, .ovui-modal, .ovui-drawer-wrapper'),
        ).some((el) => {
          if (!isVisible(el)) return false;
          const t = textOf(el);
          return t.includes('我的视频') || t.includes('上传视频') || t.includes('点击上传');
        });
        return !visibleDrawer;
      })()`,
      5000,
      300,
    );

    mainStateResult = await send("Runtime.evaluate", {
      expression: getMainStateExpr,
      returnByValue: true,
    });
    mainCountResult = await send("Runtime.evaluate", {
      expression: mainCountExpr,
      returnByValue: true,
    });
  }

  if (mainStateResult.result.value?.drawerVisible) {
    const closeByMask = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const isVisible = (el) => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          };
          const clickMouse = (el) => {
            ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) =>
              el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
            );
            if (typeof el.click === 'function') el.click();
          };

          const mask = Array.from(
            document.querySelectorAll('.ovui-modal-mask, .ovui-drawer-mask, .ovui-mask, [class*="mask"]'),
          ).find(isVisible);
          if (!mask) return { ok: false, reason: 'mask not found' };
          clickMouse(mask);
          return { ok: true };
        })()
      `,
      userGesture: true,
      returnByValue: true,
    });
    closeAttempts.push({
      method: "mask",
      ok: !!closeByMask.result?.value?.ok,
    });

    await waitFor(
      send,
      `(() => {
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        const visibleDrawer = Array.from(
          document.querySelectorAll('[role="dialog"], .ovui-drawer, .ovui-modal, .ovui-drawer-wrapper'),
        ).some((el) => {
          if (!isVisible(el)) return false;
          const t = textOf(el);
          return t.includes('我的视频') || t.includes('上传视频') || t.includes('点击上传');
        });
        return !visibleDrawer;
      })()`,
      5000,
      300,
    );

    mainStateResult = await send("Runtime.evaluate", {
      expression: getMainStateExpr,
      returnByValue: true,
    });
    mainCountResult = await send("Runtime.evaluate", {
      expression: mainCountExpr,
      returnByValue: true,
    });
  }

  ws.close();

  const payload = {
    files,
    statuses,
    retryEvents,
    selection: {
      selected: selectedNames,
      ready: selectedReady,
    },
    confirmedToMainPage:
      mainCountReady || Number(mainCountResult.result.value || 0) >= selectedNames.length,
    mainVideoCount: mainCountResult.result.value,
    drawerVisible: !!mainStateResult.result.value?.drawerVisible,
    closeAttempts,
  };

  if (!payload.confirmedToMainPage) {
    throw new Error(
      `上传抽屉已尝试确定，但主页面未完成回填，已选视频 ${selectedNames.length}，主页面视频数 ${payload.mainVideoCount}，抽屉可见=${payload.drawerVisible}`,
    );
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
