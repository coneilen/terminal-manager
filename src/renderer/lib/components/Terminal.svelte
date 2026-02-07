<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { createTerminal, type TerminalInstance } from '../utils/terminal';
  import TerminalContextMenu from './TerminalContextMenu.svelte';
  import { activeSessionId } from '../stores/sessions';

  export let sessionId: string;

  let containerRef: HTMLDivElement;
  let terminalInstance: TerminalInstance | null = null;
  let cleanupOutput: (() => void) | null = null;
  let cleanupFunctions: (() => void)[] = [];
  let isDragging = false;

  // Track when this terminal was last activated so we can auto-scroll
  // to bottom while initial output streams in (e.g. claude --continue)
  let activatedAt = 0;
  let scrollTimer: ReturnType<typeof setTimeout>;
  const ACTIVATION_SCROLL_WINDOW_MS = 8000;

  let contextMenu: { x: number; y: number } | null = null;
  let hasSelection = false;

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    hasSelection = !!terminalInstance?.terminal.getSelection();
    contextMenu = { x: e.clientX, y: e.clientY };
  }

  function closeContextMenu() {
    contextMenu = null;
    terminalInstance?.terminal.focus();
  }

  function handleCopy() {
    const selection = terminalInstance?.terminal.getSelection();
    if (selection) {
      window.api.clipboard.writeText(selection);
    }
  }

  function handlePaste() {
    const text = window.api.clipboard.readText();
    if (text) {
      window.api.writeToSession(sessionId, text);
    }
  }

  function handleSelectAll() {
    terminalInstance?.terminal.selectAll();
  }

  function handleClear() {
    terminalInstance?.terminal.clear();
  }

  function fitTerminal() {
    if (!terminalInstance) return;
    try {
      terminalInstance.fitAddon.fit();
      const { cols, rows } = terminalInstance.terminal;
      window.api.resizeSession(sessionId, cols, rows);
    } catch {
      // Ignore fit errors during transitions
    }
  }

  onMount(() => {
    if (containerRef) {
      terminalInstance = createTerminal(containerRef, sessionId);

      // Listen for output from main process
      cleanupOutput = window.api.onSessionOutput((id, data) => {
        if (id === sessionId && terminalInstance) {
          terminalInstance.terminal.write(data);

          // During the activation window, keep scrolling to bottom as output
          // streams in (e.g. claude --continue replaying conversation history).
          // Debounce so we scroll once output settles, then refit.
          if (Date.now() - activatedAt < ACTIVATION_SCROLL_WINDOW_MS) {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
              if (terminalInstance) {
                terminalInstance.fitAddon.fit();
                terminalInstance.terminal.scrollToBottom();
                terminalInstance.terminal.focus();
              }
            }, 150);
          }
        }
      });

      // Focus the terminal
      terminalInstance.terminal.focus();
    }
  });

  onDestroy(() => {
    clearTimeout(scrollTimer);
    if (terminalInstance) {
      terminalInstance.dispose();
    }
    if (cleanupOutput) {
      cleanupOutput();
    }
    cleanupFunctions.forEach(fn => fn());
  });

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;

    if (!e.dataTransfer?.files?.length) return;

    // Get file paths and write them to the terminal
    const files = Array.from(e.dataTransfer.files);
    const paths = files.map(file => {
      // In Electron, we can get the actual file path
      return (file as any).path || file.name;
    });

    // Write each path to the terminal, space-separated
    // Quote paths that contain spaces
    const quotedPaths = paths.map(p => p.includes(' ') ? `"${p}"` : p);
    const pathString = quotedPaths.join(' ');

    if (pathString) {
      window.api.writeToSession(sessionId, pathString);
    }

    // Focus the terminal after drop
    if (terminalInstance) {
      terminalInstance.terminal.focus();
    }
  }

  // When this terminal becomes active, mark activation time and do an
  // immediate scroll-to-bottom after the DOM settles. The output handler
  // above will keep scrolling as data streams in during the activation window.
  $: if ($activeSessionId === sessionId && terminalInstance) {
    activatedAt = Date.now();
    const inst = terminalInstance;
    tick().then(() => {
      requestAnimationFrame(() => {
        inst.fitAddon.fit();
        inst.terminal.scrollToBottom();
        inst.terminal.focus();
      });
    });
  }

  export function focus() {
    if (terminalInstance) {
      terminalInstance.terminal.focus();
    }
  }

  export function fit() {
    if (terminalInstance) {
      terminalInstance.fitAddon.fit();
    }
  }
</script>

<div
  bind:this={containerRef}
  class="h-full w-full bg-terminal-bg relative"
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
  on:contextmenu={handleContextMenu}
>
  {#if isDragging}
    <div class="absolute inset-0 bg-terminal-active bg-opacity-20 border-2 border-dashed border-terminal-active rounded-lg flex items-center justify-center z-10 pointer-events-none">
      <span class="text-terminal-active text-lg font-medium">Drop files here</span>
    </div>
  {/if}
</div>

{#if contextMenu}
  <TerminalContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    {hasSelection}
    onCopy={handleCopy}
    onPaste={handlePaste}
    onSelectAll={handleSelectAll}
    onClear={handleClear}
    onClose={closeContextMenu}
  />
{/if}
