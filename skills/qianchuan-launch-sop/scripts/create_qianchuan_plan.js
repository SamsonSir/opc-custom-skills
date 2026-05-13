#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  connectQianchuanProductPage,
  evaluate,
  jsString,
  sleep,
} = require("./lib/qc_cdp");
const { generateTitles } = require("./generate_title");

const SCRIPT_DIR = __dirname;

function nowIso() {
  return new Date().toISOString();
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}小时`);
  if (minutes || hours) parts.push(`${minutes}分`);
  parts.push(`${seconds}秒`);
  return parts.join("");
}

function buildTiming(startMs, startedAt) {
  const endedAt = nowIso();
  const elapsedMs = Date.now() - startMs;
  return {
    started_at: startedAt,
    ended_at: endedAt,
    elapsed_ms: elapsedMs,
    elapsed_human: formatDuration(elapsedMs),
  };
}

function usage() {
  console.error(`用法:
  create_qianchuan_plan.js --config <launch.json>
  create_qianchuan_plan.js --product-id <id> --sale-price <售价> --unit-cost <成本> --sign-rate <签收率> --material-dir <目录> [options]

必填:
  --product-id      商品 ID
  --sale-price      售价
  --unit-cost       成本价
  --sign-rate       签收率，支持 0.55 或 55
  --ship-rate       发货率，支持 0.9 或 90，默认 0.9
  --material-dir    素材目录

可选:
  --product-name    商品名，缺失时从页面商品卡提取
  --title           投流标题，缺失时按商品名生成
  --daily-budget    日预算，默认 300
  --publish         填完后点击发布计划；兼容参数，当前默认自动发布
  --no-publish      只配置到发布前，不点击发布计划
  --publish-only    只处理当前页面的发布/确认发布，不重走商品/素材/标题流程
  --dry-run         只计算和检查，不填写页面
`);
}

function parseRate(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} 不是有效数字: ${value}`);
  return n > 1 ? n / 100 : n;
}

function num(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} 不是有效数字: ${value}`);
  return n;
}

function parseArgs(argv) {
  let cfg = { daily_budget: 300, dry_run: false, publish: true, ship_rate: 0.9 };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} 缺少值`);
      return argv[i];
    };

    if (arg === "--config") {
      cfg = { ...cfg, ...JSON.parse(fs.readFileSync(next(), "utf8")) };
    } else if (arg === "--product-id") cfg.product_id = next();
    else if (arg === "--product-name") cfg.product_name = next();
    else if (arg === "--sale-price") cfg.sale_price = num(next(), arg);
    else if (arg === "--unit-cost") cfg.unit_cost = num(next(), arg);
    else if (arg === "--sign-rate") cfg.sign_rate = parseRate(next(), arg);
    else if (arg === "--ship-rate") cfg.ship_rate = parseRate(next(), arg);
    else if (arg === "--material-dir") cfg.material_dir = next();
    else if (arg === "--title") cfg.title = next();
    else if (arg === "--daily-budget") cfg.daily_budget = num(next(), arg);
    else if (arg === "--publish") cfg.publish = true;
    else if (arg === "--no-publish") cfg.publish = false;
    else if (arg === "--publish-only") {
      cfg.publish = true;
      cfg.publish_only = true;
    }
    else if (arg === "--dry-run") cfg.dry_run = true;
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }

  const required = cfg.publish_only
    ? []
    : ["product_id", "sale_price", "unit_cost", "sign_rate", "material_dir"];
  for (const key of required) {
    if (cfg[key] == null || cfg[key] === "") throw new Error(`缺少 ${key}`);
  }
  if (cfg.product_id != null) cfg.product_id = String(cfg.product_id);
  if (cfg.material_dir != null) cfg.material_dir = path.resolve(cfg.material_dir);
  return cfg;
}

function runNode(script, args) {
  const res = spawnSync("node", [script, ...args], { encoding: "utf8" });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  return res.stdout;
}

function calcRoi(cfg) {
  const stdout = runNode(path.join(SCRIPT_DIR, "calc_roi.js"), [
    "--sale-price",
    String(cfg.sale_price),
    "--unit-cost",
    String(cfg.unit_cost),
    "--sign-rate",
    String(cfg.sign_rate),
    "--ship-rate",
    String(cfg.ship_rate),
  ]);
  const payload = JSON.parse(stdout);
  if (!payload.result?.ok) throw new Error(payload.result?.reason || "ROI 计算失败");
  return payload.result;
}

