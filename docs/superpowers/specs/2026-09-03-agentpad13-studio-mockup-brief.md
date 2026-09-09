# AgentPad13 Studio — brief visual para mockup

**Estado:** dirección visual aprobada el 2026-09-03. Autoriza la implementación de la aplicación; no autoriza cambios de firmware, flasheo ni acceso al canal OAI.

**Fuente visual aprobada:** exportación HTML de Stitch entregada por la persona propietaria el 2026-09-03. Su sistema visual de estudio oscuro, barra lateral, cabecera densa, panel físico central e inspector se reutiliza como referencia. Los elementos que contradicen el hardware real se reconcilian con este documento: no hay tira táctil de 100 mm, encoder óptico, OLED, telemetría inventada, hooks directos de Codex ni controles físicos del chasis.

## 1. La idea en una frase

**AgentPad13 Studio** es la aplicación nativa de escritorio para configurar un AgentPad13: ocho capas persistentes, las teclas físicas, el encoder, el touch, acciones Codex/OAI, VialRGB, macros, perfiles locales y diagnóstico, sin interferir con Codex Desktop ni con el canal OAI.

No es un clon de Vial y tampoco es un cliente de Codex. Es un editor de hardware profesional, hecho específicamente para este macropad.

## 2. Dirección creativa recomendada

La referencia es un **panel de control de estudio / herramienta de hardware premium**, no una aplicación gamer con RGB decorativo ni un dashboard de IA. Debe transmitir precisión, calma, control y confianza.

La dirección recomendada combina:

- el rigor y densidad útil de una utilidad profesional;
- el tacto de una superficie de control física;
- un acento sutil de Codex mediante cian y violeta;
- LEDs y colores de capa tratados como información funcional, no como ruido visual.

Evitar gradientes llamativos, neón excesivo, fondos animados, una interfaz blanca, una ilustración de teclado genérico y un chat de IA.

| Dirección | Ventaja | Inconveniente | Decisión |
| --- | --- | --- | --- |
| **Instrumento profesional oscuro** | Clara, duradera, propia del hardware | Requiere cuidar la jerarquía para no resultar fría | **Recomendada** |
| Vial clásico y denso | Familiar para usuarios avanzados | Poco distintiva y demasiado técnica | No usar como base |
| Futurista / neón / cyber | Llama la atención en capturas | Compite con los estados importantes | No usar como base |

## 3. Formato de ventana y arquitectura visual

Diseñar el mockup principal para una ventana de escritorio de **1440 × 960 px**. El mínimo funcional sería 1120 × 780 px. La aplicación es nativa para macOS, Windows y Linux; debe usar la barra de título del sistema, no dibujar una barra de navegador falsa.

La composición es estable:

1. **Barra superior**: identidad, conexión, estado y guardado.
2. **Barra lateral izquierda**: navegación global y estado resumido.
3. **Área principal**: la pantalla activa.
4. **Inspector derecho**: aparece en la edición del mapa de teclas.

La pantalla más importante es **Mapa de teclas**; debe ocupar el mayor espacio y centrar el macropad físico.

## 4. Sistema visual

### Paleta base

| Uso | Color |
| --- | --- |
| Fondo de aplicación | #0D1117 |
| Panel | #151B23 |
| Panel elevado | #1C2430 |
| Borde | #2B3644 |
| Texto principal | #F2F7FA |
| Texto secundario | #9AA8B8 |
| Acción principal | #45D6C1 |
| Foco / selección | #61B8FF |
| Borrador pendiente | #F4B860 |
| Éxito | #69DB9B |
| Error | #FF6B7A |
| Acciones OAI | #A78BFA |

Los paneles tienen fondo sólido o un gradiente imperceptible. No usar un fondo RGB multicolor. Los colores vivos pertenecen a la representación del teclado, a las capas y a los estados.

### Tipografía y componentes

- Sans principal: Inter, SF Pro, Segoe UI o equivalente del sistema.
- Monoespaciada: JetBrains Mono, SF Mono o equivalente, sólo para keycodes, números de capa y diagnósticos.
- Radio de panel: 16 px.
- Radio de botón: 10 px.
- Radio de tecla virtual: 12 px.
- Chips y píldoras de estado: radio completo.
- Espaciado basado en múltiplos de 4 y 8 px.
- Iconos lineales, de 18–20 px, estilo Lucide o Phosphor.

Todos los estados deben tener texto e icono además de color. El foco de teclado debe ser siempre visible.

## 5. Barra superior

Altura: 56–64 px.

### Izquierda

- Icono minimalista inspirado en la forma 4×3 del AgentPad.
- Nombre: **AgentPad13 Studio**.
- Perfil local activo: **Perfil: Codex Principal**.

### Centro

Si hay dispositivo conectado:

