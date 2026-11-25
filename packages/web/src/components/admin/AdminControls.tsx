import { useEffect, useRef, useState } from 'react';

export function SliderField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  debounceMs?: number;
}) {
  const { label, value, min, max, step, onChange, debounceMs = 150 } = props;
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleChange = (nextVal: number) => {
    setDraft(nextVal);
    if (debounceMs <= 0) {
      onChange(nextVal);
      return;
    }
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onChange(nextVal);
    }, debounceMs);
  };

  return (
    <label className="block text-xs">
      <div className="mb-1 flex justify-between text-slate-300">
        <span>{label}</span>
        <span className="font-mono text-cyan-300">{draft}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="w-full accent-cyan-400"
      />
    </label>
  );
}

export function ToggleChip(props: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => props.onChange(!props.checked)}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        props.checked
          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
          : 'border-slate-700 bg-slate-900 text-slate-400'
      }`}
    >
      {props.label}: {props.checked ? 'ON' : 'OFF'}
    </button>
  );
}