function collectUploadVideos(cfg) {
  if (!fs.existsSync(cfg.material_dir) || !fs.statSync(cfg.material_dir).isDirectory()) {
    throw new Error(`素材目录不存在或不是目录: ${cfg.material_dir}`);
  }
  const files = fs
    .readdirSync(cfg.material_dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp4"))
    .map((entry) => path.join(cfg.material_dir, entry.name))
    .sort();

  if (!files.length) {
    throw new Error(`素材目录下没有 .mp4 文件: ${cfg.material_dir}`);
  }
  return files;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function uploadVideosInBatches(uploadVideos) {
  const maxFilesPerUpload = 19;
  const chunks = chunkArray(uploadVideos, maxFilesPerUpload);
  if (chunks.length === 1) {
    return JSON.parse(runNode(path.join(SCRIPT_DIR, "upload_local_videos.js"), chunks[0]));
  }

  const batchResults = chunks.map((chunk, index) => ({
    index: index + 1,
    files: chunk.map((file) => path.basename(file)),
    result: JSON.parse(runNode(path.join(SCRIPT_DIR, "upload_local_videos.js"), chunk)),
  }));
  const selected = batchResults.flatMap((batch) => batch.result.selection?.selected || []);
  const lastResult = batchResults[batchResults.length - 1]?.result || {};
  return {
    action: "batch_upload",
    batch_size: maxFilesPerUpload,
    batches: batchResults,
    selection: { selected },
    confirmedToMainPage: batchResults.every((batch) => batch.result.confirmedToMainPage),
    mainVideoCount: lastResult.mainVideoCount,
    drawerVisible: lastResult.drawerVisible,
  };
}

function buildPlanName(cfg) {
  const now = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
  return `${stamp}_商品全域投放`.slice(0, 50);
}

async function getPageState(client) {
  return evaluate(
    client,
    `(() => {
      const text = document.body?.innerText || "";
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      const all = Array.from(document.querySelectorAll('*'));
      const findInputByLabel = (label) => {
        const node = all.find((el) => visible(el) && textOf(el) === label);
        if (!node) return null;
        let root = node.parentElement;
        for (let i = 0; i < 10 && root; i += 1) {
          const input = root.querySelector('input');
          if (input && visible(input)) return input;
          root = root.parentElement;
        }
        return null;
      };
      const productMatch = text.match(/ID:\\s*([0-9]+)/);
      const videoMatch = text.match(/视频\\s*\\((\\d+)\\)/);
      const addedMatches = Array.from(text.matchAll(/已添加：([0-9]+)\\/30/g)).map((m) => Number(m[1]));
      const budgetInput = findInputByLabel('日预算');
      const roiInput = findInputByLabel('净成交ROI目标');
      return {
        title: document.title,
        url: location.href,
        product_id: productMatch ? productMatch[1] : null,
        product_count: addedMatches.length ? addedMatches[0] : null,
        video_count: videoMatch ? Number(videoMatch[1]) : null,
        title_count: addedMatches.length > 1 ? addedMatches[1] : null,
        has_publish: text.includes('发布计划'),
        budget_value: budgetInput ? budgetInput.value : null,
        roi_value: roiInput ? roiInput.value : null,
        has_roi_input: !!roiInput,
      };
    })()`,
  );
}

async function fillInputNearLabel(client, label, value) {
  return evaluate(
    client,
    `(() => {
      const label = ${jsString(label)};
      const value = ${jsString(value)};
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      const all = Array.from(document.querySelectorAll('*'));
      const node = all.find((el) => visible(el) && textOf(el) === label);
      if (!node) return { ok: false, reason: 'label not found' };
      let root = node.parentElement;
      for (let i = 0; i < 12 && root; i += 1) {
        const input = Array.from(root.querySelectorAll('input, textarea')).find(visible);
        if (input) {
          const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          input.focus();
          if (setter) setter.call(input, '');
          else input.value = '';
          input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
          if (setter) setter.call(input, value);
          else input.value = value;
          input.setAttribute('value', value);
          input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.blur();
          return { ok: true, value: input.value, label, rootText: textOf(root).slice(0, 120) };
        }
        root = root.parentElement;
      }
      return { ok: false, reason: 'input not found' };
    })()`,
    { userGesture: true },
  );
}

async function ensurePlanName(client, planName) {
  const filled = await fillInputNearLabel(client, "计划名称", planName);
  if (!filled?.ok) {
    throw new Error(filled?.reason || "计划名称填写失败");
  }

  const stable = await waitFor(
    client,
    `(() => {
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      const label = Array.from(document.querySelectorAll('*')).find((el) => visible(el) && textOf(el) === '计划名称');
      if (!label) return false;
      let root = label.parentElement;
      for (let i = 0; i < 10 && root; i += 1) {
        const input = Array.from(root.querySelectorAll('input, textarea')).find(visible);
        if (input) return String(input.value || '').trim() === ${jsString(planName)};
        root = root.parentElement;
      }
      return false;
    })()`,
    5000,
    300,
  );

  if (!stable) {
    throw new Error(`计划名称回填未稳定: ${planName}`);
  }
  return { ok: true, plan_name: planName };
}

async function waitFor(client, predicateExpression, timeoutMs = 15000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await evaluate(client, predicateExpression);
    if (ok) return true;
    await sleep(intervalMs);
  }
  return false;
}

async function dismissBlockingAlerts(client) {
  return evaluate(
    client,
    `(() => {
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
      const scope = Array.from(document.querySelectorAll('[role="dialog"], .ovui-modal, .ovui-dialog, .ovui-message, .ovui-notification')).find((el) => {
        if (!visible(el)) return false;
        const txt = textOf(el);
        return txt.includes('发布失败') || txt.includes('失败原因') || txt.includes('标题长度必须为');
      }) || null;
      if (!scope) return { ok: true, dismissed: false };
      const btn = Array.from(scope.querySelectorAll('button')).find((node) => {
        const txt = textOf(node);
        return visible(node) && ['我知道了', '知道了', '确定', '关闭'].includes(txt) && !node.disabled;
      }) || null;
      if (!btn) return { ok: false, reason: 'blocking alert close button not found', text: textOf(scope).slice(0, 200) };
      clickMouse(btn);
      return { ok: true, dismissed: true, text: textOf(scope).slice(0, 200), button: textOf(btn) };
    })()`,
    { userGesture: true },
  );
}

async function dispatchMouseClick(client, rect) {
  if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) {
    throw new Error("缺少可点击元素坐标");
  }
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + rect.height / 2);
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none",
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

