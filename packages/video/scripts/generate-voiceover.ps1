$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$outputDir = Join-Path $PSScriptRoot "..\public\audio"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$lines = [ordered]@{
  "01-intro.wav" = "Welcome to Stone O S, the workflow from raw block to revenue. All data shown is fictional."
  "02-dashboard.wav" = "Start each shift in My Work. The Control Room combines live stock, production queues and dispatch activity, then highlights the next operational action."
  "03-receive.wav" = "Record a block when it physically enters the yard. Stone O S makes it available in Raw Yard immediately and creates a traceable goods receipt."
  "04-cutting.wav" = "Allocate an eligible block to B twenty one and record runtime. On completion, enter total and good slabs. Stone O S creates serials, preserves the parent block link and records damaged pieces."
  "05-lpm.wav" = "L P M finishing follows three controlled events. Grind slabs awaiting grinding, confirm epoxy after coating, then polish epoxy applied slabs into finished stock. Stage, location and reservation must agree at every handoff."
  "06-inventory.wav" = "Inventory is a live workflow state. Open any slab to trace backward to its block and production runs, then forward to customer reservation and delivery. Corrections remain visible."
  "07-sales.wav" = "Reserve specific sale ready slabs for a customer. Dispatch only pieces physically loaded, and keep the remainder reserved. Invoices and payments remain linked to the same material identity."
  "08-roles.wav" = "Operators record production, supervisors move material, managers control exceptions, and owners retain final authority."
}

foreach ($entry in $lines.GetEnumerator()) {
  $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $speaker.Rate = 0
  $speaker.Volume = 100
  $path = Join-Path $outputDir $entry.Key
  $speaker.SetOutputToWaveFile($path)
  $speaker.Speak($entry.Value)
  $speaker.Dispose()
}

Write-Output "Generated $($lines.Count) narration files in $outputDir"
