<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Session } from '../stores/sessions';

  export let session: Session;
  export let active = false;

  const dispatch = createEventDispatcher<{
    click: void;
    close: void;
    remove: void;
  }>();

  $: isInactive = session.status === 'closed';

  function getTypeIcon(type: string): string {
    return type === 'claude' ? 'C' : 'G';
  }

  function getStatusIndicator(status: string): string {
    switch (status) {
      case 'active':
        return 'bg-terminal-success';
      case 'idle':
        return 'bg-terminal-warning';
      case 'closed':
        return 'bg-terminal-error';
      default:
        return 'bg-terminal-muted';
    }
  }

  function shortenPath(path: string): string {
    const home = window.api?.homeDir || '';
    if (home && path.startsWith(home)) {
      return path.replace(home, '~');
    }
    return path;
  }

  function handleClose(e: MouseEvent) {
    e.stopPropagation();
    dispatch('close');
  }

  function handleRemove(e: MouseEvent) {
    e.stopPropagation();
    dispatch('remove');
  }

  $: typeIndicatorClass = session.type === 'claude'
    ? 'text-terminal-claude bg-terminal-claude bg-opacity-20'
    : 'text-terminal-copilot bg-terminal-copilot bg-opacity-20';
</script>

<div
  class="session-item px-3 py-2 cursor-pointer group"
  class:active
  class:inactive={isInactive}
  on:click={() => dispatch('click')}
  on:keydown={(e) => e.key === 'Enter' && dispatch('click')}
  role="button"
  tabindex="0"
>
  <div class="flex items-start gap-3">
    <div class="w-6 h-6 rounded flex items-center justify-center text-xs font-bold shrink-0 {typeIndicatorClass}">
      {getTypeIcon(session.type)}
    </div>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="font-medium text-sm truncate">{session.name}</span>
        <span class="w-2 h-2 rounded-full shrink-0 {getStatusIndicator(session.status)}"></span>
      </div>

      <div class="mt-1 text-xs text-terminal-muted space-y-0.5">
        {#if session.metadata.workingDir}
          <div class="flex items-center gap-1.5 truncate" title={session.metadata.workingDir}>
            <span>📁</span>
            <span class="truncate">{shortenPath(session.metadata.workingDir)}</span>
          </div>
        {/if}

        {#if session.metadata.gitBranch}
          <div class="flex items-center gap-1.5">
            <span>🌿</span>
            <span class="truncate">{session.metadata.gitBranch}</span>
          </div>
        {/if}

        {#if session.metadata.model}
          <div class="flex items-center gap-1.5">
            <span>🤖</span>
            <span class="truncate">{session.metadata.model}</span>
          </div>
        {/if}

        {#if session.metadata.contextUsed}
          <div class="flex items-center gap-1.5">
            <span>📊</span>
            <span>{session.metadata.contextUsed}</span>
          </div>
        {/if}

        {#if session.metadata.lastMessage}
          <div class="flex items-center gap-1.5 mt-1">
            <span>💬</span>
            <span class="truncate text-terminal-text text-opacity-70">{session.metadata.lastMessage}</span>
          </div>
        {/if}

        {#if isInactive}
          <div class="flex items-center gap-1.5 mt-1 text-terminal-warning">
            <span>⏸</span>
            <span>Click to restart</span>
          </div>
        {/if}
      </div>
    </div>

    <div class="flex flex-col gap-1 shrink-0">
      {#if !isInactive}
        <button
          on:click={handleClose}
          class="opacity-0 group-hover:opacity-100 p-1 hover:bg-terminal-border rounded
                 text-terminal-muted hover:text-terminal-warning transition-all"
          title="Stop session"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1" stroke-width="2" />
          </svg>
        </button>
      {/if}
      <button
        on:click={handleRemove}
        class="opacity-0 group-hover:opacity-100 p-1 hover:bg-terminal-border rounded
               text-terminal-muted hover:text-terminal-error transition-all"
        title="Remove session"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</div>
