<script lang="ts">
  import { onDestroy, createEventDispatcher } from 'svelte';
  import { sessions, activeSessionId, type Session } from '../stores/sessions';
  import { settings } from '../stores/settings';
  import { sidebarContext, tunnelHosts, selectedMachineId, tunnelEnabled } from '../stores/tunnels';
  import SessionItem from './SessionItem.svelte';
  import TunnelHostItem from './TunnelHostItem.svelte';

  export let collapsed = false;

  const MIN_WIDTH = 256;

  // Track collapsed state for branches, folders, and individual sessions
  let claudeBranchCollapsed = false;
  let copilotBranchCollapsed = false;
  let collapsedFolders: Set<string> = new Set();
  let collapsedSessions: Set<string> = new Set();

  // Resize state
  let isResizing = false;

  function startResize(e: MouseEvent) {
    e.preventDefault();
    isResizing = true;

    const onMouseMove = (ev: MouseEvent) => {
      const maxWidth = Math.floor(window.innerWidth / 2);
      const newWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, ev.clientX));
      settings.update(s => ({ ...s, sidebarWidth: newWidth }));
    };

    const onMouseUp = () => {
      isResizing = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  interface FolderGroup {
    path: string;
    folderName: string;
    displayPath: string;
    sessions: Session[];
  }

  const dispatch = createEventDispatcher<{
    newSession: void;
    importSessions: void;
    loadFromFile: void;
    closeSession: string;
    removeSession: string;
    sessionClick: { id: string; status: string };
    tunnelConnect: string;
    tunnelDisconnect: string;
    tunnelSelectMachine: string | null;
  }>();

  function shortenPath(path: string): string {
    const home = window.api?.homeDir || '';
    if (home && path.startsWith(home)) {
      return path.replace(home, '~');
    }
    return path;
  }

  function groupSessionsByFolder(sessionList: Session[]): FolderGroup[] {
    // Group by gitRoot so worktrees of the same repo are grouped together.
    // Falls back to workingDir for non-git directories.
    const groups = new Map<string, Session[]>();
    for (const session of sessionList) {
      const key = session.metadata.gitRoot || session.metadata.workingDir || 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(session);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, sess]) => ({
        path,
        folderName: path.split('/').filter(Boolean).pop() || path,
        displayPath: shortenPath(path),
        sessions: sess.sort((a, b) => a.name.localeCompare(b.name))
      }));
  }

  // Local sessions: filter out tunnel: prefixed IDs
  $: localSessions = $sessions.filter(s => !s.id.startsWith('tunnel:'));
  $: claudeSessions = ($sidebarContext === 'local' ? localSessions : remoteSessions).filter(s => s.type === 'claude');
  $: copilotSessions = ($sidebarContext === 'local' ? localSessions : remoteSessions).filter(s => s.type === 'copilot');

  // Grouped by folder, sorted alphabetically
  $: claudeFolderGroups = groupSessionsByFolder(claudeSessions);
  $: copilotFolderGroups = groupSessionsByFolder(copilotSessions);

  // Remote sessions for selected machine
  $: remotePrefix = $selectedMachineId ? `tunnel:${$selectedMachineId}:` : null;
  $: remoteSessions = remotePrefix
    ? $sessions.filter(s => s.id.startsWith(remotePrefix))
    : [];

  // Host count for badge
  $: hostCount = $tunnelHosts.length;

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
    collapsedSessions = collapsedSessions;
  }

  function toggleFolderCollapse(key: string) {
    if (collapsedFolders.has(key)) {
      collapsedFolders.delete(key);
    } else {
      collapsedFolders.add(key);
    }
    collapsedFolders = collapsedFolders;
  }

  function toggleClaudeBranch() {
    claudeBranchCollapsed = !claudeBranchCollapsed;
  }

  function toggleCopilotBranch() {
    copilotBranchCollapsed = !copilotBranchCollapsed;
  }
</script>

<aside
  class="bg-terminal-sidebar border-r border-terminal-border flex flex-col relative shrink-0"
  class:transition-sidebar={!isResizing}
  class:overflow-hidden={collapsed}
  style="width: {collapsed ? 0 : $settings.sidebarWidth}px"
