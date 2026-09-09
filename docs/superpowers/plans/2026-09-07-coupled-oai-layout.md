# Distribución conjunta OAI de teclas y LEDs

La UI configura el mapa Vial persistente de L0. El firmware proyecta el frame
lógico OAI sobre SW1–SW13 leyendo ese mismo mapa: no hay una segunda tabla que
pueda desincronizarse de la acción. Se mantienen VID/PID, report IDs y tramas.

1. Añadir proyección de colores desde una copia inmutable del frame, solo en
   L0 y fuera del inicio/transición. Mantener TP5 e iluminación inferior físicos.
2. Añadir UI horizontal, vertical e intercambio de dos posiciones; integrar
   borradores, guardar, deshacer/rehacer y perfiles ya existentes.
3. Verificar todos los intercambios con un harness C y las distribuciones con
   Vitest; compilar firmware y app; comprobar el flujo en WebKit.
4. Entregar nuevo firmware sin flashear ni publicar. La aceptación física debe
   comprobar SW1 ↔ SW7 y disposición vertical con agentes reales.

Horizontal/vertical restauran las 13 acciones canónicas (se explica en la UI).
Intercambiar conserva las asignaciones desplazadas. Una tecla sin acción OAI
no muestra un agente ajeno; acciones OAI duplicadas muestran el mismo color.
Encoder y TP5 quedan fuera porque no disponen de un LED de tecla equivalente.