function normalizeNumericString(value) {
  const n = Number(String(value || "").trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

function numericCloseEnough(actual, expected, epsilon = 0.01) {
  if (actual == null || expected == null) return false;
  return Math.abs(actual - expected) <= epsilon;
}

async function ensureCostControlMode(client) {
  await evaluate(
    client,
    `(() => {
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
      const costMode = Array.from(document.querySelectorAll('button,*')).find(
        (el) => visible(el) && textOf(el) === '控成本投放',
      );
      if (!costMode) return { ok: false, reason: '控成本投放按钮未找到' };
      clickMouse(costMode);
      return { ok: true };
    })()`,
    { userGesture: true },
  );

  const ready = await waitFor(
    client,
    `(() => (document.body?.innerText || '').includes('净成交ROI目标'))()`,
    7000,
    500,
  );
  if (!ready) {
    throw new Error("切换控成本投放后未出现 ROI 输入区");
  }
}

async function ensureBudgetAndRoi(client, budget, roi) {
  const budgetString = String(budget);
  const roiString = Number(roi).toFixed(2);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await fillInputNearLabel(client, "日预算", budgetString);
    await fillInputNearLabel(client, "净成交ROI目标", roiString);
    await sleep(1000);

    const state = await getPageState(client);
    const budgetOk = numericCloseEnough(normalizeNumericString(state.budget_value), Number(budgetString), 0.001);
    const roiOk = numericCloseEnough(normalizeNumericString(state.roi_value), Number(roiString), 0.001);
    if (budgetOk && roiOk) {
      await sleep(1200);
      const stableState = await getPageState(client);
      const budgetStable = numericCloseEnough(normalizeNumericString(stableState.budget_value), Number(budgetString), 0.001);
      const roiStable = numericCloseEnough(normalizeNumericString(stableState.roi_value), Number(roiString), 0.001);
      if (budgetStable && roiStable) return stableState;
    }
  }

  throw new Error(`预算/ROI 回填未稳定，目标 budget=${budgetString}, roi=${roiString}`);
}

async function resetProductCreationPage(client) {
  await evaluate(
    client,
    `(() => {
      const url = new URL(location.href);
      url.searchParams.set('_qc_reset_ts', String(Date.now()));
      location.href = url.toString();
      return true;
    })()`,
    { userGesture: true },
  );
  const loaded = await waitFor(
    client,
    `(() => {
      const text = document.body?.innerText || "";
      return location.href.includes('/uni-creation/product') && text.includes('选择要投放的商品');
    })()`,
    30000,
    1000,
  );
  if (!loaded) throw new Error("重置商品创建页超时");
}

async function openProductPicker(client) {
  const opened = await evaluate(
    client,
    `(() => {
      const visible = (el) => {
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
      const candidates = Array.from(document.querySelectorAll('button,*')).filter((el) => {
        const text = (el.innerText || '').trim();
        return visible(el) && (text === '继续添加商品' || text === '添加商品');
      });
      const button = candidates.find((el) => el.tagName === 'BUTTON') || candidates[0];
      if (!button) return { ok: false, reason: 'add product button not found' };
      button.scrollIntoView({ block: 'center' });
      clickMouse(button);
      return { ok: true };
    })()`,
    { userGesture: true },
  );
  if (!opened?.ok) throw new Error(opened?.reason || "打开商品选择弹层失败");

  const ready = await waitFor(
    client,
    `(() => {
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      return Array.from(document.querySelectorAll('[role="dialog"], .ovui-modal, .ovui-drawer, .ovui-modal-wrap, .ovui-dialog')).some((el) => {
        if (!visible(el)) return false;
        const txt = textOf(el);
        const hasSearchInput = !!Array.from(el.querySelectorAll('input, textarea')).find((node) => visible(node));
        const hasConfirmButton = !!Array.from(el.querySelectorAll('button')).find((node) => visible(node) && ['确定', '完成'].includes(textOf(node)));
        return (txt.includes('已选') || txt.includes('查看全部可投商品') || txt.includes('商品')) && hasSearchInput && hasConfirmButton;
      });
    })()`,
    15000,
    500,
  );
  if (!ready) throw new Error("商品选择弹层未就绪");
}

async function searchAndAddProduct(client, productId, productName) {
  const targetProductOnMainPage = async () =>
    evaluate(
      client,
      `(() => {
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        const pageText = (document.body?.innerText || '').replace(/\\s+/g, ' ');
        const visibleDialog = Array.from(document.querySelectorAll('[role="dialog"], .ovui-modal, .ovui-drawer')).some((el) => {
          if (!visible(el)) return false;
          const txt = textOf(el);
          return (
            txt.includes('请输入商品名称/ID搜索') ||
            txt.includes('查看全部可投商品') ||
            txt.includes('已选 0/30') ||
            txt.includes('已选 1/30')
          );
        });
        return (
          pageText.includes(${jsString(productId)}) &&
          (/已添加[:：]\\s*1\\/30/.test(pageText) || /继续添加商品/.test(pageText)) &&
          !visibleDialog
        );
      })()`,
    );

  const setSearchAndUnfilter = async () => {
    const result = await evaluate(
      client,
      `(() => {
        const productId = ${jsString(productId)};
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
        const setValue = (input, value) => {
          input.focus();
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };

        const dialogRoot = Array.from(document.querySelectorAll('[role="dialog"], .ovui-modal, .ovui-drawer, .ovui-modal-wrap, .ovui-dialog')).find((el) => {
          if (!visible(el)) return false;
          const txt = textOf(el);
          return txt.includes('已选') || txt.includes('查看全部可投商品') || txt.includes('商品');
        });
        if (!dialogRoot) return { ok: false, reason: 'product dialog not found' };

        const inputs = Array.from(dialogRoot.querySelectorAll('input, textarea')).filter(visible);
        const searchInput =
          inputs.find((el) => /商品|搜索|链接|ID/i.test(el.placeholder || '')) ||
          inputs.find((el) => (el.value || '') === '') ||
          null;
        if (!searchInput) return { ok: false, reason: 'search input not found' };
        const labels = Array.from(dialogRoot.querySelectorAll('label')).filter((el) => visible(el));
        for (const label of labels) {
          const txt = textOf(label);
          if (!txt.includes('只看未投放商品') && !txt.includes('只看跑量优选商品')) continue;
          const input = label.querySelector('input[type="checkbox"]');
          if (input && input.checked) clickMouse(label);
        }

        setValue(searchInput, productId);

        const searchButton = Array.from(dialogRoot.querySelectorAll('button,*')).find((el) => {
          if (!visible(el)) return false;
          const text = textOf(el);
          return text === '搜索' || text === '查询' || /search|icon-search/.test(el.className || '');
        });
        if (searchButton) clickMouse(searchButton);
        else searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));

        const showAll = Array.from(dialogRoot.querySelectorAll('button,*')).find(
          (el) => visible(el) && textOf(el) === '查看全部可投商品',
        );
        if (showAll) clickMouse(showAll);

        return { ok: true };
      })()`,
      { userGesture: true },
    );
    if (!result?.ok) throw new Error(result?.reason || "商品搜索失败");
  };

  const chooseRow = async () => {
    return evaluate(
      client,
      `(() => {
        const productId = ${jsString(productId)};
        const productName = ${jsString(productName || "")};
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

        const dialogRoot = Array.from(document.querySelectorAll('*')).find((el) => {
          if (!visible(el)) return false;
          const txt = textOf(el);
          return txt.includes('请输入商品名称/ID搜索') && txt.includes('已选');
        }) || document.body;

        const candidates = Array.from(dialogRoot.querySelectorAll('*')).filter((el) => {
          if (!visible(el)) return false;
          const txt = textOf(el);
          return txt.includes(productId) || (productName && txt.includes(productName.slice(0, 12)));
        }).sort((a, b) => textOf(a).length - textOf(b).length);
        if (!candidates.length) return { ok: false, reason: 'product row not found' };

        const anchor = candidates.find((el) => textOf(el).includes(productId)) || candidates[0];
        let row =
          anchor.closest?.('.card-product-item') ||
          anchor.closest?.('.card-container') ||
          anchor.closest?.('[class*="product-item"]') ||
          null;

        if (!row) {
          row = anchor;
          for (let i = 0; i < 12 && row; i += 1) {
            const txt = textOf(row);
            const cls = row.className || '';
            if (
              txt.includes(productId) &&
              !txt.includes('商品信息 标签 类目') &&
              (String(cls).includes('card') || String(cls).includes('product'))
            ) {
              break;
            }
            row = row.parentElement;
          }
        }
        if (!row) return { ok: false, reason: 'product row ancestor not found' };

        const checkbox =
          Array.from(row.querySelectorAll('label')).find((label) => {
            if (!visible(label)) return false;
            const cls = label.className || '';
            return label.querySelector('input[type="checkbox"]') && !/disabled/.test(cls);
          }) ||
          Array.from(row.querySelectorAll('input[type="checkbox"]')).find((input) => visible(input) && !input.disabled) ||
          Array.from(row.querySelectorAll('[role="checkbox"],.ovui-checkbox')).find((el) => visible(el) && !/disabled/.test(el.className || '')) ||
          null;
        if (!checkbox) return { ok: false, reason: 'checkbox not found' };

        clickMouse(checkbox);
        const input = checkbox.matches?.('input[type="checkbox"]')
          ? checkbox
          : checkbox.querySelector?.('input[type="checkbox"]');
        const checked = !!(
          input?.checked ||
          checkbox.getAttribute?.('aria-checked') === 'true' ||
          /checked|selected/.test(checkbox.className || '')
        );
        return { ok: true, checked, rowText: textOf(row).slice(0, 160) };
      })()`,
      { userGesture: true },
    );
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await targetProductOnMainPage()) return;

    await setSearchAndUnfilter();

    const found = await waitFor(
      client,
      `(() => {
        const text = (document.body?.innerText || '').replace(/\\s+/g, ' ');
        return text.includes(${jsString(productId)}) && /ID[:：]\\s*[0-9]+/.test(text);
      })()`,
      7000,
      600,
    );
    if (!found) continue;

    const chosen = await chooseRow();
    if (!chosen?.ok) continue;

    const selectedInDialog = await waitFor(
      client,
      `(() => {
        const text = (document.body?.innerText || '').replace(/\\s+/g, ' ');
        return /已选\\s*1\\/30/.test(text) || /已选\\s*1\\s*[:：]/.test(text);
      })()`,
      5000,
      500,
    );
    if (!selectedInDialog) continue;

    await sleep(400);

    const selectedStillStable = await evaluate(
      client,
      `(() => {
        const text = (document.body?.innerText || '').replace(/\\s+/g, ' ');
        return /已选\\s*1\\/30/.test(text) || /已选\\s*1\\s*[:：]/.test(text);
      })()`,
    );
    if (!selectedStillStable) continue;

    let confirmTarget = null;
    for (let confirmAttempt = 0; confirmAttempt < 15; confirmAttempt += 1) {
      const state = await evaluate(
        client,
        `(() => {
          const visible = (el) => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          };
          const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
          const dialogRoot = Array.from(document.querySelectorAll('[role="dialog"], .ovui-modal, .ovui-drawer, .ovui-modal-wrap, .ovui-dialog')).find((el) => {
            if (!visible(el)) return false;
            const txt = textOf(el);
            return txt.includes('已选 1/30') || txt.includes('已选1/30') || txt.includes('请输入商品名称/ID搜索');
          });
          if (!dialogRoot) return { ok: false, reason: 'product dialog not found before confirm' };

          const buttons = Array.from(dialogRoot.querySelectorAll('button')).filter((btn) => {
            if (!visible(btn)) return false;
            const txt = textOf(btn);
            return txt === '确定' || txt === '完成';
          }).reverse();
          const confirm = buttons.find((btn) => {
            const cls = btn.className || '';
            return (
              !btn.disabled &&
              btn.getAttribute('aria-disabled') !== 'true' &&
              !/disabled/.test(String(cls))
            );
          });
          if (!confirm) {
            return {
              ok: false,
              reason: 'confirm button not ready',
              buttons: buttons.map((btn) => ({
                text: textOf(btn),
                disabled: !!btn.disabled,
                ariaDisabled: btn.getAttribute('aria-disabled'),
                className: String(btn.className || ''),
              })),
            };
          }
          confirm.scrollIntoView({ block: 'center' });
          const rect = confirm.getBoundingClientRect();
          return {
            ok: true,
            text: textOf(confirm),
            rect: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            },
          };
        })()`,
      );
      if (state?.ok) {
        confirmTarget = state;
        break;
      }
      if (state?.reason === "product dialog not found before confirm" && (await targetProductOnMainPage())) return;
      await sleep(300);
    }
    if (!confirmTarget) continue;

    await sleep(200);
    await dispatchMouseClick(client, confirmTarget.rect);

    const selected = await waitFor(
      client,
      `(() => {
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        const pageText = (document.body?.innerText || '').replace(/\\s+/g, ' ');

        const visibleDialog = Array.from(document.querySelectorAll('[role="dialog"], .ovui-modal, .ovui-drawer')).some((el) => {
          if (!visible(el)) return false;
          const txt = textOf(el);
          return (
            txt.includes('请输入商品名称/ID搜索') ||
            txt.includes('查看全部可投商品') ||
            txt.includes('已选 0/30') ||
            txt.includes('已选 1/30')
          );
        });

        const mainPageHasSelectedProduct =
          /已添加[:：]\\s*1\\/30/.test(pageText) ||
          /继续添加商品/.test(pageText) ||
          (pageText.includes(${jsString(productId)}) && /已添加[:：]\\s*1\\/30/.test(pageText));

        return mainPageHasSelectedProduct && !visibleDialog;
      })()`,
      35000,
      700,
    );
    if (selected) return;
    if (await targetProductOnMainPage()) return;

    const postConfirmState = await evaluate(
      client,
      `(() => {
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        const pageText = (document.body?.innerText || '').replace(/\\s+/g, ' ');
        const visibleDialog = Array.from(document.querySelectorAll('[role="dialog"], .ovui-modal, .ovui-drawer')).some((el) => {
          if (!visible(el)) return false;
          const txt = textOf(el);
          return (
            txt.includes('请输入商品名称/ID搜索') ||
            txt.includes('查看全部可投商品') ||
            txt.includes('已选 0/30') ||
            txt.includes('已选 1/30')
          );
        });
        return {
          visibleDialog,
          hasProductId: pageText.includes(${jsString(productId)}),
          hasAddedOne: /已添加[:：]\\s*1\\/30/.test(pageText),
          hasContinueAdd: /继续添加商品/.test(pageText),
          snippet: pageText.slice(0, 500),
        };
      })()`,
    );
    if (!postConfirmState?.visibleDialog) {
      throw new Error(`商品弹窗已关闭但主页面未检测到回填: ${JSON.stringify(postConfirmState)}`);
    }
  }

  throw new Error(`商品已搜索但未成功回填到创建页: ${productId}`);
}

