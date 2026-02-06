<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let x: number;
  export let y: number;
  export let hasSelection: boolean;
  export let onCopy: () => void;
  export let onPaste: () => void;
  export let onSelectAll: () => void;
  export let onClear: () => void;
  export let onClose: () => void;

  let menuRef: HTMLDivElement;

  function handleClickOutside(e: MouseEvent) {
    if (menuRef && !menuRef.contains(e.target as Node)) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }

  function handleItem(action: () => void) {
    action();
    onClose();
  }

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeydown);

    // Adjust position if menu would overflow viewport
    if (menuRef) {
      const rect = menuRef.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menuRef.style.left = `${window.innerWidth - rect.width - 4}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menuRef.style.top = `${window.innerHeight - rect.height - 4}px`;
      }
    }
  });

  onDestroy(() => {
    document.removeEventListener('mousedown', handleClickOutside);
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

<div
  bind:this={menuRef}
  class="fixed z-50 min-w-[160px] rounded-md border border-gray-700 bg-gray-800 py-1 shadow-lg"
  style="left: {x}px; top: {y}px;"
>
  <button
    class="flex w-full items-center px-3 py-1.5 text-sm hover:bg-gray-700 {hasSelection ? 'text-gray-200' : 'text-gray-500 cursor-default'}"
    disabled={!hasSelection}
    on:click={() => handleItem(onCopy)}
  >
    <span class="flex-1 text-left">Copy</span>
    <span class="ml-4 text-xs text-gray-500">Ctrl+Shift+C</span>
  </button>
  <button
    class="flex w-full items-center px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
    on:click={() => handleItem(onPaste)}
  >
    <span class="flex-1 text-left">Paste</span>
    <span class="ml-4 text-xs text-gray-500">Ctrl+Shift+V</span>
  </button>
  <div class="my-1 border-t border-gray-700"></div>
  <button
    class="flex w-full items-center px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
    on:click={() => handleItem(onSelectAll)}
  >
    <span class="flex-1 text-left">Select All</span>
    <span class="ml-4 text-xs text-gray-500">Ctrl+Shift+A</span>
  </button>
  <button
    class="flex w-full items-center px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
    on:click={() => handleItem(onClear)}
  >
    <span class="flex-1 text-left">Clear Terminal</span>
  </button>
</div>
