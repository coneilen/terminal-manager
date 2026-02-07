<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  const dispatch = createEventDispatcher<{
    import: { project: string; name: string };
    close: void;
  }>();

  let importableSessions: ImportableSession[] = [];
  let selectedIds: Set<string> = new Set();
  let loading = true;
  let importing = false;
  let error = '';

  onMount(async () => {
    try {
      importableSessions = await window.api?.getImportableSessions() || [];
    } catch (e) {
      error = 'Failed to load sessions';
      console.error(e);
    } finally {
      loading = false;
    }
  });

  $: allSelected = importableSessions.length > 0 && selectedIds.size === importableSessions.length;
  $: someSelected = selectedIds.size > 0;

  function toggleSelect(sessionId: string) {
    if (selectedIds.has(sessionId)) {
      selectedIds.delete(sessionId);
    } else {
      selectedIds.add(sessionId);
    }
    selectedIds = selectedIds;
  }

  function toggleAll() {
    if (allSelected) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(importableSessions.map(s => s.sessionId));
    }
  }

  async function handleImportSelected() {
    importing = true;
    const toImport = importableSessions.filter(s => selectedIds.has(s.sessionId));
    for (const session of toImport) {
      dispatch('import', { project: session.project, name: session.suggestedName });
      // Small delay so each session gets created sequentially
      await new Promise(r => setTimeout(r, 100));
    }
    importing = false;
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      dispatch('close');
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      dispatch('close');
    }
  }

  function shortenPath(path: string): string {
    const home = window.api?.homeDir || '';
    if (home && path.startsWith(home)) {
      return path.replace(home, '~');
    }
    return path;
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function folderName(path: string): string {
    return path.split('/').filter(Boolean).pop() || path;
  }
</script>

<div
  class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
  on:click={handleBackdropClick}
  on:keydown={handleKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
>
  <div
    class="bg-terminal-sidebar border border-terminal-border rounded-lg shadow-xl w-[36rem] max-w-[90vw] max-h-[80vh] flex flex-col"
    tabindex="-1"
  >
    <div class="px-6 py-4 border-b border-terminal-border">
      <h2 id="dialog-title" class="text-lg font-semibold text-terminal-text">Import Claude Sessions</h2>
      <p class="text-sm text-terminal-muted mt-1">Sessions from ~/.claude/history.jsonl</p>
    </div>

    <div class="flex-1 overflow-y-auto">
      {#if loading}
        <div class="px-6 py-8 text-center text-terminal-muted">
          Loading sessions...
        </div>
      {:else if error}
        <div class="px-6 py-8 text-center text-terminal-error">
          {error}
        </div>
      {:else if importableSessions.length === 0}
        <div class="px-6 py-8 text-center text-terminal-muted">
          No new sessions to import
        </div>
      {:else}
        <!-- Select all header -->
        <div class="px-6 py-2 border-b border-terminal-border bg-terminal-bg bg-opacity-50 flex items-center gap-3 sticky top-0">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              on:change={toggleAll}
              class="accent-terminal-claude"
            />
            <span class="text-xs text-terminal-muted">
              {#if allSelected}
                Deselect all
              {:else}
                Select all ({importableSessions.length})
              {/if}
            </span>
          </label>
          {#if someSelected}
            <span class="text-xs text-terminal-claude ml-auto">{selectedIds.size} selected</span>
          {/if}
        </div>

        <div class="divide-y divide-terminal-border">
          {#each importableSessions as session (session.sessionId)}
            <label
              class="px-6 py-3 hover:bg-terminal-border hover:bg-opacity-30 transition-colors flex items-start gap-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(session.sessionId)}
                on:change={() => toggleSelect(session.sessionId)}
                class="mt-1 accent-terminal-claude"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-terminal-text">{folderName(session.project)}</span>
                  {#if session.isActive}
                    <span class="px-1.5 py-0.5 text-xs bg-terminal-success bg-opacity-20 text-terminal-success rounded">
                      Active
                    </span>
                  {/if}
                  <span class="text-xs text-terminal-muted ml-auto shrink-0">{formatTime(session.timestamp)}</span>
                </div>
                <div class="text-xs text-terminal-muted mt-1 truncate" title={session.project}>
                  {shortenPath(session.project)}
                </div>
                {#if session.lastMessage}
                  <div class="text-xs text-terminal-muted mt-1 truncate">
                    "{session.lastMessage}"
                  </div>
                {/if}
              </div>
            </label>
          {/each}
        </div>
      {/if}
    </div>

    <div class="px-6 py-4 border-t border-terminal-border flex justify-between items-center">
      <button
        type="button"
        on:click={() => dispatch('close')}
        class="px-4 py-2 text-sm font-medium text-terminal-muted hover:text-terminal-text transition-colors"
      >
        Cancel
      </button>
      {#if importableSessions.length > 0}
        <button
          type="button"
          on:click={handleImportSelected}
          disabled={!someSelected || importing}
          class="px-4 py-2 text-sm font-medium bg-terminal-claude text-terminal-bg rounded-md
                 hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {#if importing}
            Importing...
          {:else}
            Import {selectedIds.size > 0 ? selectedIds.size : ''} Session{selectedIds.size !== 1 ? 's' : ''}
          {/if}
        </button>
      {/if}
    </div>
  </div>
</div>
