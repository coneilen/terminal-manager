<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createTerminal, type TerminalInstance } from '../utils/terminal';
  import TerminalContextMenu from './TerminalContextMenu.svelte';

  export let sessionId: string;

  let containerRef: HTMLDivElement;
  let terminalInstance: TerminalInstance | null = null;
  let cleanupOutput: (() => void) | null = null;
  let cleanupFunctions: (() => void)[] = [];
  let isDragging = false;

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
        }
      });

      // Focus the terminal
      terminalInstance.terminal.focus();
    }
  });

  onDestroy(() => {
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