- punto verde;
- **AgentPad13 conectado**;
- selector de dispositivo cuando haya más de uno;
- chip discreto **Vial listo**.

Si no hay dispositivo, mostrar **Sin AgentPad13 conectado** en gris, sin alarmar.

### Derecha

- estado de edición: **Bloqueado** en ámbar o **Edición desbloqueada** en verde;
- deshacer y rehacer;
- contador: **3 cambios sin guardar**;
- CTA principal: **Guardar en AgentPad**.

El botón principal es turquesa y sólo se habilita con cambios pendientes y la edición desbloqueada.

No debe existir un único botón llamado **Lock & disconnect**. La aplicación debe separar de forma segura:

- **Desconectar**: cierra la sesión de la aplicación sin enviar una orden de bloqueo arriesgada.
- **Bloquear edición**: acción secundaria, disponible sólo cuando no existe un desbloqueo físico en progreso.

## 6. Navegación lateral

Ancho aproximado: 232 px.

Entradas principales:

1. Inicio
2. Mapa de teclas
3. Iluminación
4. Macros y acciones
5. Perfiles
6. Diagnóstico
7. Ajustes

En la parte inferior:

- nombre del dispositivo;
- versión de firmware;
- estado **OAI + Vial compatible**;
- enlace **Ver detalles técnicos**.

Usar icono, etiqueta y un indicador pequeño sólo si aporta información: conectado, cambios pendientes o error.

## 7. Pantalla de inicio

### Sin dispositivo

La vista muestra una ilustración sobria del AgentPad13, nunca un teclado genérico.

- Título: **Conecta tu AgentPad13**.
- Texto: **Busca un AgentPad13 compatible para editar sus capas, encoder y acciones OAI.**
- CTA: **Buscar AgentPad13**.
- Nota breve: **La aplicación no flashea firmware ni controla Codex.**

### Con dispositivo

Mostrar una tarjeta de estado clara:

- **AgentPad13**.
- **Conectado**.
- **Firmware OAI + Vial Dual**.
- **8 capas disponibles**.
- **Edición bloqueada** o **Edición desbloqueada**.
- Último perfil aplicado.

Acciones rápidas:

- Editar mapa de teclas.
- Desbloquear edición.
- Crear copia de seguridad.
- Ver diagnóstico.

Abajo, una actividad reciente y discreta:

- Hace 2 min · Capa 3 actualizada.
- Ayer · Perfil “Codex Principal” exportado.

## 8. Pantalla principal: Mapa de teclas

Esta es la pantalla que debe hacerse primero en el mockup.

La distribución tiene tres columnas:

| Zona | Función |
| --- | --- |
| Izquierda | Capas, perfil y estado de edición |
| Centro | Representación física del AgentPad13 |
| Derecha | Inspector de selección y catálogo de acciones |

### Selector de capas

Ocho pestañas compactas en la parte superior del área central:

- 0 · Codex / OAI
- 1 · Trabajo
- 2 · Navegación
- 3 · Iluminación
- 4 · Personal
- 5 · Personal
- 6 · Personal
- 7 · Personal

Los nombres son aliases locales del perfil; el firmware conserva el número de capa. Cada pestaña tiene una franja de color. La capa activa usa borde cian, fondo elevado y texto claro. La capa 0 lleva una insignia **Codex / OAI**.

### Representación física exacta

El centro muestra una carcasa vertical y oscura, como una pieza de hardware anodizado. Debe tener sombras suaves, LEDs insinuados y proporciones reales.

Distribución:

- tres filas superiores de cuatro teclas: SW1 a SW12;
- fila inferior con TP5 táctil a la izquierda;
- tecla SW13 de ancho 2U en el centro;
- encoder circular y pulsable a la derecha.

Cada control muestra:

- etiqueta física pequeña: SW1, TP5 o Encoder;
- acción asignada en grande;
- keycode o tipo abajo en monoespaciado;
- una franja pequeña de categoría.

Estados visuales:

- seleccionado: borde cian intenso;
- cambio sin guardar: borde ámbar y punto ámbar;
- acción OAI: detalle violeta/cian;
- acción RGB: detalle magenta;
- acción multimedia: detalle azul;
- touch TP5: superficie satinada o borde discontinuo, nunca una tecla normal;
- encoder: círculo con marcas de giro, anillo interior y estado de pulsación.

### Contenido de ejemplo para la capa 0

| Control | Acción mostrada |
| --- | --- |
| SW1 | Agente anterior |
| SW2 | Agente siguiente |
| SW3 | Nuevo |
| SW4 | Review |
| SW5 | Plan |
| SW6 | Implementar |
| SW7 | Refactor |
| SW8 | Test |
| SW9 | Abortar |
| SW10 | Safe |
| SW11 | Aceptar |
| SW12 | Micrófono |
| SW13 · 2U | Enviar |
| Encoder press | OAI ENC |
| TP5 | Cambiar capa |
| Encoder CCW | ENC CCW |
| Encoder CW | ENC CW |

