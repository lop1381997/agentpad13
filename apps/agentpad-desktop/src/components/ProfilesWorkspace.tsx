import { useRef, useState } from "react";
import { exportText } from "../bridge";

import type { AgentPadProfile, EditorSnapshot } from "../model";
import { compareProfile, parseImportedProfile } from "../studio/profile-store";

type ProfilesWorkspaceProps = {
  snapshot?: EditorSnapshot;
  currentMacros?: number[];
  profiles: AgentPadProfile[];
  onCreate: (name: string) => AgentPadProfile | undefined;
  onDuplicate: (profile: AgentPadProfile) => AgentPadProfile | undefined;
  onDelete: (id: string) => void;
  onImport: (profile: AgentPadProfile) => void;
  onPrepare: (profile: AgentPadProfile) => void;
};

async function downloadProfile(profile: AgentPadProfile): Promise<boolean> {
  const filename = profile.name.trim().replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase() + ".agentpad13.json";
  return exportText(filename, JSON.stringify(profile, null, 2));
}

export function ProfilesWorkspace({
  snapshot,
  currentMacros,
  profiles,
  onCreate,
  onDuplicate,
  onDelete,
  onImport,
  onPrepare,
}: ProfilesWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0];
  const changes = snapshot && selected ? compareProfile(snapshot, selected, currentMacros) : [];
  const reviewLabel =
    changes.length + " " + (changes.length === 1 ? "cambio para revisar" : "cambios para revisar");

  const create = () => {
    const nextName = name.trim();
    if (!nextName) {
      setError("Escribe un nombre para el perfil.");
      return;
    }
    const created = onCreate(nextName);
    if (created) {
      setSelectedId(created.id);
      setName("");
      setCreating(false);
      setError(undefined);
    }
  };

  const importProfile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    try {
      onImport(parseImportedProfile(await file.text()));
      setError(undefined);
    } catch (caughtError) {
      setError(String(caughtError));
    }
  };

  return (
    <section className="profiles-workspace" aria-labelledby="profiles-title">
      <div className="workspace-heading workspace-heading-row">
        <div>
          <p className="eyebrow">Local · este ordenador</p>
          <h2 id="profiles-title">Perfiles</h2>
          <p>
            Un perfil es una copia local revisable. El teclado solo cambia cuando prepares el
            perfil y guardes después en AgentPad.
          </p>
        </div>
        <div className="workspace-actions">
          <button type="button" className="secondary-button" onClick={() => setCreating(true)}>
            Nuevo perfil
          </button>
          <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}>
            Importar JSON
          </button>
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importProfile(event.target.files?.[0])}
          />
        </div>
      </div>

      {creating ? (
        <form
          className="profile-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <label htmlFor="profile-name">Nombre del perfil</label>
          <input
            id="profile-name"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="primary-button">
            Guardar perfil
          </button>
          <button type="button" className="text-button" onClick={() => setCreating(false)}>
            Cancelar
          </button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="workspace-error">
          {error}
        </p>
      ) : null}

      <div className="profiles-layout">
        <nav className="profile-list" aria-label="Perfiles locales">
          {profiles.length === 0 ? (
            <p className="empty-state">Todavía no hay perfiles guardados en este ordenador.</p>
          ) : (
            profiles.map((profile) => (
              <button
                type="button"
                key={profile.id}
                className={profile.id === selected?.id ? "profile-item is-selected" : "profile-item"}
                aria-pressed={profile.id === selected?.id}
                onClick={() => setSelectedId(profile.id)}
              >
                <span>{profile.name}</span>
                <small>Actualizado {new Date(profile.updatedAt).toLocaleDateString("es-ES")}</small>
              </button>
            ))
          )}
        </nav>

        {selected ? (
          <article className="profile-review">
            <div className="profile-review-heading">
              <div>
                <p className="eyebrow">Perfil seleccionado</p>
                <h3>{selected.name}</h3>
              </div>
              <span className="global-badge">{reviewLabel}</span>
            </div>

            <div className="profile-diff" aria-label="Cambios del perfil">
              {snapshot ? (
                changes.length > 0 ? (
                  changes.map((change) => (
                    <div key={change.id}>
                      <span>{change.label}</span>
                      <code>
                        {change.before} → {change.after}
                      </code>
                    </div>
                  ))
                ) : (
                  <p className="empty-state">Este perfil ya coincide con el teclado conectado.</p>
                )
              ) : (
                <p className="empty-state">Conecta AgentPad para comparar el perfil antes de aplicarlo.</p>
              )}
            </div>

            <div className="workspace-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!snapshot || changes.length === 0}
                onClick={() => onPrepare(selected)}
              >
                Preparar cambios
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const duplicate = onDuplicate(selected);
                  if (duplicate) {
                    setSelectedId(duplicate.id);
                  }
                }}
              >
                Duplicar
              </button>
              <button type="button" className="secondary-button" onClick={() => void downloadProfile(selected).catch((error) => setError(String(error)))}>
                Exportar JSON
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  onDelete(selected.id);
                  setSelectedId(undefined);
                }}
              >
                Eliminar
              </button>
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}
