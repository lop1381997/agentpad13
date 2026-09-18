# Fase 3 — estado y guía de navegación

Actualizado el 2026-09-18. Este documento reúne el estado vigente; los planes,
auditorías y registros fechados conservan las decisiones y pruebas de su momento.
No se deben interpretar sus candidatos antiguos como el firmware recomendado
para probar las nuevas funciones de Studio.

## Repositorio y entrega

- Repositorio de trabajo: [lop1381997/agentpad13](https://github.com/lop1381997/agentpad13).
- Rama de desarrollo publicada: [codex/oai-vial-eight-layers](https://github.com/lop1381997/agentpad13/tree/codex/oai-vial-eight-layers).
- La integración está publicada en `codex/phase-3` mediante avance rápido.
- No se ha hecho merge en `main`. Esta revisión documental es posterior a esa entrega.
- No se ha flasheado el teclado durante la preparación de esta entrega.

## Qué está implementado

Studio usa Tauri 2, Rust/HIDAPI y React/TypeScript. Es una aplicación de escritorio
con webview del sistema; no una interfaz SwiftUI ni un editor web con WebHID.
macOS tiene paquete de depuración compilado y comprobación de exportación nativa.
Windows y Linux son objetivos del proyecto, con CI configurada, pero su resultado
de ejecución no se ha comprobado en esta tarea.

- Ocho capas Vial persistentes, mapa de teclas y ambos sentidos del encoder.
- Borradores, deshacer/rehacer y guardado explícito con lectura de comprobación.
- VialRGB global compartido por L1–L7: efecto, velocidad, tono, saturación y brillo.
- Dieciséis macros Vial: edición de texto ASCII imprimible; se conservan las
  secuencias avanzadas, pero su autoría visual no está implementada.
- Perfiles locales, duplicación, comparación e importación/exportación JSON.
- Diagnóstico, exportación nativa y ajuste local de alto contraste.
- En L0, distribución horizontal/vertical de las 13 acciones OAI y permuta
  de dos posiciones, manteniendo unidos la acción y su LED.
- Teclado virtual permanente en Studio: reproduce los 24 LEDs físicos, incluidos
  L0/OAI, el anillo periférico y el indicador fijo de capa. Una pulsación en la
  vista virtual solo abre la edición del control; nunca ejecuta una acción.
- Monitor Vial de LEDs en tiempo real: negocia una vez la extensión `0x7D` y
  recibe tres bloques RGB atómicos por frame, con un límite de 20 FPS. Se pausa
  al guardar, desbloquear, ocultar la ventana o tener otra lectura en curso.
  Se puede seguir la capa física o fijar una capa distinta para editar.

## Contrato que no cambia

| Canal | Identidad | Informes | Propietario |
|---|---|---|---|
| Vial | VID:PID `303A:8360`, usage `FF60:0061` | 32 bytes, sin report ID | Studio o Vial |
| OAI | Mismo VID:PID, usage `FF00:0061` | 64 bytes, report ID `6` | Codex |

Studio no abre el canal OAI. La distribución se guarda en el mapa Vial de L0;
el firmware consulta ese mismo mapa para colocar los colores. No hay una segunda
tabla independiente de LEDs ni cambios en las tramas de Codex.

La extensión de monitor también viaja exclusivamente por Vial (`0x7D`, informe
sin ID de 32 bytes). Un frame sólo se muestra si los tres fragmentos coinciden
en secuencia, capa y flags; ante un error se mantiene el último estado atenuado.
Un firmware anterior queda en vista previa segura y Studio conserva toda su
capacidad de edición.

`SW1 + SW4` vuelve a L0 desde cualquier capa (ventana física de 80 ms).
`SW1 + SW13` es el desbloqueo de Vial, solo durante su procedimiento específico.
No se deben confundir ambas combinaciones. Los remapeos no cambian el acorde
físico de retorno.

Al cambiar de capa se aplica una transición de **1 segundo** a toda la cadena:
250 ms de entrada, 500 ms de mantenimiento y 250 ms de salida. Después, L0
muestra OAI y L1–L7 recuperan VialRGB. El LED físico de índice 13, junto a TP5,
queda fijo con el color de capa en L1–L7, fuera del efecto VialRGB; sí participa
en la transición. L3 incluye controles RGB por defecto en un mapa nuevo/reset;
una EEPROM existente no se sobrescribe para introducirlos.

## Firmware para probar tecla + luz y el monitor LED

Usar [agentpad13_oai_vial_dual.uf2](../release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2):

- Tamaño: **126976 bytes**.
- SHA-256: `66dd5e2e630577ef0c14282fc6bc0aed0f04fe7bf5c1b716ea6feda7d7252149`.
- Compilado contra QMK fijado en `00fc4627cd038ac9b7e9b8bf2b40b50e9e88aecb`,
  con Arm GNU 15.2.Rel1 y los parches del proyecto.
- Incluye el observador RGB y la extensión Vial `0x7D` que necesita el teclado
  virtual en tiempo real. La prueba dual verifica explícitamente su respuesta
  `v1`, los 24 LEDs, tres bloques de ocho y el límite de 20 FPS.
- Evidencia: [manifiesto ELF/UF2](../firmware/evidence/dual-oai-vial-current-manifest.json)
  y [emulador dual](../firmware/evidence/dual-oai-vial-emulator.json).

El UF2 de esta sección fue reconstruido desde el QMK fijado y no se ha flasheado
durante esta tarea: todavía requiere la prueba física autorizada. El más antiguo
`agentpad13_vial_oai.uf2` usa el transporte `0xA6` obsoleto y no es compatible
con el contrato dual actual. `agentpad13_codex_oai.uf2` es la alternativa Direct
OAI sin Vial ni monitor. El firmware base `agentpad13.uf2` y los archivos de
fabricación siguen documentados por separado; no han sido sustituidos por este
candidato.

## Evidencia y pendientes

Resultados del 2026-09-18: **42 tests frontend y 46 Rust** correctos, además de
TypeScript/Vite y la compilación del binario nativo macOS. Pasaron las 32 pruebas
de firmware directamente implicadas (monitor, contrato Phase 3, Vial OAI,
retorno a OAI y límite RGB). La batería completa se inició pero se detuvo porque
dos ejecuciones concurrentes de emulador quedaron esperando; no se cuenta como
resultado completo. El empaquetado DMG alcanzó el binario y se detuvo en el paso
gráfico `osascript`, que requiere una sesión de Finder interactiva.

El builder se corrigió para aceptar el QMK limpio fijado, aplicar los cinco
parches del repositorio en orden y publicar los dos UF2. Los perfiles Dual y
Direct han pasado el smoke de rp2040js y el verificador estático ELF/UF2. No
existe aún aceptación física de LEDs o teclado.

El harness C comprueba 169 permutas de teclas y los LEDs reservados. El emulador
comprueba comunicaciones y actividad WS2812, no colores físicos. Su recuperación
sintética de descriptor no constituye prueba de descriptor de configuración:
esa prueba corresponde al verificador estático del ELF.

Pendientes antes de cerrar fase 3:

1. Exportar perfil y probar el nuevo firmware en el teclado real, con autorización.
2. Probar SW1 ↔ SW7 y vertical con agentes reales: estado LED y acción coincidentes.
3. Guardar, bloquear, desconectar y reconectar: teclado operativo y mapa persistente.
4. Confirmar que el teclado virtual sigue los colores físicos de L0–L7 y que
   no lee durante guardado, desbloqueo o pestaña oculta.
5. Encoder, macros, RGB, indicador, retorno a OAI y convivencia con Codex.
6. Comprobar resultados de CI y funcionamiento nativo en Windows/Linux.
7. Terminar comparación visual con el HTML de Stitch y decidir el merge después.

## Dónde está cada tema

- [Uso y compilación de Studio](../apps/agentpad-desktop/README.md).
- [Distribución de teclas y luces](../apps/agentpad-desktop/OAI-LAYOUT.md).
- [Pruebas y límites de aceptación](../apps/agentpad-desktop/VERIFICATION.md).
- [Prueba física dual](dual-oai-vial-physical-runbook.md).
- [Compilación del firmware](../firmware/BUILD.md) y [evidencias](../firmware/evidence/README.md).
- [Inventario de documentos](DOCUMENTATION-INDEX.md): alcance, historia y dependencias.

Los hashes de `release/MANIFEST.md` cubren `release/`, no todo el repositorio.
El UF2 nuevo está en `apps/agentpad-desktop/output/firmware/` y se verifica por
el manifiesto específico enlazado arriba. Una prueba automática no autoriza
por sí sola ni un flash ni un merge.
