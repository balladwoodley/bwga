# BWGA

BWGA reads GitHub profiles like theories of mind. It inspects public repos, READMEs, and file trees to separate thesis from mechanism, score buildability, assign an overall workhorse rating, and compare two usernames side by side with a calibrated synthesis.

## What It Does

- Pulls public GitHub profile and repository data
- Reads repository trees and README content
- Sorts repos into strategic framing, executable mechanism, or sketch energy
- Produces a calibrated top-line identity summary
- Compares two GitHub usernames at the profile level

## Files

- `index.html`: app shell
- `styles.css`: interface styling
- `app.js`: scoring, synthesis, and GitHub fetch logic
- `serve.ps1`: tiny local static server for testing

## Run Locally

From PowerShell:

```powershell
.\serve.ps1
```

Then open:

`http://localhost:4173/`
