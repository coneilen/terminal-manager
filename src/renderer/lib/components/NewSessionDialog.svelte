<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  const dispatch = createEventDispatcher<{
    create: { type: 'claude' | 'copilot'; workingDir: string };
    close: void;
  }>();

  let sessionType: 'claude' | 'copilot' = 'claude';
  let workingDir = window.api?.homeDir || '~';
  let dialogRef: HTMLDivElement;

  onMount(() => {
    dialogRef?.focus();
  });

  function handleSubmit() {
    dispatch('create', { type: sessionType, workingDir });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      dispatch('close');
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      dispatch('close');
    }
  }

  async function handleBrowse() {
    const folder = await window.api?.openFolderDialog();
    if (folder) {
      workingDir = folder;
    }
  }

  $: claudeButtonClass = sessionType === 'claude'
    ? 'border-terminal-claude bg-terminal-claude bg-opacity-10'
    : 'border-terminal-border hover:border-terminal-claude hover:border-opacity-50';

  $: copilotButtonClass = sessionType === 'copilot'
    ? 'border-terminal-copilot bg-terminal-copilot bg-opacity-10'
    : 'border-terminal-border hover:border-terminal-copilot hover:border-opacity-50';
</script>

<div
  class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
  on:click={handleBackdropClick}
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
>
  <div
    bind:this={dialogRef}
    class="bg-terminal-sidebar border border-terminal-border rounded-lg shadow-xl w-96 max-w-[90vw]"
    tabindex="-1"
    on:keydown|stopPropagation={handleKeydown}
  >
    <div class="px-6 py-4 border-b border-terminal-border">
      <h2 id="dialog-title" class="text-lg font-semibold text-terminal-text">New Session</h2>
    </div>

    <div class="px-6 py-4 space-y-4">
      <div>
        <label class="block text-sm font-medium text-terminal-text mb-2">Session Type</label>
        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 py-3 px-4 rounded-lg border-2 transition-all flex items-center gap-3 {claudeButtonClass}"
            on:click={() => (sessionType = 'claude')}
          >
            <span class="w-8 h-8 rounded bg-terminal-claude bg-opacity-20 text-terminal-claude font-bold flex items-center justify-center">
              C
            </span>
            <div class="text-left">
              <div class="font-medium text-terminal-text">Claude Code</div>
              <div class="text-xs text-terminal-muted">AI coding assistant</div>
            </div>
          </button>

          <button
            type="button"
            class="flex-1 py-3 px-4 rounded-lg border-2 transition-all flex items-center gap-3 {copilotButtonClass}"
            on:click={() => (sessionType = 'copilot')}
          >
            <span class="w-8 h-8 rounded bg-terminal-copilot bg-opacity-20 text-terminal-copilot font-bold flex items-center justify-center">
              G
            </span>
            <div class="text-left">
              <div class="font-medium text-terminal-text">GitHub Copilot</div>
              <div class="text-xs text-terminal-muted">CLI assistant</div>
            </div>
          </button>
        </div>
      </div>

      <div>
        <label for="working-dir" class="block text-sm font-medium text-terminal-text mb-2">
          Working Directory
        </label>
        <div class="flex gap-2">
          <input
            id="working-dir"
            type="text"
            bind:value={workingDir}
            class="flex-1 px-3 py-2 bg-terminal-bg border border-terminal-border rounded-md
                   text-terminal-text placeholder-terminal-muted focus:border-terminal-active
                   focus:ring-1 focus:ring-terminal-active transition-colors text-sm font-mono"
            placeholder="/path/to/project"
          />
          <button
            type="button"
            on:click={handleBrowse}
            class="px-3 py-2 bg-terminal-border text-terminal-text rounded-md
                   hover:bg-terminal-muted hover:bg-opacity-30 transition-colors text-sm"
            title="Browse..."
          >
            📁
          </button>
        </div>
        <p class="mt-1 text-xs text-terminal-muted">
          The directory where the session will start
        </p>
      </div>
    </div>

    <div class="px-6 py-4 border-t border-terminal-border flex justify-end gap-3">
      <button
        type="button"
        on:click={() => dispatch('close')}
        class="px-4 py-2 text-sm font-medium text-terminal-muted hover:text-terminal-text transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        on:click={handleSubmit}
        class="px-4 py-2 text-sm font-medium bg-terminal-active text-terminal-bg rounded-md
               hover:opacity-90 transition-colors"
      >
        Create Session
      </button>
    </div>
  </div>
</div>