### Inspector derecho

Al seleccionar una tecla, TP5 o dirección del encoder, el inspector muestra:

- SW7;
- Capa 0 · Codex / OAI;
- acción actual: Refactor;
- código: 0x7E08.

Tiene tres pestañas:

1. **Acciones**: buscador y catálogo.
2. **Detalles**: descripción, keycode, notas y advertencias.
3. **Comportamiento**: capa, transparencia, pulsación, macro o relación con una acción OAI.

Categorías del catálogo:

- Básicas
- Modificadores
- Navegación
- Ratón y scroll
- Multimedia
- Capas
- VialRGB
- Macros
- AgentPad / OAI
- Avanzado

La categoría **AgentPad / OAI** debe ser especialmente clara: cada tarjeta tiene nombre, descripción corta y chip violeta. Ejemplos: Plan, Implementar, Test, Abortar, Safe, Aceptar, Micrófono, Enviar, OAI ENC, ENC CW, ENC CCW, Cambiar capa, Modo joystick y Activar/desactivar touch.

Al elegir una acción, el pad se actualiza visualmente, pero **no** se escribe nada al teclado hasta Guardar.

### Pie de cambios

Cuando haya borradores, aparece una barra fija inferior:

- **3 cambios pendientes**;
- **Ver cambios**;
- **Deshacer todos**;
- **Guardar en AgentPad**.

**Ver cambios** abre una comparación legible, por ejemplo:

- Capa 0 · SW7: Refactor → Test.
- Capa 3 · SW4: Hue+ → Brillo+.
- Capa 2 · Encoder CW: Page Down → Volume Up.

## 9. Desbloqueo físico seguro

El desbloqueo merece una experiencia dedicada porque es una medida de seguridad del firmware y porque no puede cancelarse de forma arbitraria una vez iniciado.

Al intentar guardar en estado bloqueado, mostrar tarjeta o modal lateral:

- Título: **Desbloquear edición**.
- Estado: **El teclado está protegido.**
- Instrucción grande: **Mantén SW1 + SW13 pulsadas.**
- Dibujo del pad iluminando exactamente ambas posiciones.
- Botón: **Iniciar comprobación física**.
- Progreso: **18 comprobaciones restantes**.

Durante el proceso:

- desactivar Guardar, Desconectar y Bloquear edición;
- explicar: **No desconectes ni bloquees mientras la comprobación está en curso.**
- no mostrar un botón Cancelar si el firmware no lo soporta de forma segura.

Al completar:

- chip verde: **Edición desbloqueada**;
- CTA: **Guardar cambios**;
- acción secundaria: **Desconectar**.

Al expirar:

- estado ámbar;
- texto: **No se detectó la combinación completa. Inténtalo de nuevo.**
- la interfaz no debe dejar el teclado en un estado ambiguo.

## 10. Pantalla de iluminación

La pantalla debe diferenciar claramente dos mundos.

### Capa 0: Codex / OAI

Tarjeta protegida y de sólo lectura:

- título: **Iluminación de Codex**;
- texto: **En la capa 0, Codex y el firmware gestionan el estado visual del pad.**
- vista previa de LEDs de estado.

No mostrar controles que sugieran que la app puede cambiar directamente el comportamiento OAI.

### Capas 1–7: VialRGB

Mostrar:

- vista previa del pad;
- encendido / apagado;
- selector de efecto;
- tono;
- saturación;
- brillo;
- velocidad;
- efecto anterior / siguiente;
- color de capa.

Dos tarjetas informativas fijas:

> Al cambiar de capa, todos los LEDs muestran el color de esa capa durante 1 segundo. Después vuelve el efecto VialRGB.

> El LED indicador de capa siempre permanece sólido y no queda afectado por el efecto RGB.

La capa 3 lleva el chip **Controles RGB por defecto** y muestra el mapa inicial:

| Control | Acción |
| --- | --- |
| SW1 | RGB Toggle |
| SW2 | Efecto anterior |
| SW3 | Efecto siguiente |
| SW4 | Hue+ |
| SW5 | Hue− |
| SW6 | Saturation+ |
| SW7 | Saturation− |
| SW8 | Brightness+ |
| SW9 | Brightness− |
| SW10 | Speed+ |
| SW11 | Speed− |
| SW12 | Mute |
| Encoder | Efecto anterior / siguiente |

## 11. Macros y acciones

La pantalla tiene dos bloques.

### Biblioteca AgentPad / OAI

Una cuadrícula o lista de las veinte acciones personalizadas, con icono, nombre, descripción y tipo. No debe parecer un chat ni un panel de tareas de Codex.

