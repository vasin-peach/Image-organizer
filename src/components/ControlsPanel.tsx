import { useConfigStore } from '../store/config';
import LayoutControls from './controls/LayoutControls';
import SortControls from './controls/SortControls';
import StyleControls from './controls/StyleControls';
import ExportControls from './controls/ExportControls';

const TABS = [
  { id: 'layout', label: 'Layout' },
  { id: 'sort', label: 'Sort' },
  { id: 'style', label: 'Style' },
  { id: 'export', label: 'Export' },
] as const;

interface Props {
  onExport: () => void;
}

export default function ControlsPanel({ onExport }: Props) {
  const { activeTab, setActiveTab } = useConfigStore();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-white/10">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTab === 'layout' && <LayoutControls />}
        {activeTab === 'sort' && <SortControls />}
        {activeTab === 'style' && <StyleControls />}
        {activeTab === 'export' && <ExportControls onExport={onExport} />}
      </div>
    </div>
  );
}
