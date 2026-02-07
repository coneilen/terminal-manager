<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Session } from '../stores/sessions';

  export let session: Session;
  export let active = false;
  export let collapsed = false;

  let acknowledged = false;
  let prevWaiting = false;

  $: waiting = !!session.metadata?.waitingForInput;

  // When waitingForInput transitions from false to true, it's a new event — reset acknowledged
  $: if (waiting && !prevWaiting) {
    acknowledged = false;
    prevWaiting = true;
  } else if (!waiting) {
    prevWaiting = false;
  }

  // When user views this session while it's waiting, mark as acknowledged
  $: if (active && waiting) {
    acknowledged = true;
  }

  $: showAttention = waiting && !active && !isInactive && !acknowledged;

  const dispatch = createEventDispatcher<{
    click: void;
    close: void;
    remove: void;
    toggleCollapse: void;
  }>();

  $: isInactive = session.status === 'closed';

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

  function getContextColor(contextUsed: string): string {
    const match = contextUsed.match(/(\d+(?:\.\d+)?)/);
    if (!match) return 'text-terminal-muted';
    const pct = parseFloat(match[1]);
    if (pct >= 75) return 'text-red-400';
    if (pct >= 60) return 'text-amber-400';
    if (pct >= 50) return 'text-yellow-400';
    return 'text-green-400';
  }

  function handleToggleCollapse(e: MouseEvent) {
    e.stopPropagation();
    dispatch('toggleCollapse');
  }

  function handleClose(e: MouseEvent) {
    e.stopPropagation();
    dispatch('close');
  }

  function handleRemove(e: MouseEvent) {
    e.stopPropagation();
    dispatch('remove');
  }
</script>

<div
  class="session-item pl-4 pr-3 py-1.5 cursor-pointer group"
  class:active
  class:inactive={isInactive}
  on:click={() => dispatch('click')}
  on:keydown={(e) => e.key === 'Enter' && dispatch('click')}
  role="button"
  tabindex="0"
>
  <div class="flex items-center gap-2">
    <!-- Collapse toggle -->
    <button
      class="p-0.5 hover:bg-terminal-border rounded transition-colors"
      on:click={handleToggleCollapse}
      title={collapsed ? 'Expand' : 'Collapse'}
    >
      <svg
        class="w-3 h-3 text-terminal-muted transition-transform"
        class:rotate-90={!collapsed}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
      </svg>
    </button>

    <!-- Status indicator -->
    <span class="w-2 h-2 rounded-full shrink-0 {getStatusIndicator(session.status)}"></span>

    <!-- Session name -->
    <span
      class="font-medium text-sm truncate flex-1"
      class:attention-pulse={showAttention}
    >{session.name}</span>

    <!-- Action buttons -->
    <div class="flex items-center gap-0.5 shrink-0">
      {#if !isInactive}
        <button
          on:click={handleClose}
          class="opacity-0 group-hover:opacity-100 p-1 hover:bg-terminal-border rounded
                 text-terminal-muted hover:text-terminal-warning transition-all"
          title="Stop session"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Metadata (collapsible) -->
  {#if !collapsed}
    <div class="ml-5 mt-1 text-xs text-terminal-muted space-y-0.5">
      {#if session.metadata.workingDir}
        <div class="flex items-center gap-1.5 truncate" title={session.metadata.workingDir}>
          <span>📁</span>
          <span class="truncate text-gray-400">{shortenPath(session.metadata.workingDir)}</span>
        </div>
      {/if}

      {#if session.metadata.gitBranch}
        <div class="flex items-center gap-1.5">
          <span>🌿</span>
          <span class="truncate text-gray-400">{session.metadata.gitBranch}</span>
        </div>
      {/if}

      {#if session.metadata.model}
        <div class="flex items-center gap-1.5">
          <span>🤖</span>
          <span class="truncate text-gray-400">{session.metadata.model}</span>
        </div>
      {/if}

      {#if session.metadata.contextUsed}
        <div class="flex items-center gap-1.5">
          <span>📊</span>
          <span class="{getContextColor(session.metadata.contextUsed)}">{session.metadata.contextUsed}</span>
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
  {/if}
</div>
