$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$outputDir = Join-Path $PSScriptRoot "..\public\audio"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$lines = [ordered]@{
  "marketing-01-intro.wav" = "Stone O S turns live events into decisions before delays become losses."
  "marketing-02-control-room.wav" = "Stone O S gives every shift one operational pulse. Live stock, work in progress, finished inventory, open orders and next actions resolve into the same trusted control room."
  "marketing-03-predictive.wav" = "Predictive analytics turns live workflow pressure into an early warning system. Stone O S projects seven day finished stock, dispatch coverage, bottleneck risk and time to sale, then explains the action behind each forecast."
  "marketing-04-ai.wav" = "The A I dashboard adapts the same factory truth to each decision maker, with role aware sensemaking, a spatial factory twin and explainable next best actions."
  "marketing-05-operations.wav" = "Execution stays equally disciplined. Receive the raw block, create registered slabs on B twenty one, then move them through grinding, epoxy and polishing as separate, traceable production events."
  "marketing-06-inventory.wav" = "Every slab keeps its genealogy. Trace backward to the block and production runs, then forward to reservation and delivery, without waiting for an end of day spreadsheet."
  "marketing-07-commercial.wav" = "Reservations protect specific finished slabs through partial dispatch, billing and payment, connecting the customer promise to the same material trail from the factory floor."
  "marketing-08-outro.wav" = "Stone O S. One operational truth, predictive decisions and complete traceability, from raw block to revenue."
}

foreach ($entry in $lines.GetEnumerator()) {
  $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $speaker.Rate = 1
  $speaker.Volume = 100
  $path = Join-Path $outputDir $entry.Key
  $speaker.SetOutputToWaveFile($path)
  $speaker.Speak($entry.Value)
  $speaker.Dispose()
}

Write-Output "Generated $($lines.Count) partner narration files in $outputDir"
