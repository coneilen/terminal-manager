import { writable } from 'svelte/store';

export interface Settings {
  sidebarCollapsed: boolean;
  defaultWorkingDir: string;
  showStatusBar: boolean;
}

const defaultSettings: Settings = {
  sidebarCollapsed: false,
  defaultWorkingDir: '~',
  showStatusBar: true
};

// Try to load settings from localStorage
function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem('terminal-manager-settings');
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore errors, use defaults
  }
  return defaultSettings;
}

function createSettingsStore() {
  const { subscribe, set, update } = writable<Settings>(loadSettings());

  return {
    subscribe,
    set: (value: Settings) => {
      localStorage.setItem('terminal-manager-settings', JSON.stringify(value));
      set(value);
    },
    update: (fn: (settings: Settings) => Settings) => {
      update((current) => {
        const updated = fn(current);
        localStorage.setItem('terminal-manager-settings', JSON.stringify(updated));
        return updated;
      });
    },
    toggleSidebar: () => {
      update((current) => {
        const updated = { ...current, sidebarCollapsed: !current.sidebarCollapsed };
        localStorage.setItem('terminal-manager-settings', JSON.stringify(updated));
        return updated;
      });
    }
  };
}

export const settings = createSettingsStore();
