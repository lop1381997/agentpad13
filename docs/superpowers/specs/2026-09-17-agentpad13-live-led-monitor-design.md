# AgentPad13 Phase 3 — monitor LED físico en Studio

## Estado

Diseño aprobado por el propietario el 2026-09-17. Esta especificación es la
base de una ampliación coordinada del firmware `loudest_micro:vial_oai` y de
AgentPad13 Studio. Requiere un firmware nuevo para la vista **En directo**.

## Objetivo

AgentPad13 Studio mostrará permanentemente un teclado virtual que replica el
estado final y real de los LEDs físicos del pad. Debe incluir las ocho capas,
con L0/Codex-OAI incluida, las transiciones de capa, el indicador de capa y el
bajo-teclado. La vista permite seleccionar un control para editarlo, pero nunca
ejecuta una pulsación ni una acción OAI.

La fidelidad importa: no basta inferir colores de los ajustes VialRGB. La vista
debe reflejar también los estados de agente que Codex envía a L0 y los efectos
que el firmware está entregando al hardware.

## Restricciones que no cambian

- Se mantienen exactamente VID:PID `303A:8360`, el teclado HID y las dos
  colecciones raw HID ya existentes.
- Studio abre exclusivamente Vial (`FF60:0061`, 32 bytes sin Report ID).
  Nunca abre, lee, escribe ni consume OAI (`FF00:0061`, Report ID 6, 64 bytes).
  Codex Desktop sigue siendo el dueño único de OAI.
- La extensión es de solo lectura; no desbloquea Vial, no cambia EEPROM, no
  crea otra interfaz USB y no cambia tramas OAI.
- Las ocho capas Vial persistentes, el retorno físico SW1+SW4 a L0, las macros,
  el encoder y los controles VialRGB existentes se conservan sin cambios de
  comportamiento.
- No se afirma validación física hasta que el propietario la realice. No se
  flashea un dispositivo sin autorización expresa posterior.

## Modelo visual definitivo

El componente `LivePad` reemplaza el mapa estático duplicado y vive de forma
permanente en la parte superior del área de trabajo de Studio, en las páginas
de mapa, OAI e iluminación.

Representa la geometría canónica de AgentPad13:

- los 15 controles que ya edita Studio (13 posiciones de switch, touch y
  pulsación del encoder);
- los 24 LEDs de la cadena física, incluidos los LEDs sin una tecla propia;
- el LED/indicador de capa y el bajo-teclado como elementos de luz alrededor
  del pad, no como botones inventados.

Cada control interactivo muestra etiqueta física, keycode/acción de la capa
seleccionada, color real y estados de selección/borrador. Un clic únicamente
selecciona ese control y enfoca el editor existente. Un tooltip accesible da
RGB, acción, nombre OAI cuando corresponde, y estado de sincronización.

La cabecera muestra `En directo` o `Vista previa`, capa física activa, tasa de
actualización (20 fps) y antigüedad de la última instantánea. La leyenda
distingue LED real, selección, borrador, datos sincronizándose y desconexión.

## Capas y L0

El selector ofrece L0–L7 siempre. L0 está completamente incluida:

- en L0, los LEDs OAI y sus estados de agente se muestran en directo, después
  de aplicar la distribución persistente tecla+LED;
- sus teclas abren la distribución OAI o el editor de keymap, según la página;
- no se habilita edición VialRGB en L0, porque Codex conserva la propiedad de
  esa iluminación;
- en L1–L7 se muestra el efecto VialRGB real y el indicador de capa que el
  firmware mantiene fuera del efecto.

El usuario puede elegir entre editar una capa concreta o seguir la capa física
activa. Cambios de capa desde una tecla, touch, Codex o Studio se reflejan de
inmediato. Durante la transición de un segundo, los 24 LEDs virtuales enseñan
el mismo destello de la capa de destino.

## Protocolo de telemetría Vial

### Transporte y versionado