async function ensureLaunchProduct(client, cfg, beforeState) {
  const hasSingleTargetProduct =
    beforeState.product_id === cfg.product_id &&
    (beforeState.product_count === 1 || beforeState.product_count == null);

  if (hasSingleTargetProduct) {
    return { ok: true, action: "already_selected" };
  }

  if (
    (beforeState.product_count != null && beforeState.product_count !== 0) ||
    (beforeState.product_id && beforeState.product_id !== cfg.product_id)
  ) {
    await resetProductCreationPage(client);
  }

  const current = await getPageState(client);
  const currentHasSingleTargetProduct =
    current.product_id === cfg.product_id &&
    (current.product_count === 1 || current.product_count == null);
  if (currentHasSingleTargetProduct) {
    return { ok: true, action: "selected_after_reset" };
  }

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await openProductPicker(client);
      await searchAndAddProduct(client, cfg.product_id, cfg.product_name);
      return { ok: true, action: attempt === 0 ? "searched_and_added" : `searched_and_added_retry_${attempt}` };
    } catch (error) {
      lastError = error;
      await resetProductCreationPage(client);
      await sleep(800);
    }
  }

  throw lastError || new Error(`商品选择失败: ${cfg.product_id}`);
}

async function selectCreativeProduct(client, productId, productName) {
  const opened = await evaluate(
    client,
    `(() => {
      const productId = ${jsString(productId)};
      const productName = ${jsString(productName || "")};
      const text = document.body?.innerText || "";
      if (!text.includes("选择要添加素材的商品")) return { ok: false, reason: "creative product selector not found" };

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

      const selectedLabel = Array.from(document.querySelectorAll('*')).find((el) => {
        if (!visible(el)) return false;
        const txt = textOf(el);
        return txt.startsWith('选择商品：') && !txt.includes('请选择') && txt.length > '选择商品：'.length;
      });
      if (selectedLabel) {
        return { ok: true, already: true };
      }

      const input =
        Array.from(document.querySelectorAll('input, textarea')).find((el) => {
          if (!visible(el)) return false;
          const placeholder = el.placeholder || '';
          if (!placeholder.includes('请选择')) return false;
          let current = el.parentElement;
          for (let i = 0; i < 8 && current; i += 1) {
            if (textOf(current).includes('选择商品：')) return true;
            current = current.parentElement;
          }
          return false;
        }) || null;

      const target = input || Array.from(document.querySelectorAll('*'))
        .filter((el) => visible(el) && textOf(el).includes('选择商品：'))
        .sort((a, b) => textOf(a).length - textOf(b).length)[0] || null;
      if (!target) return { ok: false, reason: 'creative product select trigger not found' };
      target.scrollIntoView({ block: 'center' });
      const rect = target.getBoundingClientRect();
      return {
        ok: true,
        opened: true,
        clickRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      };
    })()`,
    { userGesture: true },
  );
  if (!opened?.ok || opened.already) return opened;

  if (opened.clickRect) {
    await dispatchMouseClick(client, opened.clickRect);
    await sleep(600);
  }

  const optionVisible = await waitFor(
    client,
    `(() => {
      const productId = ${jsString(productId)};
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      return Array.from(document.querySelectorAll('*')).some((el) => {
        if (!visible(el)) return false;
        const txt = textOf(el);
        return txt.includes(productId) && txt.length < 260 && !!el.querySelector('input[type="checkbox"]');
      });
    })()`,
      4500,
      400,
    );
  if (!optionVisible) return { ok: false, reason: "creative product option not visible" };

  const selected = await evaluate(
    client,
    `(() => {
      const productId = ${jsString(productId)};
      const productName = ${jsString(productName || "")};
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

      const options = Array.from(document.querySelectorAll('*')).filter((el) => {
        if (!visible(el)) return false;
        const txt = textOf(el);
        return (
          txt.includes(productId) &&
          txt.length < 260 &&
          !!el.querySelector('input[type="checkbox"]')
        ) || (
          productName &&
          txt.includes(productName.slice(0, 12)) &&
          txt.length < 260 &&
          !!el.querySelector('input[type="checkbox"]')
        );
      }).sort((a, b) => textOf(a).length - textOf(b).length);
      const option = options.find((el) => textOf(el).includes(productId)) || options[0];
      if (!option) return { ok: false, reason: "product option not found" };

      const checkbox = Array.from(option.querySelectorAll('input[type="checkbox"]')).find((input) => visible(input) && !input.disabled);
      if (!checkbox) return { ok: false, reason: "product option checkbox not found", optionText: textOf(option) };
      if (!checkbox.checked) {
        clickMouse(checkbox);
      }
      return { ok: true, optionText: textOf(option).slice(0, 160) };
    })()`,
    { userGesture: true },
  );
  if (selected?.ok) {
    await client.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 53,
    });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 53,
    });
    await sleep(300);
  }
  return selected;
}

