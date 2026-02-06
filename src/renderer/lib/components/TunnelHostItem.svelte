<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let host: TunnelHostInfo;
  export let selected = false;

  const dispatch = createEventDispatcher<{
    select: string;
    connect: string;
    disconnect: string;
  }>();

  function getStatusColor(status: TunnelHostInfo['status']): string {
    switch (status) {
      case 'connected':
        return 'bg-green-400';
      case 'connecting':
        return 'bg-yellow-400 animate-pulse';
      case 'discovered':
        return 'bg-blue-400';
      case 'disconnected':
        return 'bg-red-400';
      default:
        return 'bg-gray-400';
    }
  }

  function handleAction(e: MouseEvent) {
    e.stopPropagation();
    if (host.status === 'connected') {
      dispatch('disconnect', host.instanceId);
    } else if (host.status === 'discovered' || host.status === 'disconnected') {
      dispatch('connect', host.instanceId);
    }
  }
</script>

<button
  class="w-full px-3 py-2 flex items-center gap-2 text-sm transition-colors hover:bg-terminal-border hover:bg-opacity-30"
  class:bg-terminal-border={selected}
  class:bg-opacity-20={selected}
  on:click={() => dispatch('select', host.instanceId)}
>
  <span class="w-2 h-2 rounded-full shrink-0 {getStatusColor(host.status)}"></span>

  <span class="truncate flex-1 text-left text-terminal-text">
    {host.hostname}
  </span>

  <span class="text-xs text-terminal-muted shrink-0">
    {host.status}
  </span>

  {#if host.status === 'connected'}
    <button
      on:click={handleAction}
      class="px-2 py-0.5 text-xs rounded bg-red-500 bg-opacity-20 text-red-400
             hover:bg-opacity-30 transition-colors shrink-0"
      title="Disconnect"
    >
      ×
    </button>
  {:else if host.status === 'discovered' || host.status === 'disconnected'}
    <button
      on:click={handleAction}
      class="px-2 py-0.5 text-xs rounded bg-green-500 bg-opacity-20 text-green-400
             hover:bg-opacity-30 transition-colors shrink-0"
      title="Connect"
    >
      →
    </button>
  {/if}
</button>
