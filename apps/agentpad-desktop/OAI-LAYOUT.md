# Mover agentes y sus LEDs

En **Mapa de teclas → L0**, el panel **Distribución OAI** permite:

- **Orden horizontal**: agentes 1–6 en SW1, SW2, SW3, SW4, SW5, SW6.
- **Orden vertical**: agentes 1–6 en SW1, SW5, SW9, SW2, SW6, SW10.
- **Intercambiar tecla y LED**: por ejemplo, origen SW1 y destino SW7.
  Se intercambian ambas asignaciones, por lo que la acción desplazada no se pierde.

Horizontal y vertical restauran las 13 acciones OAI canónicas. El resto de
capas, el encoder y TP5 no cambian. Los cambios se preparan localmente:
**Deshacer/Rehacer** funciona para cada operación completa y **Guardar en
AgentPad** los escribe en Vial. Los perfiles incluyen la distribución
porque se almacena en el propio mapa de teclas.

## Firmware necesario

La app puede cambiar asignaciones en el firmware anterior, pero para que el LED
siga la acción se necesita el nuevo UF2:

`output/firmware/agentpad13_oai_vial_layout_20260907.uf2`

SHA-256:
`8f4e0c1d245b79aded7f65fe4b5c5009c171db4e5b8eb32bfdc2f2516f4e4bda`

Compilado con el QMK fijado por el proyecto y Arm GNU 15.2.Rel1, sin flashear.
VID/PID y los protocolos OAI/Vial no cambian. Los LEDs de TP5 e iluminación
inferior mantienen su posición física; el efecto VialRGB de L1–L7 tampoco cambia.

## Comprobaciones

- Test C: 169 intercambios posibles, colores RGB y LEDs reservados.
- Vitest: horizontal/vertical, intercambio reversible SW1–SW7 y destinos inválidos.
- WebKit: orden vertical (AG01 en SW5), intercambio (AG00 en SW7), borradores,
  guardar, perfiles, RGB, macros, ajustes y ventana mínima.
- La prueba física aún debe comprobar estados de agentes reales y persistencia
  tras desconectar/reconectar. El test de navegador simula la interfaz Vial.
- Emulador del UF2: comunicación Vial y OAI, canales separados, teclado y
  encoder pasan. La distribución de colores se verifica en el harness C;
  el emulador solo confirma actividad WS2812, no colores físicos por tecla.
- Verificador ELF/UF2: equivalencia binaria, VID/PID y descriptores USB pasan.
  Evidencia: firmware/evidence/oai-layout-20260907-manifest.json.

Antes de instalar, exporta un perfil de tu teclado. Después de actualizar,
prueba primero SW1 ↔ SW7 con dos agentes visibles y confirma que cada tecla
abre el agente cuyo estado muestra su LED.
