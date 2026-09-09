import { IconCopy, IconFileExport, IconShieldCheck } from "@tabler/icons-react";
import { useState } from "react";
import { exportText } from "../bridge";

import type { EditorSnapshot, MacroBuffer, VialRgbSnapshot } from "../model";

type DiagnosticsWorkspaceProps = {
  snapshot?: EditorSnapshot;
  lighting?: VialRgbSnapshot;
  macros?: MacroBuffer;
  lastSuccessfulRead?: string;
  lastSuccessfulSave?: string;
};

function diagnosticReport(
  snapshot: EditorSnapshot | undefined,
  lighting: VialRgbSnapshot | undefined,
  macros: MacroBuffer | undefined,
  lastSuccessfulRead: string | undefined,
  lastSuccessfulSave: string | undefined,
): string {
  return [
    "AgentPad13 Studio · diagnóstico local",
    "Vial HID: VID:PID 303A:8360 · usage FF60:0061 · report ID none · 32 bytes",
    "Estado: " + (snapshot ? "sesión Vial conectada" : "sin sesión Vial"),
    "Capas: " + (snapshot?.layers.length ?? 0) + " / 8",
    "VialRGB: " + (lighting ? "protocolo " + lighting.info.protocol_version : "sin lectura"),
    "Macros Vial: " + (macros ? macros.count + " slots · " + macros.bytes.length + " bytes" : "sin lectura"),
    "Última lectura: " + (lastSuccessfulRead ?? "ninguna"),
    "Último guardado: " + (lastSuccessfulSave ?? "ninguno"),
    "Canal OAI reservado para Codex — AgentPad13 Studio no lo abre ni lo controla.",
  ].join("\n");
}

export function DiagnosticsWorkspace({
  snapshot,
  lighting,
  macros,
  lastSuccessfulRead,
  lastSuccessfulSave,
}: DiagnosticsWorkspaceProps) {
  const [notice, setNotice] = useState<string>();
  const report = diagnosticReport(snapshot, lighting, macros, lastSuccessfulRead, lastSuccessfulSave);

  const copyReport = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Portapapeles no disponible.");
      await navigator.clipboard.writeText(report);
      setNotice("Informe copiado.");
    } catch (error) {
      setNotice("No se pudo copiar: " + String(error));
    }
  };

  const exportReport = async () => {
    try {
      const saved = await exportText("agentpad13-diagnostico.txt", report);
      setNotice(saved ? "Informe exportado." : "Exportación cancelada.");
    } catch (error) {
      setNotice("No se pudo exportar: " + String(error));
    }
  };

  return (
    <section className="diagnostics-workspace" aria-labelledby="diagnostics-title">
      <div className="workspace-heading workspace-heading-row">
        <div>
          <p className="eyebrow">Vial · solo hechos verificables</p>
          <h2 id="diagnostics-title">Diagnóstico</h2>
          <p>Información de la sesión actual y un informe local que puedes copiar o guardar.</p>
        </div>
        <div className="workspace-actions">
          <button type="button" className="secondary-button" onClick={() => void copyReport()}>
            <IconCopy size={17} stroke={1.8} />
            Copiar informe
          </button>
          <button type="button" className="secondary-button" onClick={() => void exportReport()}>
            <IconFileExport size={17} stroke={1.8} />
            Exportar
          </button>
        </div>
      </div>

      {notice ? <p role="status">{notice}</p> : null}

      <div className="diagnostics-grid">
        <article className="diagnostic-card">
          <p className="eyebrow">Contrato Vial</p>
          <h3>303A:8360 · FF60:0061</h3>
          <p>Sin report ID · reportes de 32 bytes · ocho capas de 4×4.</p>
        </article>
        <article className="diagnostic-card">
          <p className="eyebrow">Sesión</p>
          <h3>{snapshot ? "Conectada" : "Sin conectar"}</h3>
          <p>Última lectura: {lastSuccessfulRead ?? "todavía no hay una lectura completa"}.</p>
        </article>
        <article className="diagnostic-card">
          <p className="eyebrow">Estado local</p>
          <h3>{lighting ? "VialRGB disponible" : "VialRGB pendiente"}</h3>
          <p>Último guardado: {lastSuccessfulSave ?? "todavía no hay un guardado desde Studio"}.</p>
        </article>
      </div>

      <div className="oai-contract" role="note">
        <IconShieldCheck size={20} stroke={1.8} />
        <p>Canal OAI reservado para Codex — AgentPad13 Studio no lo abre ni lo controla.</p>
      </div>

      <pre className="diagnostic-report">{report}</pre>
    </section>
  );
}
