
import React from 'react';

interface NumericControlProps {
  label: string;
  value: number; 
  onChange: (newValue: number) => void;
  vertical?: boolean;
  min?: number;
  max?: number;
  // Optional function to determine the step based on current value
  getStep?: (current: number, direction: number) => number;
}

const NumericControl: React.FC<NumericControlProps> = ({ 
  label, 
  value, 
  onChange, 
  vertical = false,
  min = 0,
  max = 100,
  getStep
}) => {
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const direction = e.deltaY > 0 ? -1 : 1;
    
    // Determine the step size
    const step = getStep ? getStep(value, direction) : 1;
    
    // Calculate next value with precision handling to avoid floating point errors
    const nextValue = parseFloat((value + direction * step).toFixed(2));
    const clampedValue = Math.min(max, Math.max(min, nextValue));
    
    onChange(clampedValue);
  };

  // Format value for display: hide decimals if it's an integer, show up to 1 for floats
  const displayValue = value % 1 === 0 ? value.toString() : value.toFixed(1);

  return (
    <div 
      onWheel={handleWheel}
      className={`flex items-center gap-2 group cursor-ns-resize transition-all ${vertical ? 'flex-col' : 'flex-row'}`}
    >
      <span className={`text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white/80 transition-colors ${vertical ? 'transform -rotate-90 mb-4' : ''}`}>
        {label}
      </span>
      <div className="relative font-mono font-black text-2xl text-white/90 group-hover:text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
        {displayValue}
      </div>
    </div>
  );
};

export default NumericControl;
