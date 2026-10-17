param([ValidateRange(1024, 65535)][int]$Port = 8010, [string]$DataDirectory)

$ErrorActionPreference = 'Stop'
$crmProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$crmPython = Join-Path $crmProjectRoot '.venv\Scripts\python.exe'
Push-Location -LiteralPath $crmProjectRoot
try {
    if (-not (Test-Path -LiteralPath $crmPython)) {
        python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated Python environment.' }
    }
    & $crmPython -m pip install --disable-pip-version-check -q -r experiments/chatgpt_plan/requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Could not install the AI proof dependencies.' }
    if ($DataDirectory) {
        & $crmPython -m experiments.chatgpt_plan.app --port $Port --data-directory $DataDirectory
    } else {
        & $crmPython -m experiments.chatgpt_plan.app --port $Port
    }
    if ($LASTEXITCODE -ne 0) { throw 'The local AI proof server exited with an error.' }
}
finally {
    Pop-Location
}
