param(
    [string]$Executable = "src-tauri/target/release/agentpad-desktop.exe",
    [string]$OutputDirectory = "output/windows"
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw "Build this archive on Windows x64." }
$appRoot = Split-Path $PSScriptRoot -Parent
Set-Location $appRoot
$runtime = Get-Content packaging/webview2-fixed.json -Raw | ConvertFrom-Json
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$binary = Get-Item $Executable
$output = [System.IO.Path]::GetFullPath($OutputDirectory)
$archive = Join-Path $output "AgentPad13_${version}_windows_x64_portable.zip"
if (Test-Path $archive) { throw "Refusing to overwrite $archive" }
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("agentpad13-portable-" + [guid]::NewGuid())
$package = Join-Path $stage "AgentPad13"
$expanded = Join-Path $stage "expanded"
New-Item -ItemType Directory -Path $package, $expanded, $output -Force | Out-Null
$cab = Join-Path $stage "webview2.cab"
Invoke-WebRequest -Uri $runtime.url -OutFile $cab
if ((Get-FileHash $cab -Algorithm SHA256).Hash -ne $runtime.sha256) {
    throw "WebView2 SHA-256 mismatch. No portable archive was created."
}
& expand.exe $cab '-F:*' $expanded | Out-Null
if ($LASTEXITCODE -ne 0) { throw "WebView2 CAB extraction failed" }
$engines = @(Get-ChildItem $expanded -Recurse -Filter msedgewebview2.exe)
if ($engines.Count -ne 1) { throw "Expected exactly one fixed WebView2 runtime" }
$signature = Get-AuthenticodeSignature $engines[0].FullName
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
    throw "WebView2 Microsoft signature validation failed"
}
Copy-Item $engines[0].Directory.FullName (Join-Path $package 'WebView2') -Recurse
Copy-Item $binary.FullName (Join-Path $package 'AgentPad13.exe')
Copy-Item packaging/Start-AgentPad13.cmd $package
Copy-Item packaging/WINDOWS.md (Join-Path $package 'README.md')
Copy-Item COPYING $package
Copy-Item packaging/webview2-fixed.json $package
New-Item -ItemType File -Path (Join-Path $package 'agentpad13.portable') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $package 'Data') | Out-Null
# Include any app-local DLL dependencies emitted alongside the application.
Get-ChildItem $binary.Directory.FullName -Filter '*.dll' | ForEach-Object {
    Copy-Item $_.FullName $package
}
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $package, $archive, [System.IO.Compression.CompressionLevel]::Optimal, $true
)
$digest = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
"$digest  $([System.IO.Path]::GetFileName($archive))" | Set-Content "$archive.sha256" -Encoding utf8
Write-Output "Portable: $archive"
Write-Output "Staging retained for inspection: $stage"