async function ensureCreativeProductSelected(client, productId) {
  const ok = await waitFor(
    client,
    `(() => {
      const productId = ${jsString(productId)};
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      return Array.from(document.querySelectorAll('*')).some((el) => {
        if (!visible(el)) return false;
        const txt = textOf(el);
        return txt.startsWith('选择商品：') && !txt.includes('请选择');
      }) && (document.body?.innerText || '').includes(productId);
    })()`,
    5000,
    500,
  );
  if (!ok) {
    throw new Error(`创意商品未选中: ${productId}`);
  }
}

async function ensureCustomMaterialEnabled(client) {
  const state = await evaluate(
    client,
    `(() => {
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      const customCard =
        Array.from(document.querySelectorAll('.oc-switch-card-item, [class*="switch-card-item"], label, div')).find((el) => {
          if (!visible(el)) return false;
          const txt = textOf(el);
          return (
            txt.includes('自选投放素材') &&
            !txt.includes('智能优选素材') &&
            !!el.querySelector('input[type="checkbox"]')
          );
        }) ||
        Array.from(document.querySelectorAll('*')).filter((el) => {
          if (!visible(el)) return false;
          const txt = textOf(el);
          return txt.includes('自选投放素材') && !!el.querySelector('input[type="checkbox"]');
        }).sort((a, b) => textOf(a).length - textOf(b).length)[0] ||
        null;
      if (!customCard) return { ok: false, reason: 'custom material card not found' };

      const input = Array.from(customCard.querySelectorAll('input[type="checkbox"]')).find(
        (node) => visible(node) && !node.disabled,
      );
      if (!input) return { ok: false, reason: 'custom material checkbox not found', rowText: textOf(customCard).slice(0, 160) };

      const addVideoVisible = Array.from(document.querySelectorAll('button,*')).some((el) => (
        visible(el) && textOf(el) === '添加视频'
      ));

      if (input.checked && addVideoVisible) {
        return { ok: true, already: true, rowText: textOf(customCard).slice(0, 120) };
      }
      if (input.checked) {
        return { ok: true, already: true, waitOnly: true, rowText: textOf(customCard).slice(0, 120) };
      }

      input.scrollIntoView({ block: 'center' });
      const rect = input.getBoundingClientRect();
      return {
        ok: true,
        already: false,
        rowText: textOf(customCard).slice(0, 120),
        clickRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      };
    })()`,
    { userGesture: true },
  );
  if (!state?.ok) return state;

  if (state.clickRect) {
    await dispatchMouseClick(client, state.clickRect);
    await sleep(800);
  }

  const ready = await waitFor(
    client,
    `(() => {
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      const customCard =
        Array.from(document.querySelectorAll('.oc-switch-card-item, [class*="switch-card-item"], label, div')).find((el) => {
          if (!visible(el)) return false;
          const txt = textOf(el);
          return (
            txt.includes('自选投放素材') &&
            !txt.includes('智能优选素材') &&
            !!el.querySelector('input[type="checkbox"]')
          );
        }) || null;
      const customChecked = !!customCard?.querySelector('input[type="checkbox"]')?.checked;
      const addVideoVisible = Array.from(document.querySelectorAll('button,*')).some((el) => (
        visible(el) && textOf(el) === '添加视频'
      ));
      return customChecked && addVideoVisible;
    })()`,
    8000,
    400,
  );

  if (!ready) {
    return { ok: false, reason: "自选投放素材已尝试启用，但添加视频入口未出现", state };
  }
  return state;
}

