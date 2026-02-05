<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { sessions, activeSessionId } from '../stores/sessions';
  import SessionItem from './SessionItem.svelte';

  export let collapsed = false;

  // Track collapsed state for branches and individual sessions
  let claudeBranchCollapsed = false;
  let copilotBranchCollapsed = false;
  let collapsedSessions: Set<string> = new Set();

  const dispatch = createEventDispatcher<{
    newSession: void;
    importSessions: void;
    loadFromFile: void;
    closeSession: string;
    removeSession: string;
    sessionClick: { id: string; status: string };
  }>();

  // Derived: filter sessions by type
  $: claudeSessions = $sessions.filter(s => s.type === 'claude');
  $: copilotSessions = $sessions.filter(s => s.type === 'copilot');

  function handleSessionClick(id: string, status: string) {
    dispatch('sessionClick', { id, status });
  }

  function handleCloseSession(id: string) {
    dispatch('closeSession', id);
  }

  function handleRemoveSession(id: string) {
    dispatch('removeSession', id);
  }

  function toggleSessionCollapse(id: string) {
    if (collapsedSessions.has(id)) {
      collapsedSessions.delete(id);
    } else {
      collapsedSessions.add(id);
    }
    collapsedSessions = collapsedSessions; // Trigger reactivity
  }

  function toggleClaudeBranch() {
    claudeBranchCollapsed = !claudeBranchCollapsed;
  }

  function toggleCopilotBranch() {
    copilotBranchCollapsed = !copilotBranchCollapsed;
  }
</script>

<aside
  class="transition-sidebar bg-terminal-sidebar border-r border-terminal-border flex flex-col relative"
  class:w-64={!collapsed}
  class:w-0={collapsed}
  class:overflow-hidden={collapsed}
>
  <!-- Drag region - top area next to traffic lights (start after 80px for traffic lights) -->
  <div class="title-bar-drag absolute top-0 left-20 right-0 h-10"></div>

  <!-- Header - pt-10 accounts for macOS traffic lights -->
  <div class="px-4 pt-10 pb-4 border-b border-terminal-border title-bar-no-drag">
    <h1 class="text-sm font-semibold text-terminal-text uppercase tracking-wide">Sessions</h1>
  </div>

  <!-- Session tree -->
  <div class="flex-1 overflow-y-auto py-2">
    {#if $sessions.length === 0}
      <div class="px-4 py-8 text-center text-terminal-muted text-sm">
        No sessions yet
      </div>
    {:else}
      <!-- Claude Branch -->
      {#if claudeSessions.length > 0}
        <div class="mb-2">
          <button
            class="w-full px-3 py-1.5 flex items-center gap-2 text-sm font-medium text-terminal-claude hover:bg-terminal-border hover:bg-opacity-30 transition-colors"
            on:click={toggleClaudeBranch}
          >
            <svg
              class="w-3 h-3 transition-transform"
              class:rotate-90={!claudeBranchCollapsed}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
            </svg>
            <span class="w-5 h-5 rounded flex items-center justify-center text-xs font-bold bg-terminal-claude bg-opacity-20">
              C
            </span>
            <span>Claude</span>
            <span class="text-terminal-muted text-xs ml-auto">{claudeSessions.length}</span>
          </button>

          {#if !claudeBranchCollapsed}
            <div class="ml-3 border-l border-terminal-border">
              {#each claudeSessions as session (session.id)}
                <SessionItem
                  {session}
                  active={session.id === $activeSessionId}
                  collapsed={collapsedSessions.has(session.id)}
                  on:click={() => handleSessionClick(session.id, session.status)}
                  on:close={() => handleCloseSession(session.id)}
                  on:remove={() => handleRemoveSession(session.id)}
                  on:toggleCollapse={() => toggleSessionCollapse(session.id)}
                />
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Copilot Branch -->
      {#if copilotSessions.length > 0}
        <div class="mb-2">
          <button
            class="w-full px-3 py-1.5 flex items-center gap-2 text-sm font-medium text-terminal-copilot hover:bg-terminal-border hover:bg-opacity-30 transition-colors"
            on:click={toggleCopilotBranch}
          >
            <svg
              class="w-3 h-3 transition-transform"
              class:rotate-90={!copilotBranchCollapsed}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
            </svg>
            <span class="w-5 h-5 rounded flex items-center justify-center text-xs font-bold bg-terminal-copilot bg-opacity-20">
              G
            </span>
            <span>Copilot</span>
            <span class="text-terminal-muted text-xs ml-auto">{copilotSessions.length}</span>
          </button>

          {#if !copilotBranchCollapsed}
            <div class="ml-3 border-l border-terminal-border">
              {#each copilotSessions as session (session.id)}
                <SessionItem
                  {session}
                  active={session.id === $activeSessionId}
                  collapsed={collapsedSessions.has(session.id)}
                  on:click={() => handleSessionClick(session.id, session.status)}
                  on:close={() => handleCloseSession(session.id)}
                  on:remove={() => handleRemoveSession(session.id)}
                  on:toggleCollapse={() => toggleSessionCollapse(session.id)}
                />
              {/each}
            </div>
          {/if}
        </div>
      {/if}
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
    <button
      on:click={() => dispatch('loadFromFile')}
      class="w-full py-2 px-4 bg-terminal-muted bg-opacity-10 hover:bg-opacity-20 text-terminal-muted
             rounded-md transition-colors text-sm font-medium flex items-center justify-center gap-2"
    >
      <span>📄</span>
      <span>Load from JSON</span>
    </button>
  </div>
</aside>
