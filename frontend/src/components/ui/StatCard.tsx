import { type ReactNode } from 'react';
import { Card } from './Card';
import { motion } from 'framer-motion';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  trend?: { value: string; isUp: boolean };
  color?: 'primary' | 'success' | 'warning' | 'danger';
  onClick?: () => void;
}

const colorStyles = {
  primary: {
    bg: 'bg-primary-50',
    icon: 'text-primary-500',
    border: 'border-primary-100',
  },
  success: {
    bg: 'bg-success-50',
    icon: 'text-success-500',
    border: 'border-success-100',
  },
  warning: {
    bg: 'bg-warning-50',
    icon: 'text-warning-500',
    border: 'border-warning-100',
  },
  danger: {
    bg: 'bg-danger-50',
    icon: 'text-danger-500',
    border: 'border-danger-100',
  },
};

export function StatCard({ icon, label, value, trend, color = 'primary', onClick }: StatCardProps) {
  const styles = colorStyles[color];

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 300 }}
    >
      <Card className={`card-hover ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl ${styles.bg} ${styles.icon} flex-shrink-0`}>
            <span className="w-6 h-6 flex items-center justify-center">{icon}</span>
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
          </div>
          {trend && (
            <span className={`text-xs font-medium flex items-center gap-0.5 flex-shrink-0 ${
              trend.isUp ? 'text-success-500' : 'text-danger-500'
            }`}>
              {trend.value}
            </span>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