function normalizeTitles(rawTitles) {
  const values = (Array.isArray(rawTitles) ? rawTitles : [rawTitles])
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter((item) => item.length >= 5 && item.length <= 55);
  if (!values.length) values.push("商品好物推荐 舒适质感日常穿搭");
  return values;
}

async function addTitle(client, rawTitles) {
  const titles = normalizeTitles(rawTitles);
  const desiredCount = Math.min(Math.max(titles.length, 1), 3);
  let lastResult = null;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    lastResult = await evaluate(
      client,
      `(() => {
        const titles = ${JSON.stringify(titles)};
        const desiredCount = ${desiredCount};
        const text = document.body?.innerText || "";
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const clickMouse = (el) => {
          el.scrollIntoView({ block: 'center' });
          ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) =>
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
          );
          if (typeof el.click === 'function') el.click();
        };
        if (!text.includes("标题")) return { ok: false, reason: "title area not found" };
        if (!text.includes("请输入标题或使用系统推荐标题")) {
          const btn = Array.from(document.querySelectorAll('button')).find((el) => (el.innerText || '').trim() === '添加标题');
          if (btn) btn.click();
        }
        const items = Array.from(document.querySelectorAll('.title-item-box')).filter((item) =>
          item.querySelector('input[placeholder*="请输入标题"], textarea[placeholder*="请输入标题"]')
        );
        const extraItem = items.find((item, index) => index >= desiredCount);
        if (extraItem) {
          const del = extraItem.querySelector('.title-delete-icon') ||
            Array.from(extraItem.querySelectorAll('iconpark-icon, svg, [class*="delete"], [class*="trash"]')).find(visible);
          if (!del) return { ok: false, reason: 'extra title row delete icon not found', inputCount: items.length, desiredCount };
          clickMouse(del);
          return { ok: false, reason: 'extra title row deleted', inputCount: items.length, desiredCount };
        }
        const inputs = items
          .slice(0, desiredCount)
          .map((item) => item.querySelector('input[placeholder*="请输入标题"], textarea[placeholder*="请输入标题"]'))
          .filter(Boolean);
        if (!inputs.length) return { ok: false, reason: "title input not found" };
        const valid = (value) => {
          const len = String(value || '').replace(/\\s+/g, ' ').trim().length;
          return len >= 5 && len <= 55;
        };
        let filled = 0;
        const finalValues = [];
        for (let index = 0; index < inputs.length; index += 1) {
          const input = inputs[index];
          const current = String(input.value || '').trim();
          if (valid(current)) {
            finalValues.push(current);
            continue;
          }
          const title = titles[index % Math.min(titles.length, desiredCount)];
          const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          input.focus();
          if (setter) {
            setter.call(input, '');
            input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '' }));
            setter.call(input, title);
            input.dispatchEvent(new InputEvent('input', { bubbles: true, data: title, inputType: 'insertText' }));
          } else {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.value = title;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.blur();
          finalValues.push(title);
          filled += 1;
        }
        const invalid = finalValues
          .map((value, index) => ({ index, value, length: String(value || '').trim().length }))
          .filter((item) => item.length < 5 || item.length > 55);
        if (invalid.length) return { ok: false, reason: 'title length invalid', invalid, inputCount: inputs.length, filled };
        return { ok: true, titles: finalValues, inputCount: inputs.length, desiredCount, filled };
      })()`,
      { userGesture: true },
    );
    await sleep(500);
    const stable = await evaluate(
      client,
      `(() => {
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const desiredCount = ${desiredCount};
        const items = Array.from(document.querySelectorAll('.title-item-box')).filter((item) =>
          item.querySelector('input[placeholder*="请输入标题"], textarea[placeholder*="请输入标题"]')
        );
        const inputs = items
          .slice(0, desiredCount)
          .map((item) => item.querySelector('input[placeholder*="请输入标题"], textarea[placeholder*="请输入标题"]'))
          .filter((el) => el && visible(el));
        const values = inputs.map((input, index) => {
          const value = String(input.value || '').replace(/\\s+/g, ' ').trim();
          return { index, value, length: value.length };
        });
        const invalid = values.filter((item) => item.length < 5 || item.length > 55);
        const duplicates = values
          .map((item, index) => ({ ...item, firstIndex: values.findIndex((other) => other.value === item.value) }))
          .filter((item, index) => item.value && item.firstIndex !== index);
        return {
          ok: items.length === desiredCount && inputs.length === desiredCount && invalid.length === 0 && duplicates.length === 0,
          inputCount: inputs.length,
          itemCount: items.length,
          desiredCount,
          values,
          invalid,
          duplicates,
        };
      })()`,
    );
    if (stable?.ok) return { ...(lastResult || {}), ok: true, reason: null, stable };
    lastResult = {
      ...(lastResult || {}),
      reason: stable?.invalid?.length
        ? 'title length invalid after fill'
        : stable?.duplicates?.length
          ? 'duplicate title after fill'
          : lastResult?.reason,
      stable,
    };
  }
  return lastResult;
}

