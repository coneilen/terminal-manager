/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#1a1b26',
          sidebar: '#16161e',
          border: '#2f3549',
          text: '#c0caf5',
          muted: '#565f89',
          active: '#7aa2f7',
          success: '#9ece6a',
          warning: '#e0af68',
          error: '#f7768e',
          claude: '#d4a574',
          copilot: '#7ee787'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
};
