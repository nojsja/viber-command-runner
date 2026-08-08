import { Hero } from './Hero';
import { MetaGrid } from './MetaGrid';
import { CommandsPanel } from './CommandsPanel';
import { HistoryPanel } from './HistoryPanel';
import { ReleaseTerminal } from './ReleaseTerminal';
import { StickyTerminal } from './StickyTerminal';
import { InteractivePromptOverlay } from './InteractivePromptOverlay';
import { ConfirmOverlay } from './ConfirmOverlay';
import { AppToast } from './AppToast';
import { GlobalLoading } from './GlobalLoading';

export function App() {
  return (
    <div class="app">
      <Hero />
      <MetaGrid />
      <StickyTerminal />
      <div class="content-grid">
        <CommandsPanel />
        <HistoryPanel />
      </div>
      <ReleaseTerminal />
      <InteractivePromptOverlay />
      <ConfirmOverlay />
      <AppToast />
      <GlobalLoading />
    </div>
  );
}
