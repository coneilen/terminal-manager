<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Sidebar from './lib/components/Sidebar.svelte';
  import TabBar from './lib/components/TabBar.svelte';
  import Terminal from './lib/components/Terminal.svelte';
  import StatusBar from './lib/components/StatusBar.svelte';
  import NewSessionDialog from './lib/components/NewSessionDialog.svelte';
  import ImportSessionDialog from './lib/components/ImportSessionDialog.svelte';
  import {
    sessions,
    activeSessionId,
    addSession,
    removeSession,
    updateSession,
    setActiveSession,
    switchToNextSession,
    switchToPreviousSession,
    switchToSessionByIndex
  } from './lib/stores/sessions';
  import { settings } from './lib/stores/settings';

  let showNewSessionDialog = false;
  let showImportDialog = false;
  let cleanupFunctions: (() => void)[] = [];

  onMount(() => {
    // Set up keyboard shortcuts first (these work regardless of API)
    const handleKeydown = (e: KeyboardEvent) => {
      // F1 - Toggle sidebar
      if (e.key === 'F1') {
        e.preventDefault();
        settings.toggleSidebar();
      }
      // F2 - New session dialog
      else if (e.key === 'F2') {
        e.preventDefault();
        showNewSessionDialog = true;
      }
      // F3 - Next tab
      else if (e.key === 'F3') {
        e.preventDefault();
        switchToNextSession();
      }
      // F4 - Previous tab
      else if (e.key === 'F4') {
        e.preventDefault();
        switchToPreviousSession();
      }
      // Ctrl+W - Close current tab
      else if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if ($activeSessionId) {
          handleCloseSession($activeSessionId);
        }
      }
      // Ctrl+1-9 - Switch to tab N
      else if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        switchToSessionByIndex(index);
      }
      // Ctrl+Q - Quit app
      else if (e.ctrlKey && e.key === 'q') {
        e.preventDefault();
        window.api?.quitApp();
      }
      // Escape - Close dialog if open
      else if (e.key === 'Escape') {
        if (showNewSessionDialog) {
          e.preventDefault();
          showNewSessionDialog = false;
        }
      }
    };

    window.addEventListener('keydown', handleKeydown);
    cleanupFunctions.push(() => window.removeEventListener('keydown', handleKeydown));

    // Set up IPC listeners if API is available
    if (!window.api) {
      console.error('window.api is not available - preload script may have failed');
      return;
    }

    const cleanupOutput = window.api.onSessionOutput((id, data) => {
      // Terminal component handles this directly
    });

    const cleanupExit = window.api.onSessionExit((id, exitCode) => {
      console.log(`Session ${id} exited with code ${exitCode}`);
      // Session status will be updated via onSessionUpdate - don't remove
    });

    const cleanupUpdate = window.api.onSessionUpdate((session) => {
      updateSession(session);
    });

    cleanupFunctions.push(cleanupOutput, cleanupExit, cleanupUpdate);

    // Load existing sessions
    window.api.listSessions().then((existingSessions) => {
      existingSessions.forEach((session) => {
        addSession(session);
      });
    });
  });

  onDestroy(() => {
    cleanupFunctions.forEach((fn) => fn());
  });

  async function handleCreateSession(type: 'claude' | 'copilot', workingDir: string) {
    const result = await window.api.createSession(type, workingDir);
    if (result.success && result.session) {
      addSession(result.session);
    } else {
      console.error('Failed to create session:', result.error);
    }
    showNewSessionDialog = false;
  }

  async function handleCloseSession(id: string) {
    await window.api.closeSession(id);
    // Session will be marked as closed via onSessionUpdate, but stays in list
  }

  async function handleRemoveSession(id: string) {
    const result = await window.api.removeSession(id);
    if (result.success) {
      removeSession(id);
    }
  }

  async function handleRestartSession(id: string) {
    const result = await window.api.restartSession(id);
    if (result.success && result.session) {
      updateSession(result.session);
    }
  }

  async function handleSessionClick(id: string, status: string) {
    if (status === 'closed') {
      // Restart inactive session
      await handleRestartSession(id);
    }
    // Always switch to the session
    setActiveSession(id);
  }

  async function handleImportSession(project: string, name: string) {
    const result = await window.api.importSession(project, name);
    if (result.success && result.session) {
      addSession(result.session);
    }
    showImportDialog = false;
  }

  async function handleLoadFromFile() {
    const filePath = await window.api.openSessionsFileDialog();
    if (!filePath) return;

    const result = await window.api.loadSessionsFromFile(filePath);
    if (result.success && result.sessions) {
      result.sessions.forEach(session => addSession(session));
      console.log(`Loaded ${result.count} sessions from ${filePath}`);
    } else {
      console.error('Failed to load sessions:', result.error);
      alert(`Failed to load sessions: ${result.error}`);
    }
  }
</script>

<div class="flex h-screen" style="background-color: #1a1b26; color: #c0caf5;">
  <!-- Title bar drag region (for frameless window) -->
  <div class="title-bar-drag absolute top-0 left-0 right-0 h-8 z-50"></div>

  <!-- Sidebar -->
  <Sidebar
    collapsed={$settings.sidebarCollapsed}
    on:newSession={() => (showNewSessionDialog = true)}
    on:importSessions={() => (showImportDialog = true)}
    on:loadFromFile={handleLoadFromFile}
    on:closeSession={(e) => handleCloseSession(e.detail)}
    on:removeSession={(e) => handleRemoveSession(e.detail)}
    on:sessionClick={(e) => handleSessionClick(e.detail.id, e.detail.status)}
  />

  <!-- Main content area -->
  <div class="flex-1 flex flex-col min-w-0">
    <!-- Tab bar -->
    <TabBar on:closeTab={(e) => handleCloseSession(e.detail)} on:newTab={() => (showNewSessionDialog = true)} />

    <!-- Terminal area -->
    <div class="flex-1 min-h-0">
      {#if $activeSessionId}
        {#each $sessions as session (session.id)}
          <div class="h-full" class:hidden={session.id !== $activeSessionId}>
            <Terminal sessionId={session.id} />
          </div>
        {/each}
      {:else}
        <div class="h-full flex items-center justify-center text-terminal-muted">
          <div class="text-center">
            <p class="text-lg mb-2">No active sessions</p>
            <p class="text-sm">Press <kbd class="px-2 py-1 bg-terminal-sidebar rounded">F2</kbd> to create a new session</p>
          </div>
        </div>
      {/if}
    </div>

    <!-- Status bar -->
    {#if $settings.showStatusBar}
      <StatusBar />
    {/if}
  </div>

  <!-- New session dialog -->
  {#if showNewSessionDialog}
    <NewSessionDialog
      on:create={(e) => handleCreateSession(e.detail.type, e.detail.workingDir)}
      on:close={() => (showNewSessionDialog = false)}
    />
  {/if}

  <!-- Import session dialog -->
  {#if showImportDialog}
    <ImportSessionDialog
      on:import={(e) => handleImportSession(e.detail.project, e.detail.name)}
      on:close={() => (showImportDialog = false)}
    />
  {/if}
</div>