Se define una familia privada de comandos de lectura `AgentPad Live Monitor`
en la colección Vial. Antes de asignar el byte final de comando, la
implementación comprobará el conjunto de comandos VIA/Vial del fork y
documentará el valor libre elegido; los IDs VialRGB existentes (`0x40`–`0x42`
como subcomandos de iluminación) permanecen intactos.

La primera operación es `GET_INFO`. Devuelve versión mayor/menor, capacidad de
instantánea, número de LEDs (24), LEDs por fragmento (8), número de fragmentos
(3), frecuencia máxima soportada (20 fps) y flags de capacidades. Studio exige
versión mayor 1 para activar `En directo`.

Un firmware anterior responde como comando no soportado. Eso no es un error de
conexión: Studio queda en `Vista previa`, conserva todas las herramientas de
edición y explica que se necesita el firmware de monitor para datos físicos.

### Instantánea coherente

`GET_FRAME(chunk)` usa siempre reportes Vial de 32 bytes. El fragmento 0 crea
una copia atómica de la salida RGB final y aumenta `frame_sequence`. Los tres
fragmentos devuelven ocho triples RGB, por tanto los 24 LEDs caben sin alterar
el tamaño de reporte:

| Byte | Contenido de la respuesta |
| --- | --- |
| 0–1 | familia y operación `GET_FRAME` |
| 2–3 | `frame_sequence` little-endian |
| 4 | capa física activa, 0–7 |
| 5 | flags de estado |
| 6 | índice de fragmento, 0–2 |
| 7 | reservado, cero en v1 |
| 8–31 | 8 LEDs RGB consecutivos (24 bytes) |

Los índices de LED siguen exactamente `CODEX_LED_COUNT` y la cadena física ya
usada por el renderer: `0..23`. Las flags v1 distinguen `LIVE`, transición de
capa, inicio/autodiagnóstico y RGB apagado. Cualquier flag desconocida se
ignora de forma compatible.

Studio solicita 0, 1 y 2 de forma serial. Si sus secuencias, capa o flags no
coinciden, descarta el conjunto y reintenta una sola vez; si vuelve a cambiar,
enseña `Sincronizando` y conserva la última instantánea completa. Nunca pinta
un teclado con fragmentos de dos fotogramas distintos.

La copia se toma después de calcular la salida que QMK va a entregar: límites
de brillo, transición, proyección OAI tecla+LED, estado OAI, VialRGB e
indicador de capa. La solución concreta debe respetar el orden real de hooks
de RGB Matrix y no duplicar la lógica de efectos en Studio.

### Frecuencia y concurrencia

Studio realiza como máximo un ciclo completo cada 50 ms (20 fps), solo cuando
el pad está conectado, la ventana está visible y `LivePad` está montado. Pausa
al minimizar, al ocultar la ventana, desconectar, desbloquear o guardar. Cada
ciclo usa la cola serial Vial existente: una operación de editor o desbloqueo
siempre tiene prioridad y el monitor salta fotogramas en vez de competir con
ella.

Los errores transitorios no desconectan la sesión al primer fallo. Se conserva
el último marco, se incrementa el indicador de antigüedad y se muestra un
estado recuperable. Una desconexión confirmada atenúa el mapa y detiene el
polling.

## Arquitectura de la app

~~~text
firmware: RGB Matrix final + snapshot v1
                  │ Vial HID (solo lectura)
Rust VialClient ──┤ GET_INFO / GET_FRAME(0..2)
                  │
Tauri command + polling coordinator
                  │
React LivePad + estado de frescura + editor existente
~~~

Se añaden tipos separados de la configuración VialRGB: `LiveMonitorInfo`,
`LiveLedFrame` y `LiveMonitorState`. Así no se confunde un ajuste persistente
con un valor físico de corta vida. El estado UI incorpora origen (`live`,
`preview`, `unsupported`, `disconnected`), tiempo de lectura, capa física y
fotograma. Las escrituras de keymap, encoder, macros o VialRGB no derivan ni
simulan colores; tras completarse solicitan una instantánea nueva.

