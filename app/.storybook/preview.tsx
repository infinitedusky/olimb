import type { Preview } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router'
import '../src/tokens.css'
import '../src/app.css'

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'todo' },
  },
  globalTypes: {
    theme: { description: 'Colour scheme', toolbar: { title: 'Theme', icon: 'mirror', items: ['system', 'light', 'dark'], dynamicTitle: true } },
  },
  initialGlobals: { theme: 'system' },
  decorators: [
    (Story, { globals }) => {
      const root = document.documentElement
      if (globals.theme === 'system') delete root.dataset.theme
      else root.dataset.theme = globals.theme
      return <MemoryRouter><Story /></MemoryRouter>
    },
  ],
}

export default preview
