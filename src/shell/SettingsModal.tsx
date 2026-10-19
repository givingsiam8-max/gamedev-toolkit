import { useEffect, useMemo, useState } from 'react';
import { Database, Info, Monitor, Moon, Palette, RotateCcw, Sun, Wrench } from 'lucide-react';
import { useAppState, type ThemeName } from '../core/store';
import { getCategories, getToolCount } from '../core/registry';
import { Badge, Button, Modal, Segmented, SwitchRow } from '../components/ui';

const THEMES: Array<{ value: ThemeName; label: string; icon: React.ReactNode }> = [
  { value: 'dark', label: 'Dark', icon: <Monitor /> },
  { value: 'midnight', label: 'Midnight', icon: <Moon /> },
  { value: 'light', label: 'Light', icon: <Sun /> },
];

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    settings,
    setSetting,
    resetSettings,
    favorites,
    recent,
    usage,
    clearFavorites,
    clearRecent,
    resetAll,
  } = useAppState();

  const [confirmReset, setConfirmReset] = useState(false);
  const stats = useMemo(
    () => ({
      tools: getToolCount(),
      categories: getCategories().length,
      favorites: favorites.length,
      recent: recent.length,
      runs: Object.values(usage).reduce((sum, count) => sum + count, 0),
    }),
    [favorites.length, recent.length, usage],
  );

  useEffect(() => {
    if (!open) setConfirmReset(false);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="stack-lg">
        <div className="stack-sm">
          <div className="section-title">
            <Palette />
            Appearance
          </div>
          <Segmented
            options={THEMES}
            value={settings.theme}
            onChange={(value) => setSetting('theme', value)}
          />
          <SwitchRow
            label="Collapse sidebar"
            hint="Show category icons only — more room for tool interfaces."
            checked={settings.sidebarCollapsed}
            onChange={(value) => setSetting('sidebarCollapsed', value)}
          />
          <SwitchRow
            label="Show file formats on tool cards"
            hint="Displays supported formats such as PNG, FBX, WAV."
            checked={settings.showCardFormats}
            onChange={(value) => setSetting('showCardFormats', value)}
          />
        </div>

        <div className="stack-sm">
          <div className="section-title">
            <Database />
            Local data
          </div>
          <div className="grid-3">
            <div className="stat">
              <span className="stat-label">Favorites</span>
              <span className="stat-value">{stats.favorites}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Recent</span>
              <span className="stat-value">{stats.recent}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Tool runs</span>
              <span className="stat-value">{stats.runs}</span>
            </div>
          </div>
          <p className="field-hint">
            Favorites, history and settings are stored in this browser only. Your files are never
            uploaded — all processing happens on your machine.
          </p>
          <div className="row-wrap">
            <Button size="sm" variant="outline" onClick={clearFavorites} disabled={!stats.favorites}>
              Clear favorites
            </Button>
            <Button size="sm" variant="outline" onClick={clearRecent} disabled={!stats.recent}>
              Clear history
            </Button>
            <Button size="sm" variant="ghost" onClick={resetSettings}>
              Restore default appearance
            </Button>
          </div>
        </div>

        <div className="stack-sm">
          <div className="section-title">
            <Info />
            About
          </div>
          <div className="row-wrap">
            <Badge tone="accent">{stats.tools} tools</Badge>
            <Badge>{stats.categories} categories</Badge>
            <Badge tone="success">Version 0.1.0</Badge>
          </div>
          <p className="field-hint">
            GameDev Toolkit is a modular workspace: every tool is an independent module with its own
            metadata, settings and export logic. New categories and tools can be added without
            changing the navigation, search or dashboard.
          </p>
          <div className="row" style={{ color: 'var(--text-2)' }}>
            <Wrench style={{ width: 15, height: 15 }} />
            <span className="tiny">Desktop-first · works offline after the first load</span>
          </div>
        </div>

        <div className="stack-sm">
          {confirmReset ? (
            <div className="notice notice-warning">
              <RotateCcw style={{ width: 17, height: 17 }} />
              <div className="grow">
                <div className="notice-title">Erase all local preferences?</div>
                This clears favorites, history, usage counts and appearance settings.
                <div className="row" style={{ marginTop: 10 }}>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      resetAll();
                      setConfirmReset(false);
                    }}
                  >
                    Erase everything
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => setConfirmReset(true)}>
              Reset all local data
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
