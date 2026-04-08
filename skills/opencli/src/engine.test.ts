/**
 * Tests for engine.ts: CLI discovery and command execution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discoverClis, executeCommand } from './engine.js';
import { getRegistry, cli, Strategy } from './registry.js';

describe('discoverClis', () => {
  it('handles non-existent directories gracefully', async () => {
    // Should not throw for missing directories
    await expect(discoverClis('/tmp/nonexistent-opencli-test-dir')).resolves.not.toThrow();
  });
});

describe('executeCommand', () => {
  it('executes a command with func', async () => {
    const cmd = cli({
      site: 'test-engine',
      name: 'func-test',
      description: 'test command with func',
      browser: false,
      strategy: Strategy.PUBLIC,
      func: async (_page, kwargs) => {
        return [{ title: kwargs.query ?? 'default' }];
      },
    });

    const result = await executeCommand(cmd, null, { query: 'hello' });
    expect(result).toEqual([{ title: 'hello' }]);
  });

  it('executes a command with pipeline', async () => {
    const cmd = cli({
      site: 'test-engine',
      name: 'pipe-test',
      description: 'test command with pipeline',
      browser: false,
      strategy: Strategy.PUBLIC,
      pipeline: [
        { evaluate: '() => [{ n: 1 }, { n: 2 }, { n: 3 }]' },
        { limit: '2' },
      ],
    });

    // Pipeline commands require page for evaluate step, so we'll test the error path
    await expect(executeCommand(cmd, null, {})).rejects.toThrow();
  });

  it('throws for command with no func or pipeline', async () => {
    const cmd = cli({
      site: 'test-engine',
      name: 'empty-test',
      description: 'empty command',
      browser: false,
    });

    await expect(executeCommand(cmd, null, {})).rejects.toThrow('has no func or pipeline');
  });

  it('passes debug flag to func', async () => {
    let receivedDebug = false;
    const cmd = cli({
      site: 'test-engine',
      name: 'debug-test',
      description: 'debug test',
      browser: false,
      func: async (_page, _kwargs, debug) => {
        receivedDebug = debug ?? false;
        return [];
      },
    });

    await executeCommand(cmd, null, {}, true);
    expect(receivedDebug).toBe(true);
  });
});
