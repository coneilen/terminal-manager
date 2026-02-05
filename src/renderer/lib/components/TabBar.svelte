<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { sessions, activeSessionId, setActiveSession } from '../stores/sessions';

  const dispatch = createEventDispatcher<{
    closeTab: string;
    newTab: void;
  }>();

  function getTypeIndicator(type: string): string {
    return type === 'claude' ? 'C' : 'G';
  }

  function getTypeBadgeClass(type: string): string {
    return type === 'claude'
      ? 'bg-terminal-claude bg-opacity-20 text-terminal-claude'
      : 'bg-terminal-copilot bg-opacity-20 text-terminal-copilot';
  }

  function handleTabClick(id: string) {
    setActiveSession(id);
  }

  function handleCloseTab(e: MouseEvent, id: string) {
    e.stopPropagation();
    dispatch('closeTab', id);
  }
</script>

<div class="flex items-center pt-8 bg-terminal-sidebar border-b border-terminal-border relative">
  <!-- Drag region for window movement - covers the top padding area -->
  <div class="title-bar-drag absolute top-0 left-0 right-0 h-8"></div>

  <div class="flex-1 flex items-center overflow-x-auto title-bar-no-drag">
    {#each $sessions as session (session.id)}
      <button
        class="tab-enter flex items-center gap-2 px-4 py-2 border-b-2 transition-colors
               hover:bg-terminal-border hover:bg-opacity-30 group min-w-0"
        class:border-transparent={session.id !== $activeSessionId}
        class:bg-terminal-bg={session.id === $activeSessionId}
        class:text-terminal-text={session.id === $activeSessionId}
        class:text-terminal-muted={session.id !== $activeSessionId}
        class:border-terminal-active={session.id === $activeSessionId}
        on:click={() => handleTabClick(session.id)}
      >
        <span class="w-5 h-5 rounded text-xs font-bold flex items-center justify-center shrink-0 {getTypeBadgeClass(session.type)}">
          {getTypeIndicator(session.type)}
        </span>

        <span class="truncate max-w-[120px] text-sm">{session.name}</span>

        <button
          on:click={(e) => handleCloseTab(e, session.id)}
          class="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100
                 hover:bg-terminal-border text-terminal-muted hover:text-terminal-error
                 transition-all shrink-0"
          title="Close tab"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </button>
    {/each}
  </div>

  <button
    on:click={() => dispatch('newTab')}
    class="px-3 py-2 text-terminal-muted hover:text-terminal-text hover:bg-terminal-border
           hover:bg-opacity-30 transition-colors shrink-0 title-bar-no-drag"
    title="New session (F2)"
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
    </svg>
  </button>
</div>
