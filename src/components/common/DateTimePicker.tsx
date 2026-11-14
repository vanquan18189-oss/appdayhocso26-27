import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import {
  parseDateTimeVN,
  formatDateTimeVN,
  getVNDateComponents,
  createDateFromVNComponents,
  validateStrictDateTimeInputVN,
  toDateTimeLocalValue
} from '../../utils/dateUtils';

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  format?: 'dd/mm/yyyy HH:mm' | 'MM/DD/YYYY hh:mm A';
  onValidationChange?: (isValid: boolean, error?: string) => void;
}

const MONTH_NAMES_VI = [
  'Tháng 01', 'Tháng 02', 'Tháng 03', 'Tháng 04', 'Tháng 05', 'Tháng 06',
  'Tháng 07', 'Tháng 08', 'Tháng 09', 'Tháng 10', 'Tháng 11', 'Tháng 12'
];

export const DateTimePicker: React.FC<DateTimePickerProps> = ({
  value,
  onChange,
  placeholder = 'DD/MM/YYYY HH:mm (24 giờ)',
  className = '',
  disabled = false,
  onValidationChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);

  const getInitialComponents = (valStr: string) => {
    const parsed = parseDateTimeVN(valStr);
    const target = parsed || new Date();
    const comp = getVNDateComponents(target);
    return {
      year: comp.year,
      month: comp.month - 1, // 0-indexed for calendar UI
      day: comp.day,
      hour24: comp.hour,
      minute: comp.minute
    };
  };

  const initial = getInitialComponents(value);
  const [selectedYear, setSelectedYear] = useState(initial.year);
  const [selectedMonth, setSelectedMonth] = useState(initial.month);
  const [selectedDay, setSelectedDay] = useState(initial.day);
  const [selectedHour24, setSelectedHour24] = useState(initial.hour24);
  const [selectedMinute, setSelectedMinute] = useState(initial.minute);

  // Text shown in the input box: always normalized to DD/MM/YYYY HH:mm (24h) when valid
  const [inputText, setInputText] = useState<string>(() => {
    if (!value) return '';
    if (value.trim().toLowerCase() === 'vô thời hạn') return 'Vô thời hạn';
    return formatDateTimeVN(value, value);
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync internal state when external value prop changes
  useEffect(() => {
    if (!value) {
      setInputText('');
      setValidationError(null);
      return;
    }
    if (value.trim().toLowerCase() === 'vô thời hạn') {
      setInputText('Vô thời hạn');
      setValidationError(null);
      return;
    }

    const parsed = parseDateTimeVN(value);
    if (parsed) {
      const comp = getVNDateComponents(parsed);
      setSelectedYear(comp.year);
      setSelectedMonth(comp.month - 1);
      setSelectedDay(comp.day);
      setSelectedHour24(comp.hour);
      setSelectedMinute(comp.minute);
      const formatted = formatDateTimeVN(parsed);
      setInputText(formatted);
      setValidationError(null);
      onValidationChange?.(true);
    } else {
      setInputText(value);
      const check = validateStrictDateTimeInputVN(value);
      setValidationError(check.valid ? null : (check.error || 'Định dạng ngày giờ không hợp lệ'));
      onValidationChange?.(check.valid, check.error);
    }
  }, [value]);

  // Click outside to close popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const emitValidComponents = (y: number, m0To11: number, d: number, h24: number, min: number) => {
    const dd = String(d).padStart(2, '0');
    const mm = String(m0To11 + 1).padStart(2, '0');
    const yyyy = String(y);
    const hh = String(h24).padStart(2, '0');
    const minStr = String(min).padStart(2, '0');
    const formatted = `${dd}/${mm}/${yyyy} ${hh}:${minStr}`;
    setInputText(formatted);
    setValidationError(null);
    onValidationChange?.(true);
    onChange(formatted);
  };

  const handleManualInputChange = (raw: string) => {
    setInputText(raw);
    if (!raw.trim()) {
      setValidationError('Vui lòng nhập ngày giờ theo định dạng DD/MM/YYYY HH:mm (24 giờ).');
      onValidationChange?.(false, 'Vui lòng nhập ngày giờ');
      onChange(raw);
      return;
    }

    const check = validateStrictDateTimeInputVN(raw);
    if (!check.valid) {
      setValidationError(check.error || 'Định dạng không hợp lệ. Chuẩn: DD/MM/YYYY HH:mm (24 giờ).');
      onValidationChange?.(false, check.error);
      onChange(raw);
      return;
    }

    setValidationError(null);
    onValidationChange?.(true);
    if (check.date) {
      const comp = getVNDateComponents(check.date);
      setSelectedYear(comp.year);
      setSelectedMonth(comp.month - 1);
      setSelectedDay(comp.day);
      setSelectedHour24(comp.hour);
      setSelectedMinute(comp.minute);
    }
    onChange(check.display || raw);
  };

  const handleNativeDateTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // "YYYY-MM-DDTHH:mm"
    if (!val) return;
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m1To12 = parseInt(match[2], 10);
      const d = parseInt(match[3], 10);
      const h24 = parseInt(match[4], 10);
      const min = parseInt(match[5], 10);
      const dateObj = createDateFromVNComponents(y, m1To12, d, h24, min, 0);
      if (dateObj) {
        setSelectedYear(y);
        setSelectedMonth(m1To12 - 1);
        setSelectedDay(d);
        setSelectedHour24(h24);
        setSelectedMinute(min);
        emitValidComponents(y, m1To12 - 1, d, h24, min);
      }
    }
  };

  const handleSelectDay = (d: number, mOffset = 0) => {
    let newMonth = selectedMonth + mOffset;
    let newYear = selectedYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    setSelectedYear(newYear);
    setSelectedMonth(newMonth);
    setSelectedDay(d);
    emitValidComponents(newYear, newMonth, d, selectedHour24, selectedMinute);
  };

  const handleSelectHour24 = (h24: number) => {
    setSelectedHour24(h24);
    emitValidComponents(selectedYear, selectedMonth, selectedDay, h24, selectedMinute);
  };

  const handleSelectMinute = (min: number) => {
    setSelectedMinute(min);
    emitValidComponents(selectedYear, selectedMonth, selectedDay, selectedHour24, min);
  };

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const handleToday = () => {
    const comp = getVNDateComponents(new Date());
    setSelectedYear(comp.year);
    setSelectedMonth(comp.month - 1);
    setSelectedDay(comp.day);
    setSelectedHour24(comp.hour);
    setSelectedMinute(comp.minute);
    emitValidComponents(comp.year, comp.month - 1, comp.day, comp.hour, comp.minute);
  };

  // Calendar Grid Calculation
  const firstDayOfMonth = new Date(selectedYear, selectedMonth, 1).getDay();
  const daysInCurrentMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(selectedYear, selectedMonth, 0).getDate();

  const prevMonthDays: number[] = [];
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    prevMonthDays.push(daysInPrevMonth - i);
  }

  const currentMonthDays: number[] = [];
  for (let i = 1; i <= daysInCurrentMonth; i++) {
    currentMonthDays.push(i);
  }

  const totalCells = prevMonthDays.length + currentMonthDays.length;
  const nextMonthDaysCount = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  const nextMonthDays: number[] = [];
  for (let i = 1; i <= nextMonthDaysCount; i++) {
    nextMonthDays.push(i);
  }

  const hours24List = Array.from({ length: 24 }, (_, idx) => idx); // 00 .. 23
  const minutesList = Array.from({ length: 60 }, (_, idx) => idx); // 00 .. 59

  return (
    <div ref={containerRef} className={`relative inline-block w-full ${className}`}>
      {/* Controlled DD/MM/YYYY HH:mm (24h) Input + Native datetime-local trigger */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl cursor-pointer transition-colors shadow-2xs ${
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-50 border-slate-300' : ''
        } ${
          validationError
            ? 'border-rose-500 ring-2 ring-rose-100 bg-rose-50/20'
            : isOpen
            ? 'border-indigo-600 ring-2 ring-indigo-100'
            : 'border-slate-300 hover:border-indigo-500'
        }`}
      >
        <input
          type="text"
          value={inputText}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => handleManualInputChange(e.target.value)}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) setIsOpen(true);
          }}
          className="w-full bg-transparent font-semibold text-slate-800 text-sm focus:outline-none font-mono"
        />

        {/* Hidden native datetime-local input for browser picker support */}
        <input
          ref={nativeInputRef}
          type="datetime-local"
          disabled={disabled}
          value={toDateTimeLocalValue(inputText)}
          onChange={handleNativeDateTimeChange}
          className="sr-only"
          tabIndex={-1}
        />

        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) setIsOpen(!isOpen);
          }}
          title="Chọn ngày giờ (DD/MM/YYYY HH:mm - 24 giờ)"
          className="p-1 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer shrink-0"
        >
          <CalendarIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Inline Red Validation Error */}
      {validationError && !disabled && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] font-semibold text-rose-600">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{validationError}</span>
        </div>
      )}

      {/* 24-Hour Vietnamese Calendar Popover */}
      {isOpen && !disabled && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 flex flex-col sm:flex-row gap-4 min-w-[330px] sm:min-w-[420px] animate-in fade-in-50 zoom-in-95 duration-150">
          {/* Left Column: Calendar (DD/MM/YYYY) */}
          <div className="flex-1 min-w-[215px]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-extrabold text-slate-800">
                {MONTH_NAMES_VI[selectedMonth]} / {selectedYear}
              </span>

              <div className="flex items-center gap-1 text-slate-500">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  title="Tháng trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  title="Tháng sau"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekdays Header */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((day) => (
                <div key={day} className="text-[11px] font-bold text-slate-400 py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {prevMonthDays.map((d) => (
                <button
                  key={`prev-${d}`}
                  type="button"
                  onClick={() => handleSelectDay(d, -1)}
                  className="h-8 text-xs text-slate-300 hover:bg-slate-50 rounded-lg flex items-center justify-center font-medium cursor-pointer"
                >
                  {d}
                </button>
              ))}

              {currentMonthDays.map((d) => {
                const isSelected = selectedDay === d;
                return (
                  <button
                    key={`curr-${d}`}
                    type="button"
                    onClick={() => handleSelectDay(d, 0)}
                    className={`h-8 text-xs rounded-lg flex items-center justify-center transition-colors cursor-pointer font-bold ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}

              {nextMonthDays.map((d) => (
                <button
                  key={`next-${d}`}
                  type="button"
                  onClick={() => handleSelectDay(d, 1)}
                  className="h-8 text-xs text-slate-300 hover:bg-slate-50 rounded-lg flex items-center justify-center font-medium cursor-pointer"
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-xs font-semibold">
              <span className="text-[11px] text-slate-400 font-mono">
                Chuẩn 24h: DD/MM/YYYY
              </span>
              <button
                type="button"
                onClick={handleToday}
                className="text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer font-bold"
              >
                Hôm nay (Hiện tại)
              </button>
            </div>
          </div>

          <div className="hidden sm:block w-px bg-slate-100 my-1" />

          {/* Right Column: 24-Hour Time Picker (00..23 : 00..59) */}
          <div className="w-full sm:w-36 flex flex-col justify-between pt-1 sm:pt-0">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center mb-1.5">
                Giờ : Phút (24h)
              </div>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <div className="bg-indigo-600 text-white text-xs font-black py-1.5 px-2 rounded-lg text-center font-mono">
                  {String(selectedHour24).padStart(2, '0')} giờ
                </div>
                <div className="bg-indigo-600 text-white text-xs font-black py-1.5 px-2 rounded-lg text-center font-mono">
                  {String(selectedMinute).padStart(2, '0')} phút
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 h-44 overflow-hidden">
                {/* 24 Hours (00..23) */}
                <div className="overflow-y-auto space-y-1 pr-0.5 scrollbar-thin">
                  {hours24List.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handleSelectHour24(h)}
                      className={`w-full py-1 text-xs font-mono font-semibold rounded text-center transition-colors cursor-pointer ${
                        selectedHour24 === h
                          ? 'bg-indigo-600 text-white font-black'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {String(h).padStart(2, '0')}
                    </button>
                  ))}
                </div>

                {/* 60 Minutes (00..59) */}
                <div className="overflow-y-auto space-y-1 pr-0.5 scrollbar-thin">
                  {minutesList.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleSelectMinute(m)}
                      className={`w-full py-1 text-xs font-mono font-semibold rounded text-center transition-colors cursor-pointer ${
                        selectedMinute === m
                          ? 'bg-indigo-600 text-white font-black'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {String(m).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