Ejemplos de copy:

- **Plan**: guarda una acción que el firmware enviará a Codex al pulsar la tecla.
- **Cambiar capa**: cicla las ocho capas del AgentPad.
- **OAI ENC CW**: acción específica del giro horario del encoder.
- **Modo joystick**: cambia el comportamiento del joystick del pad.

### Macros

- lista de macros;
- nombre;
- botón Grabar;
- secuencia temporal de pulsaciones;
- retardos editables;
- botón Asignar a tecla;
- vista previa del keycode de asignación.

Funciones de Vial que el firmware no anuncie como compatibles deben aparecer como no disponibles, nunca como controles falsos.

## 12. Perfiles

Los perfiles se guardan localmente en el ordenador; el teclado conserva su mapa Vial persistente.

Mostrar:

- Configuración actual del teclado.
- Perfiles locales: Codex Principal, Edición de vídeo, Navegación y RGB Demo.
- Fecha de modificación.
- Número de diferencias respecto al teclado conectado.

Acciones:

- Guardar como perfil
- Duplicar
- Comparar
- Aplicar al teclado
- Exportar
- Importar
- Crear copia de seguridad

Aplicar un perfil siempre muestra un diff antes de escribir en el teclado y requiere el desbloqueo físico.

## 13. Diagnóstico y ajustes

Diagnóstico debe ser técnico pero sereno:

- dispositivo conectado;
- compatibilidad de firmware;
- ocho capas detectadas;
- estado de Vial;
- última lectura correcta;
- último guardado;
- estado de conexión de la aplicación.

El canal OAI aparece siempre de este modo:

> **Canal OAI reservado para Codex**\
> AgentPad13 Studio no lo abre ni lo controla.

No mostrar un falso “OAI conectado” si la aplicación no lo ha comprobado.

Acciones:

- Copiar diagnóstico
- Exportar informe
- Abrir guía de recuperación

En Ajustes:

- idioma;
- tema oscuro / alto contraste;
- ubicación de copias de seguridad;
- preferencias de conexión;
- telemetría explícitamente desactivada.

No incluir un flasheador de firmware como CTA principal. Una futura actualización de firmware, si se diseña, debe ser un flujo separado y con copia de seguridad, verificación de artefacto y confirmaciones explícitas.

## 14. Estados que el mockup debe cubrir

Además de la pantalla principal, diseñar estos estados:

1. Sin dispositivo conectado.
2. Firmware no compatible.
3. Teclado conectado con edición bloqueada.
4. Desbloqueo físico en curso.
5. Edición desbloqueada con tres cambios pendientes.
6. Guardado correcto.
7. Error de lectura tras guardar.
8. Desconexión con cambios no guardados.
9. Perfil importado que requiere revisión.
10. Capa 0 OAI y capa 3 RGB.

## 15. Reglas de experiencia no negociables

- Nada se escribe en el teclado automáticamente.
- Todos los cambios son borradores hasta pulsar Guardar.
- Cada guardado reporta éxito o error concreto.
- No hay controles destructivos escondidos.
- No hay login, nube ni telemetría.
- El flujo habitual evita referencias a VID, PID, HID o report IDs; esos datos viven en Diagnóstico.
- La aplicación nunca muestra una función que el firmware no puede ejecutar.
- La accesibilidad no depende sólo de color.
- AgentPad13 Studio edita Vial; Codex mantiene el control del canal OAI.

## 16. Prompt compacto para generar el mockup

> Diseña una aplicación nativa de escritorio llamada “AgentPad13 Studio”, una herramienta premium para configurar un macropad físico de 13 teclas, touch pad y encoder. Estilo oscuro profesional, entre panel de control de estudio y editor de hardware, no gamer. Ventana 1440x960, barra lateral izquierda con Inicio, Mapa de teclas, Iluminación, Macros y acciones, Perfiles, Diagnóstico y Ajustes. Barra superior con estado de dispositivo conectado, edición desbloqueada, undo/redo y botón turquesa “Guardar en AgentPad”. Pantalla principal de mapa de teclas con ocho pestañas de capa; capa 0 “Codex / OAI” activa. En el centro, representación física vertical del pad: 12 teclas en cuadrícula 4x3, touch TP5 abajo a la izquierda, tecla 2U “Enviar” en el centro, encoder circular pulsable a la derecha. Cada tecla muestra etiqueta física y acción OAI: Agente anterior, Agente siguiente, Nuevo, Review, Plan, Implementar, Refactor, Test, Abortar, Safe, Aceptar, Micrófono. Inspector derecho con buscador de acciones, categorías y acción seleccionada “Plan”. Color grafito, paneles sólidos, cian como acento, violeta para acciones OAI, ámbar para cambios sin guardar, tipografía Inter y monoespaciada para códigos.