La vista previa usa la geometría y el color de capa conocidos, más los ajustes
VialRGB que Studio haya leído. Se etiqueta inequívocamente como aproximación y
no pretende reproducir animaciones ni estados OAI.

## Cambios de firmware previstos

El target afectado es únicamente `loudest_micro:vial_oai` bajo
`CODEX_OAI_DYNAMIC_KEYMAP`. Añadirá el manejador en el pre-hook Vial
`via_command_kb`, ya respaldado por el fork para interceptar un comando privado
antes de que VIA lo procese. El hook sigue situado después de la compuerta de
desbloqueo Vial. Validará estrictamente longitud/fragmento y mantendrá una
copia de 24 LEDs para monitor. El target Direct OAI no incorpora esta
telemetría.

El capturador obtiene el color final dentro de la ruta del renderer, incluida
la prioridad existente de transición, OAI, proyección dinámica e indicador de
capa. Para los LEDs cedidos a VialRGB se leerá el framebuffer final del motor
RGB Matrix en el punto que el fork garantice como posterior al efecto; no se
reimplementará VialRGB en firmware ni en la app. Si el fork no ofrece una
lectura final segura, se añadirá un hook local mínimo y probado que la exponga
sin cambiar los valores enviados a los LEDs.

## Pruebas y criterios de aceptación

### Firmware

- `GET_INFO` anuncia v1, 24 LEDs, tres fragmentos de ocho y máximo 20 fps.
- Peticiones malformadas, fragmentos fuera de rango y comandos ajenos se
  rechazan sin mutar estado ni interferir con VIA/Vial/OAI.
- Los tres fragmentos de una secuencia forman una copia coherente de 24 RGB.
- L0 devuelve colores OAI posteriores a la redistribución tecla+LED.
- L1–L7 devuelven VialRGB final más el indicador de capa fijo.
- Una transición de capa aparece en los 24 LEDs durante el segundo completo.
- Se conservan byte a byte OAI, descriptores, VID/PID, tres colecciones HID,
  ocho capas, retorno SW1+SW4 y persistencia Vial.

### Rust/Tauri

- Decodifica información y fragmentos; rechaza longitudes, versión mayor,
  capa, fragmento y secuencia inválidos.
- Ensambla solo marcos homogéneos; reintenta una vez y comunica sincronización
  en lugar de entregar colores mezclados.
- El programador no supera 20 fps, pausa en invisibilidad/operación exclusiva
  y se recupera de fallos sin bloquear la cola Vial.
- La selección HID sigue rechazando OAI aunque tenga el mismo VID/PID.

### React

- `LivePad` contiene L0–L7, los 15 controles y todos los LEDs periféricos.
- L0 renderiza estados OAI de solo lectura; L1–L7 muestran VialRGB e
  indicador de capa.
- Un clic selecciona el editor correcto sin llamar a una acción de teclado.
- La UI diferencia en directo, preview, firmware no compatible,
  sincronizando y desconectado; es navegable con teclado y lector de pantalla.
- La prueba de frontend usa tiempo simulado para verificar 20 fps, pausa y
  recuperación sin hardware.

### Entrega

La entrega incluye UF2 nuevo, `.vial` si cambia la definición, manifiesto con
hash, runbook físico actualizado, documentación de compatibilidad y pruebas
automatizadas verdes. La instalación del UF2 y la comprobación sobre el pad
real siguen siendo pasos manuales bajo autorización del propietario.

## No objetivos

- No ejecutar acciones OAI ni teclas desde el teclado virtual.
- No añadir una app web, servicio remoto, telemetría externa o cuenta.
- No convertir Studio en cliente OAI ni exponer información OAI fuera de la
vista visual local.
- No añadir perfiles VialRGB por capa ni un editor de animaciones VialRGB.
