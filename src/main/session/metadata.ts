import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { SessionMetadata } from './types';

function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return path.replace(/^~/, homedir());
  }
  return path;
}

export function extractGitBranch(workingDir: string): string {
  try {
    const expanded = expandPath(workingDir);

    // Check if directory is a git repo
    if (!existsSync(join(expanded, '.git'))) {
      // Also check parent directories for git repo
      let dir = expanded;
      while (dir !== '/' && dir !== homedir()) {
        if (existsSync(join(dir, '.git'))) {
          break;
        }
        dir = join(dir, '..');
      }
      if (!existsSync(join(dir, '.git'))) {
        return '';
      }
    }

    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: expanded,
      encoding: 'utf-8',
      timeout: 5000
    }).trim();

    return branch;
  } catch {
    return '';
  }
}

// Strip ANSI escape codes from string
function stripAnsi(str: string): string {
  return str
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')  // CSI sequences
    .replace(/\u001b\][^\u0007]*\u0007/g, '') // OSC sequences
    .replace(/\r/g, '');
}

export function extractMetadataFromOutput(
  output: string,
  currentMetadata: SessionMetadata
): Partial<SessionMetadata> {
  const updates: Partial<SessionMetadata> = {};

  // Extract window title from OSC sequence - contains current task
  // Claude uses OSC 0: \u001b]0;✳ Task Name\u0007
  const claudeTitleMatch = output.match(/\u001b\]0;[⠐⠂✳✶✻✽✢·⠈⠁⠃]\s*([^\u0007]+)\u0007/);
  if (claudeTitleMatch && claudeTitleMatch[1]) {
    const title = claudeTitleMatch[1].trim();
    if (title === 'Claude Code') {
      // "✳ Claude Code" is the idle title — Claude is waiting for user input
      updates.waitingForInput = true;
    } else {
      // Spinner + task description means Claude is actively processing
      if (title.length > 2 && title.length < 80) {
        updates.lastMessage = title;
      }
      updates.waitingForInput = false;
    }
  }

  // Copilot uses OSC 2: \u001b]2;GitHub Copilot\u0007
  const copilotTitleMatch = output.match(/\u001b\]2;([^\u0007]+)\u0007/);
  if (copilotTitleMatch && copilotTitleMatch[1]) {
    const title = copilotTitleMatch[1].trim();
    if (title === 'GitHub Copilot') {
      updates.model = 'GitHub Copilot';
    }
  }

  // Extract user prompt from dim text (Claude) - format: \u001b[2m...prompt...\u001b[22m
  // Skip placeholder text and horizontal lines
  const dimTextMatch = output.match(/\u001b\[2m([^\u001b]+)\u001b\[22m/);
  if (dimTextMatch && dimTextMatch[1]) {
    const prompt = dimTextMatch[1].trim();
    if (prompt.startsWith('Type @')) {
      // Claude is showing input placeholder — waiting for user input
      updates.waitingForInput = true;
    } else if (prompt.length > 2 && prompt.length < 100 && !prompt.startsWith('─')) {
      updates.lastMessage = prompt;
    }
  }

  // Strip ANSI for other pattern matching
  const clean = stripAnsi(output);

  // Extract Claude model
  const modelMatch = clean.match(/(opus|sonnet|haiku)[- ]?(\d+(?:[.-]\d+)*)/i);
  if (modelMatch) {
    const model = modelMatch[1].charAt(0).toUpperCase() + modelMatch[1].slice(1).toLowerCase();
    const version = modelMatch[2].replace(/-/g, '.');
    updates.model = `${model} ${version}`;
  }

  // Extract context usage (Claude)
  const contextMatch = clean.match(/(\d+(?:\.\d+)?)\s*%/);
  if (contextMatch) {
    updates.contextUsed = `${contextMatch[1]}%`;
  }

  // Note: Copilot shows "Remaining requests: Unlimited" but this isn't context usage
  // so we don't extract it - the context field will remain empty for Copilot

  // Extract Copilot user input - appears after ❯ prompt
  // Format: \u001b[37m❯ \u001b[39m{input}\u001b[7m \u001b[27m (cursor at end)
  const copilotPromptMatch = output.match(/❯ \u001b\[39m([^\u001b]+)/);
  if (copilotPromptMatch && copilotPromptMatch[1]) {
    const input = copilotPromptMatch[1].trim();
    // Ignore placeholder text and empty input
    if (input.length > 0 && !input.startsWith('Type @')) {
      updates.lastMessage = input;
    }
  }
  // Copilot bare prompt (❯ with no input) means waiting for input
  if (output.includes('❯') && !copilotPromptMatch) {
    updates.waitingForInput = true;
  }

  // Thinking indicator (lowest priority)
  if (output.includes('thinking') && !updates.lastMessage) {
    updates.lastMessage = 'Thinking...';
    updates.waitingForInput = false;
  }

  return updates;
}

export function createInitialMetadata(workingDir: string): SessionMetadata {
  return {
    workingDir,
    gitBranch: extractGitBranch(workingDir),
    model: '',
    contextUsed: '',
    lastMessage: '',
    waitingForInput: false
  };
}
