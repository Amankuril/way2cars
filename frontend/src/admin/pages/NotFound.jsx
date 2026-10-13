import { Compass } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader.jsx';
import { EmptyState } from '@/components/EmptyState.jsx';
import { ButtonLink } from '@/components/Button.jsx';

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <div className="panel">
        <EmptyState
          icon={Compass}
          title="This page doesn’t exist"
          description="The link may be outdated, or the record was removed."
          action={<ButtonLink to="/" variant="primary">Back to dashboard</ButtonLink>}
        />
      </div>
    </>
  );
}
