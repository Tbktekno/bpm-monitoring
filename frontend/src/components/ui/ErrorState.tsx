import { IoAlertCircleOutline } from 'react-icons/io5';
import { Button } from './Button';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Terjadi kesalahan saat memuat data', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-20 h-20 rounded-2xl bg-danger-50 flex items-center justify-center mb-4">
        <IoAlertCircleOutline className="w-10 h-10 text-danger-400" />
      </div>
      <h3 className="text-base font-semibold text-slate-700 mb-1">{message}</h3>
      <p className="text-sm text-slate-400 mb-4">Silakan coba lagi atau hubungi administrator</p>
      {onRetry && (
        <Button variant="primary" onClick={onRetry}>
          Coba Lagi
        </Button>
      )}
    </div>
  );
}
