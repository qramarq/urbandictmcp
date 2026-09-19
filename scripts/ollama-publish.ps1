param(
  [Parameter(Mandatory = $true)]
  [string]$Namespace,

  [string]$ModelName = "urbandictmcp",
  [string]$Tag = "qwen3-0.6b",
  [string]$Modelfile = "ollama/Modelfile",
  [switch]$Push
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  throw "Ollama was not found on PATH. Install Ollama and sign in before running this script."
}

if (-not (Test-Path -LiteralPath $Modelfile)) {
  throw "Modelfile not found: $Modelfile"
}

$localModel = "${ModelName}:${Tag}"
$remoteModel = "${Namespace}/${ModelName}:${Tag}"

ollama pull qwen3:0.6b
ollama create $localModel -f $Modelfile
ollama cp $localModel $remoteModel

if ($Push) {
  ollama push $remoteModel
} else {
  Write-Host "Created $remoteModel locally."
  Write-Host "Run with: ollama run $remoteModel"
  Write-Host "Publish with: ollama push $remoteModel"
}
