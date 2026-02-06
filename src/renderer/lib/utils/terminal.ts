import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  dispose: () => void;
}

export function createTerminal(container: HTMLElement, sessionId: string): TerminalInstance {
  const terminal = new Terminal({
    theme: {
      background: '#1a1b26',
      foreground: '#c0caf5',
      cursor: '#c0caf5',
      cursorAccent: '#1a1b26',
      selectionBackground: '#33467c',
      selectionForeground: '#c0caf5',
      black: '#15161e',
      brightBlack: '#414868',
      red: '#f7768e',
      brightRed: '#f7768e',
      green: '#9ece6a',
      brightGreen: '#9ece6a',
      yellow: '#e0af68',
      brightYellow: '#e0af68',
      blue: '#7aa2f7',
      brightBlue: '#7aa2f7',
      magenta: '#bb9af7',
      brightMagenta: '#bb9af7',
      cyan: '#7dcfff',
      brightCyan: '#7dcfff',
      white: '#a9b1d6',
      brightWhite: '#c0caf5'
    },
    fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
    fontSize: 14,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: 'block',
    allowTransparency: false,
    scrollback: 10000,
    tabStopWidth: 4,
    // Handle OSC 8 hyperlinks (terminal escape sequences for clickable links)
    linkHandler: {
      activate: (_event: MouseEvent, text: string) => {
        window.api.openExternal(text);
      }
    }
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  terminal.open(container);
  fitAddon.fit();

  // Intercept app shortcuts before they go to the terminal
  terminal.attachCustomKeyEventHandler((event) => {
    // Let these keys bubble up to the app's keydown handler
    if (event.type === 'keydown') {
      // Ctrl+W - close session
      if (event.ctrlKey && event.key === 'w') {
        return false; // Don't handle in terminal, let it bubble
      }
      // Ctrl+Q - quit app
      if (event.ctrlKey && event.key === 'q') {
        return false;
      }
      // Ctrl+1-9 - switch tabs
      if (event.ctrlKey && event.key >= '1' && event.key <= '9') {
        return false;
      }
      // F1-F4 - app shortcuts
      if (['F1', 'F2', 'F3', 'F4'].includes(event.key)) {
        return false;
      }
      // Ctrl+Shift+C - copy selection
      if (event.ctrlKey && event.shiftKey && event.key === 'C') {
        const selection = terminal.getSelection();
        if (selection) {
          window.api.clipboard.writeText(selection);
        }
        return false;
      }
      // Ctrl+Shift+V - paste from clipboard
      if (event.ctrlKey && event.shiftKey && event.key === 'V') {
        const text = window.api.clipboard.readText();
        if (text) {
          window.api.writeToSession(sessionId, text);
        }
        return false;
      }
      // Ctrl+Shift+A - select all
      if (event.ctrlKey && event.shiftKey && event.key === 'A') {
        terminal.selectAll();
        return false;
      }
    }
    return true; // Handle normally in terminal
  });

  // Handle input - send to main process
  terminal.onData((data) => {
    window.api.writeToSession(sessionId, data);
  });

  // Handle resize
  const resizeObserver = new ResizeObserver(() => {
    try {
      fitAddon.fit();
      const { cols, rows } = terminal;
      window.api.resizeSession(sessionId, cols, rows);
    } catch {
      // Ignore resize errors during cleanup
    }
  });

  resizeObserver.observe(container);

  return {
    terminal,
    fitAddon,
    dispose: () => {
      resizeObserver.disconnect();
      terminal.dispose();
    }
  };
}