>
  <!-- Drag region - top area next to traffic lights (start after 80px for traffic lights) -->
  <div class="title-bar-drag absolute top-0 left-20 right-0 h-10"></div>

  <!-- Header - pt-10 accounts for macOS traffic lights -->
  <div class="px-4 pt-10 pb-2 border-b border-terminal-border title-bar-no-drag">
    <h1 class="text-sm font-semibold text-terminal-text uppercase tracking-wide">Sessions</h1>
  </div>

  <!-- Tab bar: Local / Remote -->
  <div class="flex border-b border-terminal-border title-bar-no-drag">
    <button
      class="flex-1 px-3 py-2 text-xs font-medium transition-colors border-b-2"
      class:border-terminal-active={$sidebarContext === 'local'}
      class:text-terminal-text={$sidebarContext === 'local'}
      class:border-transparent={$sidebarContext !== 'local'}
      class:text-terminal-muted={$sidebarContext !== 'local'}
      on:click={() => sidebarContext.set('local')}
    >
      Local
    </button>
    <button
      class="flex-1 px-3 py-2 text-xs font-medium transition-colors border-b-2 flex items-center justify-center gap-1"
      class:border-terminal-active={$sidebarContext === 'remote'}
      class:text-terminal-text={$sidebarContext === 'remote'}
      class:border-transparent={$sidebarContext !== 'remote'}
      class:text-terminal-muted={$sidebarContext !== 'remote'}
      on:click={() => sidebarContext.set('remote')}
    >
      Remote
      {#if hostCount > 0}
        <span class="inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full bg-terminal-active bg-opacity-20 text-terminal-active">
          {hostCount}
        </span>
      {/if}
    </button>
  </div>

  <!-- Session tree / Remote hosts -->
  <div class="flex-1 overflow-y-auto py-2">
    {#if $sidebarContext === 'remote'}
      <!-- Remote context -->
      {#if !$tunnelEnabled}
        <div class="px-4 py-8 text-center text-terminal-muted text-sm">
          Configure git email to enable tunneling
        </div>
      {:else if $tunnelHosts.length === 0}
        <div class="px-4 py-8 text-center text-terminal-muted text-sm">
          Searching for peers on LAN...
        </div>
      {:else}
        <!-- Host list -->
        <div class="mb-2">
          <div class="px-3 py-1 text-xs font-medium text-terminal-muted uppercase">Machines</div>
          {#each $tunnelHosts as host (host.instanceId)}
            <TunnelHostItem
              {host}
              selected={host.instanceId === $selectedMachineId}
              on:select={(e) => {
                dispatch('tunnelSelectMachine', e.detail);
                selectedMachineId.set(e.detail);
              }}
              on:connect={(e) => dispatch('tunnelConnect', e.detail)}
              on:disconnect={(e) => dispatch('tunnelDisconnect', e.detail)}
            />
          {/each}
        </div>

        <!-- Remote sessions for selected connected host -->
        {#if $selectedMachineId && remoteSessions.length > 0}
          <div class="border-t border-terminal-border pt-2">
            <!-- Claude Branch -->
            {#if claudeSessions.length > 0}
              <div class="mb-2">
                <button
                  class="w-full px-3 py-1.5 flex items-center gap-2 text-sm font-medium text-terminal-claude hover:bg-terminal-border hover:bg-opacity-30 transition-colors"
                  on:click={toggleClaudeBranch}
                >
                  <svg class="w-3 h-3 transition-transform" class:rotate-90={!claudeBranchCollapsed} fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                  </svg>
                  <span class="w-5 h-5 rounded flex items-center justify-center text-xs font-bold bg-terminal-claude bg-opacity-20">C</span>
                  <span>Claude</span>
                  <span class="text-terminal-muted text-xs ml-auto">{claudeSessions.length}</span>
                </button>
                {#if !claudeBranchCollapsed}
                  <div class="ml-3 border-l border-terminal-border">
                    {#each claudeFolderGroups as group (group.path)}
                      <button
                        class="w-full pl-3 pr-3 py-1 flex items-center gap-1.5 text-xs text-terminal-muted hover:bg-terminal-border hover:bg-opacity-30 transition-colors"
                        on:click={() => toggleFolderCollapse('claude:' + group.path)}
                        title={group.displayPath}
                      >
                        <svg class="w-2.5 h-2.5 shrink-0 transition-transform" class:rotate-90={!collapsedFolders.has('claude:' + group.path)} fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                        </svg>
                        <span class="shrink-0">📁</span>
                        <span class="truncate text-gray-400" title={group.displayPath}>{group.folderName}</span>
                        <span class="text-terminal-muted text-[10px] ml-auto shrink-0">{group.sessions.length}</span>
                      </button>
                      {#if !collapsedFolders.has('claude:' + group.path)}
                        <div class="ml-4 border-l border-terminal-border border-opacity-50">
                          {#each group.sessions as session (session.id)}
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
                  <svg class="w-3 h-3 transition-transform" class:rotate-90={!copilotBranchCollapsed} fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                  </svg>
                  <span class="w-5 h-5 rounded flex items-center justify-center text-xs font-bold bg-terminal-copilot bg-opacity-20">G</span>
                  <span>Copilot</span>
                  <span class="text-terminal-muted text-xs ml-auto">{copilotSessions.length}</span>
                </button>
                {#if !copilotBranchCollapsed}
                  <div class="ml-3 border-l border-terminal-border">
                    {#each copilotFolderGroups as group (group.path)}
                      <button
                        class="w-full pl-3 pr-3 py-1 flex items-center gap-1.5 text-xs text-terminal-muted hover:bg-terminal-border hover:bg-opacity-30 transition-colors"
                        on:click={() => toggleFolderCollapse('copilot:' + group.path)}
                        title={group.displayPath}
                      >
                        <svg class="w-2.5 h-2.5 shrink-0 transition-transform" class:rotate-90={!collapsedFolders.has('copilot:' + group.path)} fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                        </svg>
                        <span class="shrink-0">📁</span>
                        <span class="truncate text-gray-400" title={group.displayPath}>{group.folderName}</span>
                        <span class="text-terminal-muted text-[10px] ml-auto shrink-0">{group.sessions.length}</span>
                      </button>
                      {#if !collapsedFolders.has('copilot:' + group.path)}
                        <div class="ml-4 border-l border-terminal-border border-opacity-50">
                          {#each group.sessions as session (session.id)}
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
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {:else if $selectedMachineId}
          <div class="px-4 py-4 text-center text-terminal-muted text-xs border-t border-terminal-border mt-2">
            {#if $tunnelHosts.find(h => h.instanceId === $selectedMachineId)?.status === 'connected'}
              No remote sessions
            {:else}
              Connect to view sessions
            {/if}
          </div>
        {/if}
      {/if}
    {:else}
      <!-- Local context -->
      {#if localSessions.length === 0}
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
                {#each claudeFolderGroups as group (group.path)}
                  <!-- Folder group header -->
                  <button
                    class="w-full pl-3 pr-3 py-1 flex items-center gap-1.5 text-xs text-terminal-muted hover:bg-terminal-border hover:bg-opacity-30 transition-colors"
                    on:click={() => toggleFolderCollapse('claude:' + group.path)}
                    title={group.displayPath}
                  >
                    <svg
                      class="w-2.5 h-2.5 shrink-0 transition-transform"
                      class:rotate-90={!collapsedFolders.has('claude:' + group.path)}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span class="shrink-0">📁</span>
                    <span class="truncate text-gray-400" title={group.displayPath}>{group.folderName}</span>
                    <span class="text-terminal-muted text-[10px] ml-auto shrink-0">{group.sessions.length}</span>
                  </button>

                  {#if !collapsedFolders.has('claude:' + group.path)}
                    <div class="ml-4 border-l border-terminal-border border-opacity-50">
                      {#each group.sessions as session (session.id)}
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
                {#each copilotFolderGroups as group (group.path)}
                  <!-- Folder group header -->
                  <button
                    class="w-full pl-3 pr-3 py-1 flex items-center gap-1.5 text-xs text-terminal-muted hover:bg-terminal-border hover:bg-opacity-30 transition-colors"
                    on:click={() => toggleFolderCollapse('copilot:' + group.path)}
                    title={group.displayPath}
                  >
                    <svg
                      class="w-2.5 h-2.5 shrink-0 transition-transform"
                      class:rotate-90={!collapsedFolders.has('copilot:' + group.path)}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span class="shrink-0">📁</span>
                    <span class="truncate text-gray-400" title={group.displayPath}>{group.folderName}</span>
                    <span class="text-terminal-muted text-[10px] ml-auto shrink-0">{group.sessions.length}</span>
                  </button>

                  {#if !collapsedFolders.has('copilot:' + group.path)}
                    <div class="ml-4 border-l border-terminal-border border-opacity-50">
                      {#each group.sessions as session (session.id)}
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
                {/each}
              </div>
            {/if}
          </div>
        {/if}
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
    {#if $sidebarContext === 'local'}
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
    {/if}
  </div>

  <!-- Resize handle -->
  {#if !collapsed}
    <div
      class="sidebar-resize-handle"
      on:mousedown={startResize}
      role="separator"
      aria-orientation="vertical"
    ></div>
  {/if}
</aside>
