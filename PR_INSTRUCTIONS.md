Branch and PR instructions

Branch name suggestion:
remove-ntt-and-sih3-attr-table-fixes

Commit message suggestion:
Remove Gempa NTT & Finite Fault NTT; enable SIH3 attribute table and infer props; FSVA popup/legend centering

Files changed (reviewed):
- index.html
- assets/js/map-core.js
- assets/js/attribute-table.js
- assets/css/app.css
- README.md
- (deleted) assets/js/gempa-ntt.js
- (deleted) assets/js/finite-fault-ntt.js

Commands to run locally:

```bash
git checkout -b remove-ntt-and-sih3-attr-table-fixes
# review changes
git add index.html assets/js/map-core.js assets/js/attribute-table.js assets/css/app.css README.md
git rm assets/js/gempa-ntt.js assets/js/finite-fault-ntt.js
git commit -m "Remove Gempa NTT & Finite Fault NTT; enable SIH3 attribute table and infer props; FSVA popup/legend centering"
git push -u origin remove-ntt-and-sih3-attr-table-fixes
```

Create PR (GitHub web) or via `gh` CLI:

```bash
gh pr create --title "Remove Gempa NTT & enable SIH3 attribute table" \
  --body "Removes Gempa NTT & Finite Fault NTT layers and references; enables dynamic SIH3 attribute table support and infers properties when not declared; centers FSVA popup/legend source text. Please verify UI and layer behavior before merge." \
  --base main
```

Verification steps (locally in browser):
1. Reload site.
2. Open Layer Catalog and enable a SIH3 layer (e.g., "Titik Sampling Kualitas Air").
3. Click the attribute table icon for that layer — table should open and list attributes.
4. Open FSVA layer and click a feature — popup width and source text should be centered.
5. Confirm Gempa NTT and Finite Fault NTT entries no longer appear in Layer Catalog and no JS errors in console.

If you'd like, I can also prepare a minimal PR description and push changes (I cannot run git from here). Tell me when you're ready or if you want me to adjust the commit message.