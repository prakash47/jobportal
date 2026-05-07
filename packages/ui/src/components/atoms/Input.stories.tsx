import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './Input';
import { Label } from './Label';

const meta: Meta<typeof Input> = {
  title: 'Atoms/Input',
  component: Input,
  args: { placeholder: 'name@company.com' },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Invalid: Story = { args: { invalid: true, defaultValue: 'not an email' } };

export const WithLabel: Story = {
  render: () => (
    <div className="w-80 space-y-1.5">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="name@company.com" />
    </div>
  ),
};
