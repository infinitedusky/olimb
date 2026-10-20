import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge } from './Badge'

const meta = { title: 'Components/Badge', component: Badge, args: { children: 'Homework Gate' } } satisfies Meta<typeof Badge>
export default meta
type Story = StoryObj<typeof meta>

export const Neutral: Story = {}
export const Ok: Story = { args: { tone: 'ok', dot: true, children: 'connected' } }
export const Warn: Story = { args: { tone: 'warn', dot: true, children: 'pending' } }
export const Bad: Story = { args: { tone: 'bad', dot: true, children: 'metric fell' } }
export const Accent: Story = { args: { tone: 'accent', children: '2 PRs' } }
