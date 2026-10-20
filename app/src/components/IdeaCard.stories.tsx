import type { Meta, StoryObj } from '@storybook/react-vite'
import { IdeaCard } from './IdeaCard'
import { bareIdea, sampleIdea } from '../fixtures'

const meta = { title: 'Components/IdeaCard', component: IdeaCard, decorators: [(S) => <div style={{ maxWidth: 360 }}><S /></div>] } satisfies Meta<typeof IdeaCard>
export default meta
type Story = StoryObj<typeof meta>

export const WithEvidence: Story = { args: { idea: sampleIdea } }
export const JustCaptured: Story = { args: { idea: bareIdea } }
