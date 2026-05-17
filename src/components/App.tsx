import { useRef } from 'react';
import LibraryPanel from './LibraryPanel';
import PreviewCanvas from './PreviewCanvas';
import ControlsPanel from './ControlsPanel';

export default function App() {
  const previewRef = useRef<{ triggerExport: () => void }>(null);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0f1117]">
      {/* Left: Library */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r border-white/10 overflow-hidden">
        <LibraryPanel />
      </div>

      {/* Center: Preview */}
      <div className="flex-1 overflow-hidden relative">
        <PreviewCanvas ref={previewRef} />
      </div>

      {/* Right: Controls */}
      <div className="w-72 flex-shrink-0 flex flex-col border-l border-white/10 overflow-hidden">
        <ControlsPanel onExport={() => previewRef.current?.triggerExport()} />
      </div>
    </div>
  );
}
