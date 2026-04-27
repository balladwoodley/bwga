$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 4173)
$listener.Start()

Write-Host "BWGA server running at http://localhost:4173/"

$contentTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
}

function Send-Response {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [byte[]]$Body,
    [string]$ContentType
  )

  $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Length: $($Body.Length)`r`nContent-Type: $ContentType`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()

      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        Send-Response -Stream $stream -StatusCode 400 -StatusText "Bad Request" -Body @() -ContentType "text/plain; charset=utf-8"
        continue
      }

      while ($true) {
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) {
          break
        }
      }

      $parts = $requestLine.Split(" ")
      $method = $parts[0]
      $path = if ($parts.Length -gt 1) { $parts[1] } else { "/" }

      if ($method -ne "GET") {
        $body = [System.Text.Encoding]::UTF8.GetBytes("Method not allowed")
        Send-Response -Stream $stream -StatusCode 405 -StatusText "Method Not Allowed" -Body $body -ContentType "text/plain; charset=utf-8"
        continue
      }

      $relative = $path.Split("?")[0].TrimStart("/")
      if ([string]::IsNullOrWhiteSpace($relative)) {
        $relative = "index.html"
      }

      $relative = $relative.Replace("/", "\")
      $fullPath = Join-Path $root $relative
      $resolvedRoot = [System.IO.Path]::GetFullPath($root)
      $resolvedPath = [System.IO.Path]::GetFullPath($fullPath)

      if (-not $resolvedPath.StartsWith($resolvedRoot)) {
        Send-Response -Stream $stream -StatusCode 403 -StatusText "Forbidden" -Body @() -ContentType "text/plain; charset=utf-8"
        continue
      }

      if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("Not found")
        Send-Response -Stream $stream -StatusCode 404 -StatusText "Not Found" -Body $body -ContentType "text/plain; charset=utf-8"
        continue
      }

      $extension = [System.IO.Path]::GetExtension($resolvedPath).ToLowerInvariant()
      $contentType = $contentTypes[$extension]
      if (-not $contentType) {
        $contentType = "application/octet-stream"
      }

      $bytes = [System.IO.File]::ReadAllBytes($resolvedPath)
      Send-Response -Stream $stream -StatusCode 200 -StatusText "OK" -Body $bytes -ContentType $contentType
    }
    finally {
      if ($stream) {
        $stream.Dispose()
      }
      $client.Close()
    }
  }
}
finally {
  $listener.Stop()
}