async function publishPlan(client) {
  await dismissBlockingAlerts(client);

  const getPublishState = async () =>
    evaluate(
      client,
      `(() => {
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        const text = document.body?.innerText || '';
        const hasConfirmDialog = /确认发布|为保证全域投放|不再提示/.test(text);
        const hasPublishButton = Array.from(document.querySelectorAll('button')).some((btn) => {
          const txt = textOf(btn);
          return visible(btn) && txt === '发布计划';
        });
        const failureNode = Array.from(document.querySelectorAll(
          '[role="dialog"], .ovui-modal, .ovui-message, .ovui-notification, [class*="toast"], [class*="message"], [class*="notice"]'
        )).find((el) => {
          if (!visible(el)) return false;
          const txt = textOf(el);
          return txt.length < 600 && (txt.includes('发布失败') || txt.includes('失败原因'));
        }) || null;
        return {
          url: location.href,
          published:
            location.href.includes('/uni-prom') ||
            /发布成功|创建成功|提交成功|计划已发布|投放管理/.test(text) ||
            (!hasConfirmDialog && !hasPublishButton),
          hasConfirmDialog,
          hasPublishButton,
          failureText: failureNode ? textOf(failureNode).slice(0, 240) : null,
        };
      })()`,
    );

  const clickConfirmDialog = async () =>
    evaluate(
      client,
      `(() => {
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
        const dialogs = Array.from(document.querySelectorAll(
          '[role="dialog"], .ovui-modal, .ovui-dialog, .ovui-modal-content, .ovui-modal-wrap'
        )).filter(visible);
        const scope = dialogs.find((el) => {
          const txt = textOf(el);
          return (
            txt.includes('确认发布') ||
            txt.includes('为保证全域投放') ||
            txt.includes('全域投放') ||
            txt.includes('不再提示') ||
            txt.includes('温馨提示')
          );
        }) || null;
        if (!scope) return { ok: false, reason: 'publish confirm dialog not found' };

        const dontShow = Array.from(scope.querySelectorAll('label, input[type="checkbox"], [role="checkbox"], .ovui-checkbox')).find((node) => (
          visible(node) && textOf(node).includes('不再提示')
        )) || Array.from(scope.querySelectorAll('input[type="checkbox"]')).find(visible) || null;
        if (dontShow) {
          const input = dontShow.matches?.('input[type="checkbox"]')
            ? dontShow
            : dontShow.querySelector?.('input[type="checkbox"]');
          const checked = !!(input?.checked || dontShow.getAttribute?.('aria-checked') === 'true' || /checked/.test(dontShow.className || ''));
          if (!checked) clickMouse(dontShow);
        }

        const buttons = Array.from(scope.querySelectorAll('button')).filter((node) => {
          const txt = textOf(node);
          return visible(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true' && !/disabled/.test(String(node.className || '')) &&
            ['确认发布', '确定', '确认', '继续发布', '发布'].includes(txt);
        });
        const btn = buttons.find((node) => textOf(node) === '确认发布') || buttons[0] || null;
        if (!btn) {
          return {
            ok: false,
            reason: 'publish confirm button not found',
            dialogText: textOf(scope).slice(0, 240),
            buttons: Array.from(scope.querySelectorAll('button')).map((node) => textOf(node)),
          };
        }
        clickMouse(btn);
        return { ok: true, action: 'confirm_publish_dialog', text: textOf(btn), dialogText: textOf(scope).slice(0, 240) };
      })()`,
      { userGesture: true },
    );

  const existingConfirm = await clickConfirmDialog();
  let clicked = existingConfirm?.ok ? existingConfirm : null;

  if (!clicked) {
    clicked = await evaluate(
    client,
    `(() => {
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
      const publish = Array.from(document.querySelectorAll('button')).find((btn) => (
        visible(btn) &&
        textOf(btn) === '发布计划' &&
        !btn.disabled &&
        btn.getAttribute('aria-disabled') !== 'true' &&
        !/disabled/.test(String(btn.className || ''))
      )) || null;
      if (!publish) return { ok: false, reason: 'publish button not ready' };
      clickMouse(publish);
      return { ok: true, action: 'click_publish' };
    })()`,
    { userGesture: true },
    );
  }
  if (!clicked?.ok) return clicked;

  let confirm = clicked.action === 'confirm_publish_dialog' ? clicked : null;
  let published = false;
  let failureText = null;
  let failureFirstSeenAt = null;
  let resultWaitRan = false;
  const failureGraceMs = 6000;
  if (!confirm) {
    const start = Date.now();
    while (Date.now() - start < 6000) {
      const publishState = await getPublishState();
      const now = Date.now();
      if (publishState?.published) {
        published = true;
        failureText = null;
        break;
      }
      if (publishState?.failureText) {
        failureText = publishState.failureText;
        if (failureFirstSeenAt == null) failureFirstSeenAt = now;
        if (now - failureFirstSeenAt >= failureGraceMs) break;
      }
      const state = await clickConfirmDialog();
      if (state?.ok) {
        confirm = state;
        break;
      }
      await sleep(300);
    }
  }

  if (!published && !failureText) {
    resultWaitRan = true;
    const start = Date.now();
    while (Date.now() - start < 45000) {
      const publishState = await getPublishState();
      const now = Date.now();
      if (publishState?.published) {
        published = true;
        failureText = null;
        break;
      }
      if (publishState?.failureText) {
        failureText = publishState.failureText;
        if (failureFirstSeenAt == null) failureFirstSeenAt = now;
        if (now - failureFirstSeenAt >= failureGraceMs) break;
      } else {
        failureText = null;
        failureFirstSeenAt = null;
      }
      await sleep(500);
    }
  }

  if (!published && failureText && failureFirstSeenAt != null && Date.now() - failureFirstSeenAt < failureGraceMs) {
    const start = Date.now();
    while (Date.now() - start < failureGraceMs) {
      const publishState = await getPublishState();
      if (publishState?.published) {
        published = true;
        failureText = null;
        break;
      }
      if (!publishState?.failureText) {
        failureText = null;
        failureFirstSeenAt = null;
        break;
      }
      await sleep(500);
    }
  }

  if (!published && !failureText && !resultWaitRan) {
    const start = Date.now();
    while (Date.now() - start < 45000) {
      const publishState = await getPublishState();
      const now = Date.now();
      if (publishState?.published) {
        published = true;
        failureText = null;
        break;
      }
      if (publishState?.failureText) {
        failureText = publishState.failureText;
        if (failureFirstSeenAt == null) failureFirstSeenAt = now;
        if (now - failureFirstSeenAt >= failureGraceMs) break;
      } else {
        failureText = null;
        failureFirstSeenAt = null;
      }
      await sleep(500);
    }
  }

  return {
    ok: published,
    clicked: true,
    action: clicked.action,
    confirm: confirm?.ok ? confirm.text : null,
    reason: published
      ? null
      : failureText
        ? failureText
      : confirm?.ok
        ? "publish result not confirmed"
        : "publish confirm dialog not confirmed",
  };
}

