import React, { useEffect, useRef, useState } from 'react';
import { Box } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { useProfileStore } from '../stores/profile-store.js';
import { useLicenseStore } from '../stores/license-store.js';
import { Loading } from '../components/common/loading.js';
import { ConfirmDialog } from '../components/common/confirm-dialog.js';
import { ProgressLog } from '../components/common/progress-log.js';
import { ResultBanner } from '../components/common/result-banner.js';
import { t } from '../i18n/index.js';
import { useModalStore } from '../stores/modal-store.js';
import * as manager from '../lib/profiles/profile-manager.js';
import { ProfileListMode } from './profiles/profile-list-mode.js';
import { ProfileDetailMode } from './profiles/profile-detail-mode.js';
import { ProfileCreateName, ProfileCreateDesc } from './profiles/profile-create-flow.js';
import { ProfileEditName, ProfileEditDesc } from './profiles/profile-edit-flow.js';
import { SPACING } from '../utils/spacing.js';

type Mode = 'list' | 'detail' | 'create-name' | 'create-desc' | 'confirm-import' | 'importing' | 'edit-name' | 'edit-desc';

export function ProfilesView() {
  const { profileNames, selectedProfile, loading, loadError, fetchProfiles, loadProfile, exportCurrent, deleteProfile, updateProfile } = useProfileStore();
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [importLines, setImportLines] = useState<string[]>([]);
  const [importRunning, setImportRunning] = useState(false);
  const [importHadError, setImportHadError] = useState(false);
  const [importProfile, setImportProfile] = useState<Awaited<ReturnType<typeof manager.loadProfile>> | null>(null);
  const { openModal, closeModal } = useModalStore();
  const importGenRef = useRef<AsyncGenerator<string> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => { fetchProfiles(); }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      importGenRef.current?.return(undefined);
      importGenRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'list') {
      openModal();
      return () => { closeModal(); };
    }
    return undefined;
  }, [mode]);

  useViewInput((input, key) => {
    if (mode !== 'list' || confirmDelete) return;

    if (input === 'n' || input === '1') { setMode('create-name'); return; }
    if ((input === 'd' || input === '4') && profileNames[cursor]) { setConfirmDelete(true); return; }
    if (key.return && profileNames[cursor]) {
      void loadProfile(profileNames[cursor]);
      setMode('detail');
      return;
    }
    if ((input === 'i' || input === '3') && profileNames[cursor]) {
      void prepareImport(profileNames[cursor]);
      return;
    }

    if (input === 'j' || key.downArrow) setCursor((c) => Math.min(c + 1, Math.max(0, profileNames.length - 1)));
    else if (input === 'k' || key.upArrow) setCursor((c) => Math.max(c - 1, 0));
  });

  useViewInput((input, key) => {
    if (key.escape || input === 'q') {
      setMode('list');
      return;
    }
    if ((input === 'e' || input === '2') && selectedProfile) {
      setEditName(selectedProfile.name);
      setEditDesc(selectedProfile.description);
      setMode('edit-name');
    }
  }, { isActive: mode === 'detail' });

  useViewInput(() => {
    setMode('list');
  }, { isActive: mode === 'importing' && !importRunning });

  // SCR-005: Show import summary before starting
  const prepareImport = async (name: string) => {
    try {
      const isPro = useLicenseStore.getState().isPro();
      const profile = await manager.loadProfile(isPro, name);
      setImportProfile(profile);
      setMode('confirm-import');
    } catch (err) {
      setImportLines([`${t('error_prefix')}${err instanceof Error ? err.message : err}`]);
      setMode('importing');
      setImportRunning(false);
    }
  };

  const startImport = async (profile: Awaited<ReturnType<typeof manager.loadProfile>>) => {
    setMode('importing');
    setImportLines([]);
    setImportRunning(true);
    setImportHadError(false);
    try {
      const isPro = useLicenseStore.getState().isPro();
      const gen = manager.importProfile(isPro, profile);
      importGenRef.current = gen;
      for await (const line of gen) {
        if (!mountedRef.current) break;
        setImportLines((prev) => [...prev.slice(-99), line]);
      }
    } catch (err) {
      if (mountedRef.current) {
        setImportHadError(true);
        setImportLines((prev) => [...prev, `${t('error_prefix')}${err instanceof Error ? err.message : err}`]);
      }
    } finally {
      importGenRef.current = null;
      if (mountedRef.current) {
        setImportRunning(false);
      }
    }
  };

  if (loading) return <Loading message={t('loading_profiles')} />;

  if (mode === 'confirm-import' && importProfile) {
    return (
      <Box flexDirection="column">
        <ConfirmDialog
          message={t('profiles_importSummary', {
            formulae: String(importProfile.formulae.length),
            casks: String(importProfile.casks.length),
          })}
          onConfirm={() => {
            const profile = importProfile;
            setImportProfile(null);
            void startImport(profile);
          }}
          onCancel={() => {
            setImportProfile(null);
            setMode('list');
          }}
        />
      </Box>
    );
  }

  if (mode === 'importing') {
    return (
      <Box flexDirection="column">
        <ProgressLog lines={importLines} isRunning={importRunning} title={t('profiles_importTitle')} />
        {!importRunning && (
          <Box marginTop={SPACING.xs}>
            <ResultBanner status={importHadError ? 'error' : 'success'} message={importHadError ? t('profiles_importPartial') : `\u2714 ${t('profiles_importComplete')}`} />
          </Box>
        )}
      </Box>
    );
  }

  if (mode === 'create-name') {
    return <ProfileCreateName onSubmit={(val) => { setNewName(val); setMode('create-desc'); }} />;
  }

  if (mode === 'create-desc') {
    return (
      <ProfileCreateDesc
        name={newName}
        loadError={loadError}
        onSubmit={async (val) => {
          try {
            await exportCurrent(newName, val);
          } finally {
            setMode('list');
            setNewName('');
          }
        }}
      />
    );
  }

  if (mode === 'edit-name') {
    return <ProfileEditName defaultName={editName} onSubmit={(val) => { setEditName(val); setMode('edit-desc'); }} />;
  }

  if (mode === 'edit-desc') {
    return (
      <ProfileEditDesc
        name={editName}
        defaultDesc={editDesc}
        loadError={loadError}
        onSubmit={async (val) => {
          if (selectedProfile) {
            await updateProfile(selectedProfile.name, editName, val);
          }
          setMode('detail');
          setEditName('');
          setEditDesc('');
        }}
      />
    );
  }

  if (mode === 'detail' && selectedProfile) {
    return <ProfileDetailMode profile={selectedProfile} />;
  }

  return (
    <ProfileListMode
      profileNames={profileNames}
      cursor={cursor}
      confirmDelete={confirmDelete}
      loadError={loadError}
      onConfirmDelete={() => { void deleteProfile(profileNames[cursor]); setConfirmDelete(false); }}
      onCancelDelete={() => setConfirmDelete(false)}
    />
  );
}
