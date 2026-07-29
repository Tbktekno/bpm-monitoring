interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  startLabel?: string;
  endLabel?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  startLabel = 'Tanggal Mulai',
  endLabel = 'Tanggal Akhir',
}: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <label className="block text-xs font-medium text-slate-500 mb-1">{startLabel}</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="input-field text-sm"
        />
      </div>
      <span className="text-slate-300 mt-5">—</span>
      <div className="flex-1">
        <label className="block text-xs font-medium text-slate-500 mb-1">{endLabel}</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="input-field text-sm"
        />
      </div>
    </div>
  );
}
