<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createTerminal, type TerminalInstance } from '../utils/terminal';

  export let sessionId: string;

  let containerRef: HTMLDivElement;
  let terminalInstance: TerminalInstance | null = null;
  let cleanupOutput: (() => void) | null = null;

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
  });

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

<div bind:this={containerRef} class="h-full w-full bg-terminal-bg"></div>
