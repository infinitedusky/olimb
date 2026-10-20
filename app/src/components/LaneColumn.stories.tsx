import type { Meta, StoryObj } from '@storybook/react-vite'
import { LaneColumn } from './LaneColumn'
import { bareIdea, sampleIdea } from '../fixtures'

const meta = { title: 'Components/LaneColumn', component: LaneColumn,
  args: { label: 'Building', hint: 'Agents are producing PRs for these', ideas: [sampleIdea, bareIdea] },
  decorators: [(S) => <div style={{ maxWidth: 380 }}><S /></div>] } satisfies Meta<typeof LaneColumn>
export default meta
type Story = StoryObj<typeof meta>

export const WithIdeas: Story = {}
export const Empty: Story = { args: { ideas: [] } }
