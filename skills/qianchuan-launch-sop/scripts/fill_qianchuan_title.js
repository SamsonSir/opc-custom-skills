#!/usr/bin/env node

const { connectQianchuanProductPage, evaluate, jsString } = require("./lib/qc_cdp");

async function main() {
  const title = process.argv[2];
  if (!title) {
    throw new Error("缺少标题参数");
  }

  const client = await connectQianchuanProductPage();
  try {
    const result = await evaluate(
      client,
      `(() => {
        const title = ${jsString(title)};
        const trigger = Array.from(document.querySelectorAll('button,*')).find((el) => (el.innerText || '').trim() === '添加标题');
        if (trigger) trigger.click();

        const input = Array.from(document.querySelectorAll('input, textarea')).find((el) =>
          (el.placeholder || '').includes('请输入标题')
        );
        if (!input) return { ok: false, reason: 'title input not found' };

        input.focus();
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
        if (setter) setter.call(input, title);
        else input.value = title;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
        return { ok: true, value: input.value };
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
