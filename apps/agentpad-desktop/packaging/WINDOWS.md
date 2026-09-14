# Windows: instalador y portable

Se preparan dos entregas x64 de la misma app, sin cambios en firmware:

- **Instalador NSIS (`*-setup.exe`)**: instalación convencional y datos por usuario.
  Si falta WebView2, el instalador lo obtiene de Microsoft; ese primer paso
  necesita Internet. No incluye el marcador portable ni usa su carpeta Data.
- **Portable (`*_windows_x64_portable.zip`)**: extraer entero en una carpeta local
  con escritura y abrir `Start-AgentPad13.cmd`. Incluye `AgentPad13.exe`, el motor
  WebView2 fijo, el marcador `agentpad13.portable` y una carpeta `Data`.
  No instala la app ni WebView2. El lanzador prepara únicamente los permisos de
  lectura/ejecución del motor incluido, requeridos en Windows 10; en Windows 11
  también se puede abrir directamente el EXE. No se desactiva el sandbox del motor.

## Datos y actualización

Los perfiles y ajustes del portable viven en el almacenamiento de su webview,
en `Data`, junto al EXE. Cierra la app antes de copiar **toda la carpeta** a otro
equipo. No la ejecutes desde dentro del ZIP, una ruta de red/UNC, Program Files
ni una carpeta sin escritura. Exporta además tus perfiles JSON como copia
portable independiente del almacenamiento interno de WebView2.

La versión instalada y el portable no comparten perfiles automáticamente:
exporta/importa JSON para migrarlos. No se sobrescribe el perfil instalado.
Para actualizar el portable, cierra la app, conserva Data y sustituye los demás
archivos con la nueva entrega. No borres el marcador ni la carpeta WebView2.
Si falta el motor, el portable falla en lugar de usar silenciosamente el del sistema.

El motor fijo no se actualiza automáticamente: cada entrega debe revisar y
actualizar `webview2-fixed.json` (versión, URL oficial y SHA-256). Se incluye el
paquete completo con sus avisos. Distribución y condiciones del motor:
[Microsoft WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution).

## Compilación en Windows x64

Desde `apps/agentpad-desktop`, con herramientas de compilación Tauri instaladas:

```powershell
$env:RUSTFLAGS = '-C target-feature=+crt-static'
pnpm install --frozen-lockfile
pnpm test --run
pnpm tauri build --bundles nsis
pwsh -File scripts/package-windows-portable.ps1
```

El ZIP se genera en `output/windows/`, junto a un SHA-256. El script verifica
el hash del CAB y la firma Microsoft de WebView2, y no sobrescribe un ZIP existente.
La CI adjunta instalador y ZIP como artefactos descargables; no publica una release.
Los paquetes todavía no están firmados por un certificado del proyecto: Windows
puede mostrar avisos de editor desconocido. Esto no justifica desactivar protección.

## Aceptación pendiente

Probar en Windows 10/11 x64: inicio sin WebView2 instalado (portable), instalador,
perfiles/ajustes tras cerrar y reabrir, traslado de toda la carpeta, separación
respecto a la instalación, carpeta sin permisos, y después las pruebas del teclado.
Las pruebas de rutas en Rust no sustituyen estas pruebas nativas. No se promete
que el sistema operativo no deje ningún rastro temporal de ejecución.