async function main() {
  const runStartMs = Date.now();
  const runStartedAt = nowIso();
  const cfg = parseArgs(process.argv.slice(2));
  if (cfg.publish_only) {
    const client = await connectQianchuanProductPage();
    try {
      const before = await getPageState(client);
      const publishResult = await publishPlan(client);
      if (!publishResult?.ok) throw new Error(publishResult?.reason || "发布计划失败");
      const after = await getPageState(client);
      console.log(
        JSON.stringify(
          {
            publish_only: true,
            timing: buildTiming(runStartMs, runStartedAt),
            page_before: before,
            publish_result: publishResult,
            page_after: after,
          },
          null,
          2,
        ),
      );
      return;
    } finally {
      client.close();
    }
  }

  const roi = calcRoi(cfg);
  const uploadVideos = collectUploadVideos(cfg);
  const titles = normalizeTitles(cfg.title ? [cfg.title] : generateTitles(cfg.product_name || ""));
  const title = titles[0];
  const planName = buildPlanName(cfg);

  const summary = {
    product_id: cfg.product_id,
    product_name: cfg.product_name || null,
    sale_price: cfg.sale_price,
    unit_cost: cfg.unit_cost,
    sign_rate: cfg.sign_rate,
    ship_rate: cfg.ship_rate,
    daily_budget: cfg.daily_budget,
    roi,
    title,
    plan_name: planName,
    upload_videos: uploadVideos,
    dry_run: cfg.dry_run,
  };

  if (cfg.dry_run) {
    console.log(JSON.stringify({ ...summary, timing: buildTiming(runStartMs, runStartedAt) }, null, 2));
    return;
  }

  const client = await connectQianchuanProductPage();
  try {
    const before = await getPageState(client);
    await dismissBlockingAlerts(client);
    const productSelection = await ensureLaunchProduct(client, cfg, before);
    const afterProductSelection = await getPageState(client);

    if (afterProductSelection.product_count != null && afterProductSelection.product_count !== 1) {
      throw new Error(`当前创建页不是单商品计划状态，检测到已添加商品数: ${afterProductSelection.product_count}`);
    }

    await ensureCostControlMode(client);
    await ensureBudgetAndRoi(client, cfg.daily_budget, roi.page_fill_roi);
    const planNameResult = await ensurePlanName(client, planName);

    const customMaterialState = await ensureCustomMaterialEnabled(client);
    if (!customMaterialState?.ok) {
      throw new Error(customMaterialState?.reason || "启用自选投放素材失败");
    }
    await sleep(500);
    const creativeSelection = await selectCreativeProduct(client, cfg.product_id, cfg.product_name);
    if (!creativeSelection?.ok) {
      throw new Error(creativeSelection?.reason || "选择创意商品失败");
    }
    await ensureCreativeProductSelected(client, cfg.product_id);
    await sleep(1000);

    const beforeUpload = await getPageState(client);
    const existingVideoCount = Number(beforeUpload?.video_count || 0);
    const uploadResult =
      existingVideoCount >= uploadVideos.length
        ? {
            action: "skip_upload_existing_main_videos",
            selection: { selected: uploadVideos.map((file) => path.basename(file)) },
            confirmedToMainPage: true,
            mainVideoCount: existingVideoCount,
          }
        : uploadVideosInBatches(uploadVideos);
    const selectedCount = uploadResult.selection?.selected?.length || 0;
    if (selectedCount === 0) {
      throw new Error("上传脚本未选中任何视频，已中止");
    }
    if (!uploadResult.confirmedToMainPage) {
      throw new Error("上传脚本未完成主页面回填确认");
    }
    if (Number(uploadResult.mainVideoCount || 0) < selectedCount) {
      throw new Error(
        `主页面视频回填数量异常，已选 ${selectedCount}，主页面 ${uploadResult.mainVideoCount}`,
      );
    }

    await sleep(1000);

    await dismissBlockingAlerts(client);
    const titleResult = await addTitle(client, titles);
    if (!titleResult?.ok) {
      throw new Error(titleResult?.reason || "标题填写失败");
    }

    await ensureBudgetAndRoi(client, cfg.daily_budget, roi.page_fill_roi);
    await sleep(1000);
    const beforePublish = await getPageState(client);
    let publishResult = { ok: false, skipped: true };
    if (cfg.publish) {
      publishResult = await publishPlan(client);
      if (!publishResult?.ok) {
        throw new Error(publishResult?.reason || "发布计划失败");
      }
    }
    const after = await getPageState(client);
    console.log(
      JSON.stringify(
        {
          ...summary,
          product_selection: productSelection,
          custom_material: customMaterialState,
          creative_selection: creativeSelection,
          upload_result: uploadResult,
          plan_name_result: planNameResult,
          page_before: before,
          page_before_publish: beforePublish,
          publish_result: publishResult,
          page_after: after,
          timing: buildTiming(runStartMs, runStartedAt),
        },
        null,
        2,
      ),
    );
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  usage();
  process.exit(1);
});
