$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$pdfDir = Join-Path $repoRoot 'pdf'
$session = 'sop-pdf-build'
$portProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$portProbe.Start()
$port = ([System.Net.IPEndPoint]$portProbe.LocalEndpoint).Port
$portProbe.Stop()
$baseUrl = "http://127.0.0.1:$port"
$server = $null

New-Item -ItemType Directory -Force -Path $pdfDir | Out-Null

$jobs = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'content\sops') -Filter '*.json' |
  ForEach-Object { (Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json).sops } |
  ForEach-Object {
    [pscustomobject]@{
      id = $_.id
      slug = $_.slug
      file = "$($_.id)-$($_.slug).pdf"
    }
  }
$expectedFiles = @($jobs | ForEach-Object { $_.file })
$resolvedRepo = (Resolve-Path -LiteralPath $repoRoot).Path
Get-ChildItem -LiteralPath $pdfDir -Filter '*.pdf' -File | Where-Object {
  $_.Name -notin $expectedFiles
} | ForEach-Object {
  $resolvedPdf = (Resolve-Path -LiteralPath $_.FullName).Path
  if (-not $resolvedPdf.StartsWith($resolvedRepo, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove PDF outside the SOP repository: $resolvedPdf"
  }
  Remove-Item -LiteralPath $resolvedPdf -Force
}
Push-Location $repoRoot
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'HTML build failed.' }

  $serverLog = Join-Path $env:TEMP 'akra-sop-pdf-http.log'
  $serverErrorLog = Join-Path $env:TEMP 'akra-sop-pdf-http-error.log'
  $server = Start-Process -FilePath 'python' `
    -ArgumentList @('-m', 'http.server', "$port", '--bind', '127.0.0.1') `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $serverLog `
    -RedirectStandardError $serverErrorLog `
    -PassThru

  $serverReady = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri "$baseUrl/index.html" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        $serverReady = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $serverReady) { throw 'Local SOP server did not become ready.' }

  $openOutput = & npm.cmd exec -- playwright-cli --session $session open "$baseUrl/index.html" 2>&1
  $openOutput | Write-Output
  if ($LASTEXITCODE -ne 0 -or ($openOutput -join "`n") -match '### Error') {
    throw 'Playwright session failed to open.'
  }
  foreach ($job in $jobs) {
    $jobCode = "async (page) => { await page.goto('$baseUrl/sops/$($job.slug).html'); await page.locator('img').evaluateAll((images) => images.forEach((image) => { image.loading = 'eager'; })); await page.waitForTimeout(500); await page.emulateMedia({ media: 'print' }); await page.locator('.document-control').evaluateAll((details) => details.forEach((detail) => { detail.open = true; })); const printProblemsVisible = await page.locator('.print-problems').evaluateAll((elements) => elements.every((element) => getComputedStyle(element).display !== 'none')); if (!printProblemsVisible) throw new Error('Print troubleshooting content is hidden'); const brokenImages = await page.locator('img').evaluateAll((images) => images.filter((image) => !image.complete || image.naturalWidth === 0).length); if (brokenImages) throw new Error('Print page has broken images'); await page.pdf({ path: 'pdf/$($job.file)', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: '<style>div{width:100%;padding:0 9mm;text-align:center;color:#555;font:8px Arial,sans-serif}</style><div>AKRA SOP | $($job.id) | <span class=pageNumber></span> / <span class=totalPages></span></div>' }); await page.emulateMedia({ media: 'screen' }); }"
    $runOutput = & npm.cmd exec -- playwright-cli --session $session run-code $jobCode 2>&1
    $runOutput | Write-Output
    if ($LASTEXITCODE -ne 0 -or ($runOutput -join "`n") -match '### Error') {
      throw "PDF generation failed for $($job.file)."
    }
  }

  & node (Join-Path $PSScriptRoot 'check-pdfs.mjs') --write-manifest
  if ($LASTEXITCODE -ne 0) { throw 'PDF verification failed.' }
  Write-Output "Generated and verified $($jobs.Count) A5 PDFs in $pdfDir"
} finally {
  & npm.cmd exec -- playwright-cli --session $session close 2>$null
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
  }
  Pop-Location
}
