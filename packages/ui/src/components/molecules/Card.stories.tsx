import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '../atoms/Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './Card';

const meta: Meta<typeof Card> = {
  title: 'Molecules/Card',
  component: Card,
};

export default meta;
type Story = StoryObj<typeof Card>;

export const JobCard: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Senior Frontend Engineer</CardTitle>
        <CardDescription>Acme Corp · Bangalore · Full-time</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Build the next generation of our customer-facing dashboards. React, TypeScript,
          server components.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="ghost">Save</Button>
        <Button variant="primary">Apply</Button>
      </CardFooter>
    </Card>
  ),
};
