import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0 to 100
  status?: 'uploading' | 'processing' | 'success' | 'failed';
  showLabel?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  status = 'processing',
  showLabel = false,
  className,
  ...props
}) => {
  const percent = Math.min(Math.max(value, 0), 100);

  return (
    <div className={cn('w-full flex flex-col space-y-1.5', className)} {...props}>
      {showLabel && (
        <div className="flex justify-between text-xs font-medium text-muted">
          <span>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
          <span>{Math.round(percent)}%</span>
        </div>
      )}
      <div 
        className="w-full h-2 bg-white/5 rounded-full overflow-hidden relative"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden',
            {
              'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]': status === 'uploading',
              'bg-primary shadow-[0_0_8px_rgba(59,130,246,0.5)]': status === 'processing',
              'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]': status === 'success',
              'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]': status === 'failed',
            }
          )}
          style={{ width: `${percent}%` }}
        >
          {/* Internal reflection shimmer to give it a liquid feel */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
        </div>
      </div>
    </div>
  );
};

ProgressBar.displayName = 'ProgressBar';
