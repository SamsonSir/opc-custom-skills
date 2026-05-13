#!/usr/bin/env node

const { connectQianchuanProductPage, evaluate, jsString } = require("./lib/qc_cdp");

async function main() {
  const budget = process.argv[2];
  const roi = process.argv[3];
  if (!budget || !roi) {
    throw new Error("用法: fill_qianchuan_budget_roi.js <budget> <roi>");
  }

  const client = await connectQianchuanProductPage();
  try {
    const result = await evaluate(
      client,
      `(() => {
        const budget = ${jsString(budget)};
        const roi = ${jsString(roi)};

        const setNativeValue = (input, value) => {
          input.focus();
          const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
          if (setter) setter.call(input, value);
          else input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.blur();
        };

        const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        const all = Array.from(document.querySelectorAll('*'));

        const findInputByLabel = (label) => {
          const node = all.find((el) => textOf(el) === label);
          if (!node) return null;
          let root = node.parentElement;
          for (let i = 0; i < 8 && root; i += 1) {
            const input = root.querySelector('input');
            if (input) return input;
            root = root.parentElement;
          }
          return null;
        };

        const budgetInput = findInputByLabel('日预算');
        const roiInput = findInputByLabel('净成交ROI目标');
        if (!budgetInput) return { ok: false, reason: 'budget input not found' };
        if (!roiInput) return { ok: false, reason: 'roi input not found' };

        setNativeValue(budgetInput, budget);
        setNativeValue(roiInput, roi);

        return { ok: true, budget: budgetInput.value, roi: roiInput.value };
      })()`,
      { userGesture: true },
    );

    console.log(JSON.stringify(result, null, 2));
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
