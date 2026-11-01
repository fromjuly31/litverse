$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseRoot = Join-Path $projectRoot 'release'
$pagesRoot = Join-Path $projectRoot 'github-pages'
if (!(Test-Path -LiteralPath (Join-Path $releaseRoot 'index.html'))) { throw 'Run npm run build:pages first.' }

function New-ReleaseArchive($ArchiveName, $BasePath, $Files) {
  $destination = [System.IO.Path]::GetFullPath((Join-Path $releaseRoot $ArchiveName))
  if (![string]::Equals([System.IO.Path]::GetDirectoryName($destination), $releaseRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid release destination.' }
  $temporary = Join-Path $releaseRoot ([guid]::NewGuid().ToString() + '.zip')
  $archive = [System.IO.Compression.ZipFile]::Open($temporary, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($file in $Files) {
      $name = $file.FullName.Substring($BasePath.Length + 1).Replace('\', '/')
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $name, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally { $archive.Dispose() }
  Move-Item -LiteralPath $temporary -Destination $destination -Force
  Get-Item -LiteralPath $destination | Select-Object Name,Length
}

# Explicit source allowlist excludes credentials, local data, caches and release files.
$sourceFiles = @()
foreach ($directory in @('src','public','netlify','supabase','tests','scripts','docs','.github')) {
  $sourceFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot $directory) -File -Recurse -Force
}
foreach ($filename in @('index.html','package.json','package-lock.json','vite.config.js','playwright.config.js','playwright.pages.config.js','netlify.toml','.env.example','.gitignore','README.md')) {
  $sourceFiles += Get-Item -LiteralPath (Join-Path $projectRoot $filename) -Force
}
New-ReleaseArchive 'litverse-source.zip' $projectRoot $sourceFiles
New-ReleaseArchive 'litverse-github-pages.zip' $pagesRoot (Get-ChildItem -LiteralPath $pagesRoot -File -Recurse -Force)
