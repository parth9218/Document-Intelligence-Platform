import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  glow?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, glow, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          interactive ? 'glass-panel-interactive' : 'glass-panel',
          'rounded-2xl p-6 relative overflow-hidden transition-all duration-300',
          {
            'hover:shadow-primary/10 hover:border-primary/20': interactive,
            'before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/5 before:to-transparent before:-translate-x-full hover:before:animate-shimmer': interactive,
            'shadow-lg shadow-accent/5 ring-1 ring-white/5': glow,
          },
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export const CardHeader = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 mb-4', className)} {...props}>
    {children}
  </div>
);

CardHeader.displayName = 'CardHeader';

export const CardTitle = ({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('font-semibold text-lg leading-none tracking-tight text-foreground', className)} {...props}>
    {children}
  </h3>
);

CardTitle.displayName = 'CardTitle';

export const CardDescription = ({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-sm text-muted', className)} {...props}>
    {children}
  </p>
);

CardDescription.displayName = 'CardDescription';

export const CardContent = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('', className)} {...props}>
    {children}
  </div>
);

CardContent.displayName = 'CardContent';

export const CardFooter = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center mt-6 pt-4 border-t border-white/5', className)} {...props}>
    {children}
  </div>
);

CardFooter.displayName = 'CardFooter';
