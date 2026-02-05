<script lang="ts">
  import { sessions, activeSession } from '../stores/sessions';

  const shortcuts = [
    { key: 'F1', action: 'Sidebar' },
    { key: 'F2', action: 'New' },
    { key: 'F3/F4', action: 'Tabs' },
    { key: 'Ctrl+W', action: 'Close' },
    { key: 'Ctrl+Q', action: 'Quit' }
  ];
</script>

<div class="bg-terminal-sidebar border-t border-terminal-border px-4 py-1.5 flex items-center justify-between text-xs">
  <!-- Left: Session info -->
  <div class="flex items-center gap-4 text-terminal-muted">
    {#if $activeSession}
      <span>
        {$activeSession.type === 'claude' ? 'Claude Code' : 'GitHub Copilot'}
      </span>
      {#if $activeSession.metadata.workingDir}
        <span class="text-terminal-text/70">{$activeSession.metadata.workingDir}</span>
      {/if}
      {#if $activeSession.metadata.gitBranch}
        <span class="flex items-center gap-1">
          <span class="text-terminal-copilot">⎇</span>
          {$activeSession.metadata.gitBranch}
        </span>
      {/if}
    {:else}
      <span>No active session</span>
    {/if}
  </div>

  <!-- Center: Session count -->
  <div class="text-terminal-muted">
    {$sessions.length} session{$sessions.length !== 1 ? 's' : ''}
  </div>

  <!-- Right: Keyboard shortcuts -->
  <div class="flex items-center gap-3 text-terminal-muted">
    {#each shortcuts as shortcut}
      <span>
        <kbd class="px-1.5 py-0.5 bg-terminal-bg rounded text-terminal-text/80">{shortcut.key}</kbd>
        <span class="ml-1">{shortcut.action}</span>
      </span>
    {/each}
  </div>
</div>
