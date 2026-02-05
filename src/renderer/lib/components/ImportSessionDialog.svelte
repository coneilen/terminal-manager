<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  const dispatch = createEventDispatcher<{
    import: { project: string; name: string };
    close: void;
  }>();

  let importableSessions: ImportableSession[] = [];
  let loading = true;
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

  function handleImport(session: ImportableSession) {
    dispatch('import', { project: session.project, name: session.suggestedName });
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
    class="bg-terminal-sidebar border border-terminal-border rounded-lg shadow-xl w-[32rem] max-w-[90vw] max-h-[80vh] flex flex-col"
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
        <div class="divide-y divide-terminal-border">
          {#each importableSessions as session}
            <div class="px-6 py-3 hover:bg-terminal-border hover:bg-opacity-30 transition-colors">
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-terminal-text">{session.suggestedName}</span>
                    {#if session.isActive}
                      <span class="px-1.5 py-0.5 text-xs bg-terminal-success bg-opacity-20 text-terminal-success rounded">
                        Active
                      </span>
                    {/if}
                  </div>
                  <div class="text-xs text-terminal-muted mt-1 truncate" title={session.project}>
                    {shortenPath(session.project)}
                  </div>
                  {#if session.lastMessage}
                    <div class="text-xs text-terminal-muted mt-1 truncate">
                      "{session.lastMessage}"
                    </div>
                  {/if}
                  <div class="text-xs text-terminal-muted mt-1">
                    {formatTime(session.timestamp)}
                  </div>
                </div>
                <button
                  on:click={() => handleImport(session)}
                  class="px-3 py-1.5 text-sm bg-terminal-claude bg-opacity-20 text-terminal-claude
                         hover:bg-opacity-30 rounded transition-colors shrink-0"
                >
                  Import
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="px-6 py-4 border-t border-terminal-border flex justify-end">
      <button
        type="button"
        on:click={() => dispatch('close')}
        class="px-4 py-2 text-sm font-medium text-terminal-muted hover:text-terminal-text transition-colors"
      >
        Close
      </button>
    </div>
  </div>
</div>
