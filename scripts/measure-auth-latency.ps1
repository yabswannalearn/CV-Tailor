param(
    [string]$BaseUrl = "http://localhost:3000",
    [string]$ApiPrefix = "/api",
    [string]$Email = $env:CV_TAILOR_TEST_EMAIL,
    [string]$Password = $env:CV_TAILOR_TEST_PASSWORD,
    [int]$WarmRuns = 3
)

$ErrorActionPreference = "Stop"

if (-not $Email -or -not $Password) {
    throw "Set CV_TAILOR_TEST_EMAIL and CV_TAILOR_TEST_PASSWORD to a non-production test account."
}

$base = $BaseUrl.TrimEnd("/")
$prefix = if ($ApiPrefix) { "/" + $ApiPrefix.Trim("/") } else { "" }
$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress

Invoke-WebRequest -UseBasicParsing -Uri "$base$prefix/auth/login" -Method Post -ContentType "application/json" -Body $loginBody -WebSession $session | Out-Null

$paths = @(
    "/auth/me",
    "/profile/me",
    "/presets",
    "/tracker/",
    "/tracker/stats"
)

$results = [System.Collections.Generic.List[object]]::new()
for ($run = 0; $run -le $WarmRuns; $run++) {
    $phase = if ($run -eq 0) { "first-pass" } else { "warm-$run" }
    foreach ($path in $paths) {
        $watch = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri "$base$prefix$path" -WebSession $session
            $watch.Stop()
            $results.Add([pscustomobject]@{
                phase = $phase
                path = $path
                status = [int]$response.StatusCode
                duration_ms = [math]::Round($watch.Elapsed.TotalMilliseconds, 1)
                response_bytes = $response.RawContentLength
            })
        } catch {
            $watch.Stop()
            $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
            $results.Add([pscustomobject]@{
                phase = $phase
                path = $path
                status = $status
                duration_ms = [math]::Round($watch.Elapsed.TotalMilliseconds, 1)
                response_bytes = 0
            })
        }
    }
}

$results | Format-Table -AutoSize
