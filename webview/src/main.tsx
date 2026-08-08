import { render } from 'preact';
import { PanelProvider } from './context/PanelContext';
import { App } from './components/App';
import './styles/main.css';

const root = document.getElementById('root');
if (root) {
  render(
    <PanelProvider>
      <App />
    </PanelProvider>,
    root,
  );
}
