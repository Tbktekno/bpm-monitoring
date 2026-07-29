import { IoFolderOpenOutline } from 'react-icons/io5';
import { Button } from './Button';

interface EmptyStateProps {
  message: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ message, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-20 h-20 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
        <IoFolderOpenOutline className="w-10 h-10 text-slate-300" />
      </div>
      <h3 className="text-base font-semibold text-slate-700 mb-1">{message}</h3>
      {description && (
        <p className="text-sm text-slate-400 max-w-sm">{description}</p>
      )}
      {action && (
        <Button variant="primary" onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  );
}
