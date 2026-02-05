<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { sessions, activeSessionId } from '../stores/sessions';
  import SessionItem from './SessionItem.svelte';

  export let collapsed = false;

  const dispatch = createEventDispatcher<{
    newSession: void;
    importSessions: void;
    closeSession: string;
    removeSession: string;
    sessionClick: { id: string; status: string };
  }>();

  function handleSessionClick(id: string, status: string) {
    dispatch('sessionClick', { id, status });
  }

  function handleCloseSession(id: string) {
    dispatch('closeSession', id);
  }

  function handleRemoveSession(id: string) {
    dispatch('removeSession', id);
  }
</script>

<aside
  class="transition-sidebar bg-terminal-sidebar border-r border-terminal-border flex flex-col"
  class:w-64={!collapsed}
  class:w-0={collapsed}
  class:overflow-hidden={collapsed}
>
  <!-- Header - pt-10 accounts for macOS traffic lights -->
  <div class="px-4 pt-10 pb-4 border-b border-terminal-border title-bar-no-drag">
    <h1 class="text-sm font-semibold text-terminal-text uppercase tracking-wide">Sessions</h1>
  </div>

  <!-- Session list -->
  <div class="flex-1 overflow-y-auto py-2">
    {#each $sessions as session (session.id)}
      <SessionItem
        {session}
        active={session.id === $activeSessionId}
        on:click={() => handleSessionClick(session.id, session.status)}
        on:close={() => handleCloseSession(session.id)}
        on:remove={() => handleRemoveSession(session.id)}
      />
    {/each}

    {#if $sessions.length === 0}
      <div class="px-4 py-8 text-center text-terminal-muted text-sm">
        No sessions yet
      </div>
    {/if}
  </div>

  <div class="p-3 border-t border-terminal-border space-y-2">
    <button
      on:click={() => dispatch('newSession')}
      class="w-full py-2 px-4 bg-terminal-active bg-opacity-20 hover:bg-opacity-30 text-terminal-active
             rounded-md transition-colors text-sm font-medium flex items-center justify-center gap-2"
    >
      <span class="text-lg">+</span>
      <span>New Session</span>
    </button>
    <button
      on:click={() => dispatch('importSessions')}
      class="w-full py-2 px-4 bg-terminal-claude bg-opacity-10 hover:bg-opacity-20 text-terminal-claude
             rounded-md transition-colors text-sm font-medium flex items-center justify-center gap-2"
    >
      <span>↓</span>
      <span>Import Claude</span>
    </button>
  </div>
</aside>
